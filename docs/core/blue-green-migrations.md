# Blue/green deploy mechanics and migrations

How a production deploy runs once the server exists: the only supported flow is
a GitHub push to `main` → `ci.yml` → `cd.yml` builds and pushes images to GHCR →
SSHes to the VPS → `infra/vps/deploy.sh` deploys the inactive color,
health-checks it, smoke-tests it, canary-switches Caddy, verifies, then fully
switches — leaving the previous color running as a fast rollback target until a
later scheduled cleanup. This doc also holds the migration discipline
(expand/contract). Server setup and the first production cutover are in
[provisioning.md](provisioning.md); the CI/CD chain, variables and state files
are in [deploy.md](deploy.md). Full design rationale (7-lens multi-agent review,
every HIGH finding and how it was resolved) lives in
[`.artifacts/2026/08/20260810--bluegreen-zero-downtime-deploy/plan.md`](../../.artifacts/2026/08/20260810--bluegreen-zero-downtime-deploy/plan.md)
as history — this doc is the operator-facing "how it actually works and how to
run it" companion, not a restatement of that plan's reasoning.

## How a deploy actually runs

```
push to main
  -> ci.yml (unchanged)
  -> cd.yml
       gate            verify the workflow_run is legit (push, main, same repo)
       build-push      3-way matrix (api/web/workers), amd64 native, -> GHCR
       sync-and-deploy
         staleness guard   git merge-base --is-ancestor against the VPS's
                           current_sha (workflow_run events can land out of
                           push order)
         rsync infra/vps/  -> /home/deploy/biasmarket/ (key A, rrsync-restricted)
         deploy.sh <sha>   launched detached via the SSH dispatcher (key B),
                            polled for completion over a second SSH call
                            -> deploy.sh schedules its own old-color cleanup,
                               ~30 min later (see "Scheduled cleanup" below)
cleanup-fallback.yml   hourly cron backstop: deploy.sh --cleanup, idempotent
                        no-op unless the schedule above was lost (e.g. reboot),
                        and a no-op regardless if the rollback target isn't
                        yet 30 minutes old (cmd_cleanup's own age check)
```

`deploy.sh`'s own phases (see `infra/vps/deploy.sh` and `infra/vps/lib/*.sh` for
the actual implementation, this is the summary):

1. Reconcile `state/current_color` against the Caddy config that's actually live
   — abort loud on mismatch rather than guess.
