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
       scheduled-cleanup  waits 30 min, then deploy.sh --cleanup
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
   `releases/history.log`. Previous color is left running.
9. On any failure at steps 4–8: tear down **only** the candidate; the previous
   color and its Caddy routing are never touched.
10. Always, on every exit path: write `state/last_deploy_result` (SHA, outcome,
    phase, timestamp — nothing from `env/*.env`).

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

Directory layout on the VPS, under a dedicated low-privilege `deploy` OS user
(Docker-group member — **this is root-equivalent in practice**, not a
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

```bash
sudo useradd --create-home --shell /bin/bash deploy
sudo usermod -aG docker deploy
sudo mkdir -p /opt/biasmarket/{env,caddy/active,state,releases}
sudo chown -R deploy:deploy /opt/biasmarket
```

### Two SSH keys, not one

A single forced-command key restricted to "run deploy.sh" would silently break
the rsync step (`rrsync` and a `command=` dispatcher can't be composed on one
key) — provision two, both ed25519, both without a passphrase (used
non-interactively by CI):

**Key A — rsync-only**, restricted via
[`rrsync`](https://github.com/WayneD/rrsync) (ships with the `rsync` package,
`/usr/share/doc/rsync/scripts/rrsync` or similar depending on distro) scoped to
`/opt/biasmarket/`:

```
command="rrsync /opt/biasmarket/",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... key-a-rsync
```

**Key B — deploy dispatcher**, restricted via
`infra/vps/bin/ssh-deploy-dispatcher.sh` (synced to
`/opt/biasmarket/bin/ssh-deploy-dispatcher.sh` by key A's rsync — chmod +x after
the first sync):

```
command="/opt/biasmarket/bin/ssh-deploy-dispatcher.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... key-b-dispatch
```

Both lines go in `deploy`'s `~/.ssh/authorized_keys`. The dispatcher script
itself documents its exact allowlist (see the file's header comment) — it never
`eval`s `$SSH_ORIGINAL_COMMAND`, only matches it against anchored regexes for
the handful of literal shapes `cd.yml` actually sends.

### `known_hosts`

Capture once, **verified out-of-band via the Oracle Cloud console** (not blind
first-`ssh-keyscan` trust — an attacker in a position to MITM the very first
connection is exactly the threat model host-key pinning exists for):

```bash
ssh-keyscan -t ed25519 <vps-ip> > known_hosts_candidate
# then, separately, open the OCI console's instance detail page and confirm
# the host key fingerprint shown there (or fetched via a serial console
# session) matches before trusting known_hosts_candidate
```

Store the verified file's contents as the `DEPLOY_SSH_KNOWN_HOSTS` GitHub secret
(see [Required GitHub secrets/variables](#required-github-secretsvariables)
below).

### systemd units (migration_pending watchdog)

```bash
sudo cp /opt/biasmarket/systemd/biasmarket-migration-watchdog.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now biasmarket-migration-watchdog.timer
```

Requires `/opt/biasmarket/env/watchdog.env` populated (see
`infra/vps/env/watchdog.env.example` — `KUMA_MIGRATION_PUSH_URL` comes from the
Kuma push monitor `scripts/setup-kuma.ts` creates, see next section). This timer
is deliberately **not** part of `deploy.sh` itself — a wedged deploy must not be
able to silence its own stuck-migration alarm.

### Uptime Kuma monitors

Re-run `scripts/setup-kuma.ts` before/at the first blue/green cutover, and again
after any VPS rebuild:

```bash
KUMA_USERNAME=admin KUMA_PASSWORD='<existing password>' node scripts/setup-kuma.ts
```

Creates/updates: 4 static per-color internal monitors
(`api-blue`/`api-green`/`web-blue`/`web-green`, replacing the two bare
`api`/`web` hostnames that stop resolving once only the colored services exist),
the external API/Web monitors (unchanged), DB/MinIO (unchanged, no color split),
and the new `migration_pending watchdog` push monitor. The script prints that
push monitor's URL on creation — copy it into
`/opt/biasmarket/env/watchdog.env`'s `KUMA_MIGRATION_PUSH_URL`. See
[`incident-response.md`](incident-response.md) for what fires when it misses a
heartbeat.

### GHCR package visibility (T8, one-time, manual)

After `cd.yml`'s first successful run creates the 3 packages (`biasmarket-api`,
`biasmarket-web`, `biasmarket-workers`), set each to **public** visibility —
this does **not** auto-inherit from the repo being public:

GitHub → the `bobadilla-tech` org (or user) → Packages → each of the 3 packages
→ Package settings → Danger Zone → Change visibility → Public.

This is what lets the VPS pull images with zero registry credentials. If you
need to keep them private instead, `deploy.sh`/the compose file would need a
`docker login` step added on the VPS with a PAT — not the default path, not
implemented here.

### GitHub Variables (T8, not Secrets)

`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SENTRY_DSN` are baked into the `web`
image as build ARGs (see `infra/docker/web.Dockerfile`) — they're already public
(shipped in every browser bundle), so they belong in **Settings → Secrets and
variables → Actions → Variables**, not Secrets. Set both there before the first
`cd.yml` run that builds `web`.

### Required GitHub secrets/variables

Settings → Secrets and variables → Actions, on the `production` **Environment**
(not repo-level — the `sync-and-deploy`/`scheduled-cleanup` jobs declare
`environment: production`, which is what makes environment-scoped secrets the
right place and adds an approval-gate option for free):

| Name                      | Type   | Value                         |
| ------------------------- | ------ | ----------------------------- |
| `DEPLOY_SSH_HOST`         | Secret | VPS hostname/IP               |
| `DEPLOY_SSH_USER`         | Secret | `deploy`                      |
| `DEPLOY_SSH_KNOWN_HOSTS`  | Secret | Verified host key (see above) |
| `DEPLOY_SSH_KEY_RSYNC`    | Secret | Key A private key             |
| `DEPLOY_SSH_KEY_DISPATCH` | Secret | Key B private key             |

Repo-level Variables (not Secrets, see above):

| Name                     | Type     |
| ------------------------ | -------- |
| `NEXT_PUBLIC_API_URL`    | Variable |
| `NEXT_PUBLIC_SENTRY_DSN` | Variable |

## First production cutover (T11)

Manual, supervised, during a low-traffic window — the one deliberate exception
to "no maintenance windows needed" in this whole design, since it's also the
first real end-to-end validation of the mechanism against production data.

Gate on all of:

- [ ] `env/shared.env` populated by **verbatim byte-for-byte copy** of every
      secret value from the current `infra/docker/.env` — never
      `pnpm env:init --prod` against this file. See
      `infra/vps/env/shared.env.example`'s header comment for why
      (`CUSTOMER_ACCOUNT_TOKEN_SECRET` specifically).
- [ ] `infra/vps/docker-compose.yml`'s first line is `name: biasmarket` (verify
      you haven't accidentally edited this).
- [ ] Kuma monitors updated (`scripts/setup-kuma.ts` re-run, push monitor +
      systemd timer live) **before** the cutover, not after.
- [ ] Two SSH keys provisioned, `known_hosts` pinned, GitHub secrets/variables
      set (see above).
- [ ] GHCR packages public (or a documented alternative in place).

Then:

```bash
# on the VPS, as the deploy user, from /opt/biasmarket (already synced by
# an initial manual rsync, or a first cd.yml run against a to-be-bootstrapped
# VPS — either way, --bootstrap only works once, before state/current_color
# exists)
./deploy.sh --bootstrap <current main HEAD sha>
```

Verify:

```bash
docker volume ls | grep '^local\s*biasmarket_'   # same volume set as the old infra/docker/ stack
curl -I https://biasmarket.com                    # 200
curl https://api.biasmarket.com/api/health         # {"status":"ok",...}
```

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
