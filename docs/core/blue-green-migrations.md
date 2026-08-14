# Blue/green deploys, VPS provisioning, and migration discipline

Covers the production deploy flow that replaced `git pull && pnpm docker:prod`
(see [`deploy.md`](deploy.md) for that superseded flow, kept for anyone not yet
cut over): GitHub push to `main` → `ci.yml` → `cd.yml` builds and pushes images
to GHCR → SSHes to the VPS → `infra/vps/deploy.sh` deploys the inactive color,
health-checks it, smoke-tests it, canary-switches Caddy, verifies, then fully
switches — leaving the previous color running as a fast rollback target until a
later scheduled cleanup. Full design rationale (7-lens multi-agent review, every
HIGH finding and how it was resolved) lives in
[`docs/plans/2026-08-10-bluegreen-zero-downtime-deploy-plan.md`](../plans/2026-08-10-bluegreen-zero-downtime-deploy-plan.md)
— this doc is the operator-facing "how it actually works and how to run it"
companion, not a restatement of that plan's reasoning.

## How a deploy actually runs

```
push to main
  -> ci.yml (unchanged)
  -> cd.yml
       gate            verify the workflow_run is legit (push, main, same repo)
       build-push      3-way matrix (api/web/workers), arm64 native, -> GHCR
       sync-and-deploy
         staleness guard   git merge-base --is-ancestor against the VPS's
                           current_sha (workflow_run events can land out of
                           push order)
         rsync infra/vps/  -> /opt/biasmarket/ (key A, rrsync-restricted)
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

   `state/current_color`/`current_sha`/`rollback_target`, append to
   `releases/history.log`. Previous color is left running as the rollback target
   — `deploy.sh` also schedules its own cleanup of it ~30 minutes later (see
   "Scheduled cleanup" below), best-effort and non-fatal to the deploy if
   scheduling itself fails.
9. On any failure at steps 4–8: tear down **only** the candidate; the previous
   color and its Caddy routing are never touched.
10. Always, on every exit path: write `state/last_deploy_result` (SHA, outcome,
    phase, timestamp — nothing from `env/*.env`).
11. On success only, right after committing state (step 8): self-schedule the
    old color's cleanup 30 minutes out — `setsid`-detached, same shape as the
    SSH dispatcher's own `launch()` (`lib/cleanup_schedule.sh`'s
    `schedule_cleanup`), superseding (`cancel_scheduled_cleanup`) any
    still-pending schedule from a prior deploy first. Never fatal to the deploy
    itself if scheduling fails — see the plan doc referenced below. Three state
    files, same "who/what/since when" spirit as `state/deploy.lock.meta`, none
    of them secret, none deleted on normal completion (left as a breadcrumb):
    - `state/scheduled_cleanup.pid` — the backgrounded process's PID.
    - `state/scheduled_cleanup.meta` — `pid=`, `scheduled_by=<sha>`,
      `scheduled_at=`/`fires_at=` (UTC), and
      `rollback_target_at_schedule=<blue|green>`, the color this schedule
      intends to tear down. **This last field is a snapshot, not authoritative**
      — the cleanup that actually fires re-reads `state/rollback_target` fresh
      (step 12), so if a `--rollback` happened in between, the real target can
      differ from what's recorded here.
    - `state/scheduled_cleanup.log` — the backgrounded process's own
      stdout/stderr, overwritten fresh on every new schedule.

    A stray orphaned `flock` process transiently visible in `ps` shortly after
    one schedule supersedes another is expected (a `kill -TERM` racing a process
    already blocked inside `acquire_deploy_lock`), not a symptom to chase.
12. `deploy.sh --cleanup` (whether fired by step 11's schedule, the hourly
    `cleanup-fallback.yml`, or run manually) always re-reads
    `state/current_color`/`state/rollback_target` fresh at invocation time —
    never trusts anything captured when it was scheduled — and no-ops safely if
    there's nothing to clean up. This is what makes an in-window manual
    `--rollback` safe without any bespoke cancellation logic: it rewrites
    `rollback_target` to whatever's now correctly benched, and whichever cleanup
    eventually fires tears down the right color regardless of what was true when
    it was scheduled.

Full design, including the state-machine edge cases (VPS reboot mid-window, two
deploys landing in rapid succession, `deploy.sh` itself being rsynced
mid-window) and why this isn't built on `systemd-run`/a systemd timer:
[`2026-08-10-server-side-cleanup-scheduling-plan.md`](../plans/2026-08-10-server-side-cleanup-scheduling-plan.md).

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
`CLEANUP_MIN_AGE_SECONDS` (1800, matching the self-scheduled delay), it logs
and no-ops instead of proceeding. This is what actually keeps the
30-minute-rollback-window promise regardless of caller — the self-scheduled
fire above only ever runs at/after the window by construction, but the hourly
fallback below has no such guarantee and would otherwise erase a fresh
rollback target on whichever tick happens to land first after a deploy.

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
[`2026-08-10-server-side-cleanup-scheduling-plan.md`](../plans/2026-08-10-server-side-cleanup-scheduling-plan.md).

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

## VPS provisioning (one-time, or after a VPS rebuild)

Written for **Ubuntu 24.04** (matches `deploy.md`'s provisioning assumption —
Oracle Ampere A1, arm64). Run through in order; each step depends on the one
before it. Commands prefixed `# local:` run on your own machine, not the VPS.

Directory layout this builds toward, under a dedicated low-privilege `deploy` OS
user (Docker-group member — **this is root-equivalent in practice**, not a
containment boundary; the real security boundary is SSH-key secrecy and
CI-runner integrity, see the plan doc's decision 10):

```
/opt/biasmarket/
  docker-compose.yml, Caddyfile, deploy.sh, lib/*.sh, bin/*.sh   <- synced by cd.yml (rsync, key A)
  env/{shared,blue.runtime,green.runtime,watchdog}.env            <- real secrets, NEVER synced/committed
  caddy/active/{api,web}.caddy                                    <- generated by deploy.sh, NEVER synced/committed
  state/                                                          <- deploy.sh's own state, NEVER synced/committed
  releases/                                                       <- history.log + pre-migration snapshots
```

### Step 1 — packages, Docker, the `deploy` user

```bash
sudo apt-get update
sudo apt-get install -y rsync openssh-server curl

# Docker Engine + Compose plugin — same install this repo already documents
# in deploy.md step 3:
curl -fsSL https://get.docker.com | sudo sh
# (see https://docs.docker.com/engine/install/ubuntu/ for the manual/apt-repo
# alternative if you'd rather not pipe a script to sh)

sudo useradd --create-home --shell /bin/bash deploy
sudo usermod -aG docker deploy
newgrp docker   # only needed in your own shell if you're testing as `deploy` interactively

sudo mkdir -p /opt/biasmarket/{env,caddy/active,state,releases}
sudo chown -R deploy:deploy /opt/biasmarket
```

### Step 2 — install `rrsync`

Ubuntu's `rsync` package ships `rrsync` gzipped, not on `PATH` — unpack it once
([Ubuntu manpage](https://manpages.ubuntu.com/manpages/noble/man1/rrsync.1.html)):

```bash
sudo sh -c 'gunzip -c /usr/share/doc/rsync/scripts/rrsync.gz > /usr/local/bin/rrsync'
sudo chmod 755 /usr/local/bin/rrsync
rrsync --help   # confirm it runs
```

### Step 3 — generate the two deploy SSH keys

Both ed25519, both **without a passphrase** (used non-interactively by CI).
Generate them somewhere you control — your own machine is fine, they never need
to leave it except as pasted GitHub secrets:

```bash
# local:
ssh-keygen -t ed25519 -N "" -C "biasmarket-deploy-key-a-rsync" -f biasmarket_key_a
ssh-keygen -t ed25519 -N "" -C "biasmarket-deploy-key-b-dispatch" -f biasmarket_key_b
```

This produces 4 files: `biasmarket_key_a[.pub]`, `biasmarket_key_b[.pub]`. The
two **private** key files' contents go into GitHub secrets (Step 6). The two
**public** key files go into the VPS's `authorized_keys` (next step).

### Step 4 — restrict both keys via `authorized_keys`

A single forced-command key restricted to "run deploy.sh" would silently break
the rsync step (`rrsync` and a `command=` dispatcher can't be composed on one
key) — that's why there are two. As the `deploy` user on the VPS:

```bash
sudo -iu deploy
mkdir -p ~/.ssh && chmod 700 ~/.ssh
```

Append two lines to `~/.ssh/authorized_keys` (paste each `.pub` file's content
after the `command=...` prefix shown — see
[sshd's `AUTHORIZED_KEYS FILE FORMAT`](https://man.openbsd.org/sshd#AUTHORIZED_KEYS_FILE_FORMAT)
for what these options mean):

```
command="/usr/local/bin/rrsync /opt/biasmarket/",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA...key-a-contents... biasmarket-deploy-key-a-rsync
command="/opt/biasmarket/bin/ssh-deploy-dispatcher.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA...key-b-contents... biasmarket-deploy-key-b-dispatch
```

```bash
chmod 600 ~/.ssh/authorized_keys
exit   # back to your own sudo-capable user
```

Key B's target script (`/opt/biasmarket/bin/ssh-deploy-dispatcher.sh`) won't
exist yet — it arrives via key A's first rsync (`cd.yml`'s `sync-and-deploy`
job, or a manual first sync, see Step 8). Make it executable once it lands:
`sudo -u deploy chmod +x /opt/biasmarket/bin/ssh-deploy-dispatcher.sh`. The
dispatcher script itself documents its exact allowlist (see the file's header
comment) — it never `eval`s `$SSH_ORIGINAL_COMMAND`, only matches it against
anchored regexes for the handful of literal shapes `cd.yml` sends.

### Step 5 — pin `known_hosts`

Capture once, **verified out-of-band via the Oracle Cloud console** (not blind
first-`ssh-keyscan` trust — an attacker in a position to MITM the very first
connection is exactly the threat model host-key pinning exists for):

```bash
# local:
ssh-keyscan -t ed25519 <vps-ip> > known_hosts_candidate
cat known_hosts_candidate
```

Then, separately, open the VPS instance's detail page in the OCI console — or,
for a stronger check, its
[serial console](https://docs.oracle.com/en-us/iaas/Content/Compute/References/serialconsole.htm)
— and confirm the host key fingerprint shown there matches
`known_hosts_candidate` before trusting it. The verified file's contents become
the `DEPLOY_SSH_KNOWN_HOSTS` GitHub secret (Step 6).

### Step 6 — GitHub: secrets, variables, the `production` environment

Create the environment first — Settings → Environments → New environment → name
it `production`
([GitHub docs](https://docs.github.com/en/actions/how-tos/manage-environments/create-environment)).
`cd.yml`'s `sync-and-deploy` job and `cleanup-fallback.yml`'s job both declare
`environment: production`, which is what makes environment-scoped secrets the
right place (and gives you an optional required-reviewers approval gate for free
if you want one later).

Inside that environment (Settings → Environments → `production` → add secret —
[secrets docs](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)):

| Name                      | Value                                        |
| ------------------------- | -------------------------------------------- |
| `DEPLOY_SSH_HOST`         | VPS hostname/IP                              |
| `DEPLOY_SSH_USER`         | `deploy`                                     |
| `DEPLOY_SSH_KNOWN_HOSTS`  | Contents of the verified file from Step 5    |
| `DEPLOY_SSH_KEY_RSYNC`    | Contents of `biasmarket_key_a` (private key) |
| `DEPLOY_SSH_KEY_DISPATCH` | Contents of `biasmarket_key_b` (private key) |

Repo-level, Settings → Secrets and variables → Actions → **Variables** tab, not
Secrets
([variables docs](https://docs.github.com/en/actions/learn-github-actions/variables))
— `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SENTRY_DSN` are baked into the `web` image
as build ARGs (see `infra/docker/web.Dockerfile`) and are already public,
shipped in every browser bundle, so they don't belong alongside genuinely
sensitive values:

| Name                     |
| ------------------------ |
| `NEXT_PUBLIC_API_URL`    |
| `NEXT_PUBLIC_SENTRY_DSN` |

Set both before the first `cd.yml` run that builds `web`.

### Step 7 — GHCR package visibility (one-time, manual, after the first build)

`cd.yml`'s `build-push` job needs to run once (any push to `main`) before these
packages exist. After that first successful run creates the 3 packages
(`biasmarket-api`, `biasmarket-web`, `biasmarket-workers`), set each to
**public** visibility — this does **not** auto-inherit from the repo being
public
([GitHub docs](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility)):

1. `https://github.com/orgs/bobadilla-tech/packages` (or
   `https://github.com/bobadilla-tech?tab=packages` if it's a user account, not
   an org) → click each of the 3 packages.
2. Package settings (right sidebar) → Danger Zone → Change visibility → Public.

This is what lets the VPS pull images with zero registry credentials. If you
need to keep them private instead, `deploy.sh`/the compose file would need a
`docker login` step added on the VPS with a PAT — not the default path, not
implemented here.

### Step 8 — first sync, env files, systemd units, Kuma monitors

With keys and secrets in place, either push to `main` (lets `cd.yml` do the
first rsync automatically) or sync once by hand to bootstrap faster:

```bash
# local, using key A directly (bypasses CI for a one-time manual bootstrap):
rsync -az \
  --exclude 'env/*.env' \
  --exclude 'state/' \
  --exclude 'caddy/active/*.caddy' \
  --exclude 'releases/' \
  -e "ssh -i biasmarket_key_a -o StrictHostKeyChecking=yes" \
  infra/vps/ deploy@<vps-ip>:.
```

Then, on the VPS as `deploy` (`sudo -iu deploy`, from `/opt/biasmarket`):

```bash
chmod +x bin/ssh-deploy-dispatcher.sh bin/migration-watchdog.sh deploy.sh

# populate real env files — see each .example's header comment for what
# goes in it. shared.env in particular: copy every secret BYTE-FOR-BYTE from
# infra/docker/.env, never regenerate.
cp env/shared.env.example env/shared.env       # then edit
cp env/blue.runtime.env.example env/blue.runtime.env
cp env/green.runtime.env.example env/green.runtime.env
cp env/watchdog.env.example env/watchdog.env   # KUMA_MIGRATION_PUSH_URL comes after Kuma is up, see below
```

Install the migration-watchdog systemd units:

```bash
sudo cp /opt/biasmarket/systemd/biasmarket-migration-watchdog.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now biasmarket-migration-watchdog.timer
sudo systemctl status biasmarket-migration-watchdog.timer   # should show "active (waiting)"
```

This timer is deliberately **not** part of `deploy.sh` itself — a wedged deploy
must not be able to silence its own stuck-migration alarm. If it later fails
silently, check with:
`sudo journalctl -u biasmarket-migration-watchdog.service --since "10 min ago"`.

`uptime-kuma` itself only comes up as part of the
[first production cutover](#first-production-cutover-t11) below
(`deploy.sh --bootstrap` starts it alongside the other always-on infra services,
before the `blue` color) — so `scripts/setup-kuma.ts` can't be run until that's
done. Come back to this once `--bootstrap` has completed: run it from your own
machine or the VPS, wherever you have `pnpm`/`node` and network access to
`https://status.biasmarket.com`:

```bash
KUMA_USERNAME=admin KUMA_PASSWORD='<pick or reuse the existing password>' node scripts/setup-kuma.ts
```

Creates/updates: 4 static per-color internal monitors
(`api-blue`/`api-green`/`web-blue`/`web-green`, replacing the two bare
`api`/`web` hostnames that stop resolving once only the colored services exist),
the external API/Web monitors (unchanged), DB/MinIO (unchanged, no color split),
and the new `migration_pending watchdog` push monitor. The script prints that
push monitor's URL on creation — copy it into
`/opt/biasmarket/env/watchdog.env`'s `KUMA_MIGRATION_PUSH_URL` on the VPS, then
`sudo systemctl restart biasmarket-migration-watchdog.timer` to pick it up. See
[`incident-response.md`](incident-response.md) for what fires when it misses a
heartbeat. Re-run this script again after any VPS rebuild.

## First production cutover (T11)

Manual, supervised, during a low-traffic window — the one deliberate exception
to "no maintenance windows needed" in this whole design, since it's also the
first real end-to-end validation of the mechanism against production data.

Gate on all of (VPS provisioning Steps 1–8 above, in order):

- [ ] `env/shared.env` populated by **verbatim byte-for-byte copy** of every
      secret value from the current `infra/docker/.env` — never
      `pnpm env:init --prod` against this file. See
      `infra/vps/env/shared.env.example`'s header comment for why
      (`CUSTOMER_ACCOUNT_TOKEN_SECRET` specifically).
- [ ] `infra/vps/docker-compose.yml`'s first line is `name: biasmarket` (verify
      you haven't accidentally edited this).
- [ ] Two SSH keys provisioned, `known_hosts` pinned, GitHub secrets/variables
      set (Steps 3–6).
- [ ] GHCR packages public, or a documented alternative in place (Step 7 — note
      this needs at least one `cd.yml` run first, so it's normally done right
      after the first `main` push post-setup, before this cutover).

Then, on the VPS as the `deploy` user, from `/opt/biasmarket` (already synced by
an initial manual rsync, or a first `cd.yml` run — either way, `--bootstrap`
only works once, before `state/current_color` exists):

```bash
./deploy.sh --bootstrap <current main HEAD sha>
```

Immediately after `--bootstrap` succeeds, finish Step 8's Kuma setup
(`scripts/setup-kuma.ts`, then paste the push monitor URL into
`env/watchdog.env` and restart the watchdog timer) — this is the earliest point
it can run, since `uptime-kuma` only just came up.

Verify:

```bash
docker volume ls | grep '^local\s*biasmarket_'   # same volume set as the old infra/docker/ stack
curl -I https://biasmarket.com                    # 200
curl https://api.biasmarket.com/api/health         # {"status":"ok",...}
```

### Bootstrap lessons and operational deviations

The first OCI bootstrap exposed a few details worth making explicit:

- The forced rsync key uses `command="/usr/local/bin/rrsync /opt/biasmarket/"`.
  With this restriction, the rsync destination must be relative:
  `deploy@<vps-ip>:.`. Passing `/opt/biasmarket/` makes `rrsync` try to resolve
  `/opt/biasmarket/opt/biasmarket` and fails. The CD workflow uses `:.` for the
  same reason.
- Run operator commands with a single login-shell command, for example
  `sudo -iu deploy bash -lc 'cd /opt/biasmarket && ./deploy.sh --bootstrap <sha>'`.
  Commands typed after an interactive `sudo -iu deploy` are easy to run in the
  wrong shell or directory.
- The private key and public key must be one matching pair. If a key is
  regenerated, replace both its public line in `authorized_keys` and its
  corresponding GitHub secret. Never paste private key contents into chat, logs,
  commits, or issue reports; rotate any key that was exposed.
- `env/shared.env`, `env/blue.runtime.env`, `env/green.runtime.env`, and
  `env/watchdog.env` are intentionally absent from rsync and must be created on
  the VPS before bootstrap. `shared.env` must be copied byte-for-byte from the
  real production `infra/docker/.env`.
- An apt lock held by another `apt-get` process is not fixed by deleting the
  lock file. Wait for the package operation to finish and retry if needed.
- Compose's `Found orphan containers` warning can appear when migrating from the
  old single-color stack. It is informational unless old containers must be
  deliberately removed after confirming they are no longer serving traffic.

`deploy.sh` reports each phase with phase and total elapsed seconds. Health
waits also emit a bounded progress line every 15 seconds, so image pulls,
migrations, and container health checks are visibly active without inventing a
misleading percentage.

Keep the old `infra/docker/docker-compose.yml` stack's containers
**stopped-but-not-removed**, volumes untouched, for a defined grace period — the
full-mechanism fallback if something about the new stack itself turns out to be
broken in a way blue/green's own rollback can't address (e.g. a Caddy config
issue affecting both colors).

## Manual operations reference

```bash
# from /opt/biasmarket, as the deploy user (or via the restricted SSH keys
# from CI — see infra/vps/bin/ssh-deploy-dispatcher.sh for what's reachable
# that way)
./deploy.sh <40-hex-sha>                                 # normal deploy
./deploy.sh <sha> --force                                 # override the rollback-target guard
./deploy.sh <sha> --i-understand-this-is-destructive       # override the migration gate
./deploy.sh --rollback                                     # flip back to the sidelined color
./deploy.sh --cleanup                                       # tear down the sidelined color now
./deploy.sh --print-current-sha                             # read-only
./deploy.sh --wait-for-result <sha> [timeout-seconds]        # read-only, blocks
./deploy.sh --bootstrap <sha>                                # from-scratch/DR only
```

See [`incident-response.md`](incident-response.md) for the rollback runbook and
what happens when a deploy gets stuck.