2. Assert `env/shared.env`'s checksum against the recorded baseline.
3. Determine the candidate color (whichever isn't currently live), refuse into a
   slot still recorded as `state/rollback_target` unless `--force`.
4. Migration phase (see below) against the candidate's new image.
5. Start the candidate's `api-<color>`/`web-<color>`/`workers-<color>`.
6. Wait for Docker health status on all three (bounded timeout).
7. Pre-switch smoke tests, direct-to-container (bypasses Caddy entirely), 3x
   retry with backoff.
8. Write a weighted-canary Caddy config (10% to the candidate), reload, hold
   briefly, re-run smoke tests against the **public** domain, 3x retry.
9. After the canary is verified, write the 100% candidate Caddy config, reload,
   then commit `state/current_color`/`current_sha`/`rollback_target` and append
   to `releases/history.log`. `deploy.sh` runs no further smoke test after this
   full switch. The previous color is left running as the rollback target;
   `deploy.sh` also schedules its own cleanup of it ~30 minutes later (see
   "Scheduled cleanup" below), best-effort and non-fatal to the deploy if
   scheduling itself fails.
10. On any failure at steps 4–9: tear down **only** the candidate; the previous
    color and its Caddy routing are never touched.
11. Always, on every exit path: write `state/last_deploy_result` (SHA, outcome,
    phase, timestamp — nothing from `env/*.env`).
12. On success only, right after committing state (step 9): self-schedule the
    old color's cleanup 30 minutes out (`lib/cleanup_schedule.sh`'s
    `schedule_cleanup`), superseding any still-pending schedule from a prior
    deploy first. Never fatal to the deploy itself if scheduling fails. The
    mechanism and its three state files are described in
    [Scheduled cleanup](#scheduled-cleanup) below.
13. `deploy.sh --cleanup` (whether fired by step 12's schedule, the hourly
    `cleanup-fallback.yml`, or run manually) always re-reads
    `state/current_color`/`state/rollback_target` fresh at invocation time —
    never trusts anything captured when it was scheduled — and no-ops safely if
    there's nothing to clean up. This is what makes an in-window manual
    `--rollback` safe without any bespoke cancellation logic: it rewrites
    `rollback_target` to whatever's now correctly benched, and whichever cleanup
    eventually fires tears down the right color regardless of what was true when
    it was scheduled.

`deploy.sh` reports each phase with phase and total elapsed seconds. Health
waits also emit a bounded progress line every 15 seconds, so image pulls,
migrations, and container health checks are visibly active without inventing a
misleading percentage.

Full design, including the state-machine edge cases (VPS reboot mid-window, two
deploys landing in rapid succession, `deploy.sh` itself being rsynced
mid-window) and why this isn't built on `systemd-run`/a systemd timer:
[`2026-08-10-server-side-cleanup-scheduling-plan.md`](../../.artifacts/2026/08/20260810--server-side-cleanup-scheduling/plan.md).

### Scheduled cleanup

`cmd_deploy` schedules the old color's teardown itself, right after state is
committed — no GitHub Actions runner sits idle waiting for it. Mechanism
(`infra/vps/lib/cleanup_schedule.sh`):

- `schedule_cleanup()` backgrounds a detached
  `setsid bash -c 'sleep 1800;
exec "$0" --cleanup' "$ROOT_DIR/deploy.sh"`,
  closing the inherited deploy-lock file descriptor first (a plain background
  fork would otherwise hold the same `flock` open for the full 30 minutes). The
  30-minute chain always execs into whatever `deploy.sh` is currently on disk
  when it fires, not a stale in-memory copy, and `cmd_cleanup` re-reads
  `current_color`/ `rollback_target` fresh at that point — so an in-window
  `deploy.sh
--rollback` needs no special-case cancellation; the scheduled
  cleanup just tears down whatever is still recorded as the rollback target when
  it runs.
- `cancel_scheduled_cleanup()` runs first, superseding any still-pending
  schedule from a previous deploy (relevant on a manual `--force` deploy into an
  already-pending slot) — it `kill -TERM`s the previous chain's PID after
  confirming via `/proc/$pid/cmdline` that the PID hasn't been recycled by an
  unrelated process in the meantime.
- Both calls are best-effort and guarded (`|| log_warn ... || true`): scheduling
  failure never turns an already-successful cutover into a reported deploy
  failure. A stray, short-lived orphaned `flock` process transiently visible in
  `ps` shortly after a supersede is expected — not a symptom to chase — since a
  `kill -TERM` on the chain's `bash -c` parent doesn't reach a child `flock`
  that has already forked to wait on the lock.

Three new state files, same "never synced/committed" treatment as the rest of
`state/`, left in place after firing as a breadcrumb (not deleted on completion,
same as `deploy.lock.meta`):

- `state/scheduled_cleanup.pid` — PID of the detached chain. A stale PID left
  behind after its process has long exited is the normal steady state, not an
  error.
- `state/scheduled_cleanup.meta` — `pid=`, `scheduled_by=<sha>`,
  `scheduled_at=`/`fires_at=` (UTC), `rollback_target_at_schedule=<blue|green>`.
  **`rollback_target_at_schedule` is a snapshot of what was benched when this
  was scheduled, not authoritative at fire time** — `cmd_cleanup` always
  re-reads `state/rollback_target` fresh when it actually runs, and that value
  can differ if a `--rollback` happened in between. Answers "is a cleanup
  pending, for what, and when" for an operator SSHed into the VPS, without
  reconstructing it from `releases/history.log` by hand.
- `state/scheduled_cleanup.log` — stdout/stderr of the detached chain,
  overwritten fresh on every new schedule. The only place a crash inside the
  backgrounded process (e.g. a version-mismatched `lib/*.sh` sourced mid-rsync
  of a concurrent deploy) is visible — it isn't wired into
  `state/last_deploy_result` or `releases/history.log`.

`state/rollback_target_set_at` (epoch seconds) is written atomically alongside
`state/rollback_target` every time the latter is set (`cmd_deploy`,
`cmd_rollback`) or cleared (`cmd_cleanup`, `cmd_bootstrap`). `cmd_cleanup`
checks it before tearing anything down: if the recorded target is younger than
`CLEANUP_MIN_AGE_SECONDS` (1800, matching the self-scheduled delay), it logs and
no-ops instead of proceeding. This is what actually keeps the
30-minute-rollback-window promise regardless of caller — the self-scheduled fire
above only ever runs at/after the window by construction, but the hourly
fallback below has no such guarantee and would otherwise erase a fresh rollback
target on whichever tick happens to land first after a deploy.

Backstop:
[`.github/workflows/cleanup-fallback.yml`](../../.github/workflows/cleanup-fallback.yml)
runs `deploy.sh --cleanup` on an hourly `schedule:` cron (plus
`workflow_dispatch:` for a manual run), declaring `environment: production` so
the `DEPLOY_SSH_*` secrets are visible to it. No concurrency group needed —
`cmd_cleanup`'s own `flock` already serializes it against everything else. This
closes the one gap the server-side schedule doesn't cover on its own: a VPS
reboot (or OOM kill) during the 30-minute window loses the scheduled process
silently, same as a GitHub Actions outage lost the old `sleep
1800`-based job —
the fallback catches it within roughly an hour instead of never, and the age
check above means an early fallback tick is always a safe no-op rather than a
premature teardown.

Full design rationale, including every edge case above (rollback mid-window,
`deploy.sh` itself being rsynced mid-window, why this isn't built on
`systemd-run`/a systemd timer):
[`2026-08-10-server-side-cleanup-scheduling-plan.md`](../../.artifacts/2026/08/20260810--server-side-cleanup-scheduling/plan.md).

## Migration discipline (expand/contract)

Migrations run **once**, as their own `deploy.sh` phase, against the candidate's
new image, before the candidate's containers start — never automatically on
every container boot (that was the old `infra/docker/api.Dockerfile` behavior;
see [`deploy.md`](deploy.md)'s note on what changed). This buys time and a real
health-check/smoke-test gate before a bad migration can affect live traffic, but
it does **not** make an old-color-incompatible schema change safe by itself: for
the duration between the migration applying and the old color being torn down,
**the old color is still running against the new schema**. If a migration isn't
backward compatible with the code the old color is still running, you will break
live traffic even though the migration technically "succeeded."

The rule: every migration must be safe to apply while the **previous** release's
code is still serving traffic. That's the entire meaning of expand/contract:

- **Expand** — add the new column/table/type as nullable or with a default,
  additive only. Ship the code that writes to both old and new shapes.
- **Migrate data** — backfill, in a separate migration/step, not entangled with
  the schema change.
- **Contract** — only in a _later_ deploy, once you're certain no old-color code
  is relying on the old shape anymore, drop the old column/table/type.

`deploy.sh`'s static gate (see `infra/vps/lib/migrate.sh`) scans every _pending_
migration's `migration.sql` for `DROP TABLE`, `DROP COLUMN`, `DROP TYPE`, and
`ALTER COLUMN ... TYPE`, and refuses to apply it without an explicit
`--i-understand-this-is-destructive` flag. This catches the mechanical keyword
class. It does **not** verify semantic backward compatibility — e.g. a
`NOT NULL` column added without a `DEFAULT` will pass the gate (no `DROP`), but
still breaks the previous color's `INSERT` statements the instant it's applied.
That's what this checklist is for.

### Worked example 1 — a destructive drop with no phased deprecation

[`20260808192135_delete_payment_proof`](../../packages/db/prisma/migrations/20260808192135_delete_payment_proof/migration.sql):

```sql
ALTER TABLE "PaymentProof" DROP CONSTRAINT "PaymentProof_orderId_fkey";
ALTER TABLE "PaymentProof" DROP CONSTRAINT "PaymentProof_reviewedBy_fkey";
DROP TABLE "PaymentProof";
DROP TYPE "ProofStatus";
```

Shipped in one migration, no deprecation window. Under blue/green as designed,
this would trip the static gate (`DROP TABLE`/`DROP TYPE`) and require
`--i-understand-this-is-destructive` — which is correct, because the real
question is unanswered: is any code path in the **old** color (still serving
traffic during the switch/canary window) still reading or writing
`PaymentProof`? If yes, this migration is not safe to run before that old code
is gone, full stop, regardless of the override flag. The override flag is for
"I've checked, this really is safe" (e.g. the table was already unused, replaced
by `PaymentProof`'s buyer-facing successor in an earlier, separate deploy) — not
for "I'm in a hurry."

The safe shape, phased across at least two deploys:

1. **Deploy N**: ship code that no longer reads/writes `PaymentProof` (cut over
   to whatever replaced it). No migration yet.
2. **Deploy N+1** (once N has been live long enough that no rollback to pre-N
   code is plausible): the actual `DROP TABLE`/`DROP TYPE` migration, now safe
   because no live code path — old color or new — touches it.

### Worked example 2 — a column type change with no cast path

[`20260730205809_add_payment_methods`](../../packages/db/prisma/migrations/20260730205809_add_payment_methods/migration.sql):

```sql
CREATE TYPE "PaymentMethodType" AS ENUM ('YAPE', 'PLIN', 'TRANSFER', 'CASH');
ALTER TABLE "OrderPayment" ADD COLUMN "method" "PaymentMethodType";
ALTER TABLE "PaymentMethodConfig" DROP COLUMN "method",
ADD COLUMN "method" "PaymentMethodType" NOT NULL;
```

The `PaymentMethodConfig` half drops the old `method` column and replaces it
with a differently-typed one in the same migration — Prisma's own generated
comment says as much ("the column would be dropped and recreated"). Trips the
gate on `DROP COLUMN`. Safe phased shape:

1. **Deploy N**: additive only — `CREATE TYPE`, add the new
   `method_v2 PaymentMethodType` column (nullable), ship code that writes both
   `method` (old, string) and `method_v2` (new, enum) on every write.
2. **Backfill**: a one-off script/migration that populates `method_v2` for
   existing rows from `method`.
3. **Deploy N+1**: ship code that reads/writes only `method_v2`, old color no
   longer in the rollback window.
4. **Deploy N+2**: `DROP COLUMN method`, rename `method_v2` -> `method` if
   desired.

### BullMQ job-schema addendum

The same discipline extends to `packages/queue/src/jobs/*.ts` payload schemas —
and here the overlap window is **longer** than for the database: both colors'
`workers-blue`/`workers-green` stay live consumers of the same unnamespaced
BullMQ queues for as long as the old color stays up (until explicit cleanup, ~30
minutes by default, not just during the deploy instant). A job enqueued by the
new color's `api-<color>` can be picked up by the **old** color's
`workers-<old-color>`, and vice versa, for that entire window.

Concretely, for a zod-validated payload like
[`sendEmailParamsSchema`](../../packages/queue/src/jobs/mailer.jobs.ts): a new
required field added to the schema and started immediately will fail validation
the moment the _old_ color's consumer (still running the old schema) picks up a
job enqueued by the _new_ color's producer. Same rule as the database: new
fields must be `.optional()` (with the producer-side code defaulting it if
needed) for at least one full deploy cycle — the schema only becomes required in
a later deploy, once you're confident no old-color consumer is still in
rotation.

## First production cutover (T11)

Moved to [provisioning.md](provisioning.md#first-production-cutover-t11): the
gate checklist, the `deploy.sh --bootstrap` command, the verify block and the
bootstrap lessons. Server provisioning (Terraform, cloud-init and the manual
steps) lives there too.

## Manual operations reference

```bash
# from /home/deploy/biasmarket, as the deploy user (or via the restricted SSH keys
# from CI — see infra/vps/bin/ssh-deploy-dispatcher.sh for what's reachable
# that way)
./deploy.sh <40-hex-sha>                                 # normal deploy
./deploy.sh <sha> --force                                 # override the rollback-target guard
./deploy.sh <sha> --i-understand-this-is-destructive       # override the migration gate
./deploy.sh --rollback                                     # flip back to the sidelined color
./deploy.sh --cleanup                                       # tear down the sidelined color now
./deploy.sh --print-current-sha                             # read-only
./deploy.sh --wait-for-result <sha> [timeout-seconds]        # read-only, blocks
./deploy.sh --bootstrap <sha>                                # first cutover only, see provisioning.md
```

`--bootstrap` refuses to run once `state/current_color` exists, so it is not a
disaster-recovery shortcut on a live server; for recovery from a lost server see
[operations.md](operations.md#restore).

See [`incident-response.md`](incident-response.md) for the rollback runbook and
what happens when a deploy gets stuck.

## Related

- [deploy.md](deploy.md) for the CI/CD chain, variables, state files and the
  runtime layout.
- [provisioning.md](provisioning.md) for server setup and the first cutover.
- [operations.md](operations.md) for the shared services and restore.
- [incident-response.md](incident-response.md) for rollback and alerts.
