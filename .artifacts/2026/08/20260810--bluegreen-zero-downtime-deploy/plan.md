# Blue/green zero-downtime deployment (CI/CD to GHCR + VPS)

Written before execution, at the user's explicit request, to allow a multi-agent
review pass before any code is written (deviates from this directory's normal
"record after the work lands" convention — same exception already used by
[`2026-08-09-migrate-background-jobs-to-workers-plan.md`](2026-08-09-migrate-background-jobs-to-workers-plan.md)).
This file is the planning record; a fresh Claude session executes it (see the
handoff prompt delivered alongside this plan) and should update this doc's
status once work lands, per the normal convention.

## Status: T1–T10 implemented, T11 (first production cutover) not run

T1 through T10 from the task list below landed as designed, with one deliberate,
documented deviation from the literal wording of decision 7/T7 (see below). T11
— the actual VPS provisioning (SSH keys, `known_hosts`, GitHub
secrets/variables, GHCR package visibility, systemd units) and the first real
cutover — was **not** performed; it requires hands-on access to real
infrastructure this session didn't have. It's fully scripted and documented as a
checklist in
[`docs/core/blue-green-migrations.md`](../core/blue-green-migrations.md#first-production-cutover-t11)
instead.

**Deviation from decision 7/T7's literal wording:** "rsync (via the
rrsync-restricted key) and the deploy.sh invocation (via the
dispatcher-restricted key) run under the same remote flock in one SSH call" is
not actually achievable — `rrsync` and a `command=` dispatcher are two different
forced commands on two different keys, so they can't be composed into a single
SSH call. Implemented instead: sequential steps in the same `cd.yml` job,
protected by GitHub's `concurrency: group: production-deploy` (serializes whole
job runs, so no CD run's rsync ever overlaps another's) plus `deploy.sh`'s own
internal `flock` (the second, independent layer — covers a manual operator
invocation racing a CD-triggered one). Same safety property (a concurrent sync
can't clobber a running `deploy.sh`'s bytes mid-execution), different mechanism.
This also required two new read-only subcommands not in the original design —
`deploy.sh --print-current-sha` (lets the CD-side staleness guard, decision 1b,
read the VPS's live SHA through the same restricted dispatcher) and
`deploy.sh --wait-for-result <sha> <timeout>` (lets CD block for a deploy's
completion over a _second_ SSH call, since a forced-command dispatcher can't
pass through an arbitrary polling shell loop on the first one). Both are
allowlisted literally in `infra/vps/bin/ssh-deploy-dispatcher.sh`, same
never-`eval` regex-anchored model as the three original commands.

Everything else — the migration phase's gate/snapshot/lock_timeout, the
weighted-canary Caddy switch, the state machine's lock/reconciliation/
rollback-target tracking, the two-SSH-key security model, arm64-native GHA
builds, the `migration_pending` push-monitor + independent systemd timer —
landed as designed. Validated: `pnpm turbo run typecheck build test` (api 439
tests, web 198 tests, all passing), `docker build` + boot test of the updated
`api.Dockerfile` (confirms no migration on boot, confirms manual
`prisma migrate deploy` still works), `docker compose config` against the real
`infra/vps/docker-compose.yml` with example env files, every new shell script
syntax-checked, `git grep "docker compose down"` returns nothing under
`infra/vps/`.

## Context

Prod today: SSH to the VPS, `git pull`,
`docker compose -f
infra/docker/docker-compose.yml up -d --build` — full source
checkout on the production host, images built on the production host, ~1 minute
of downtime per deploy (containers replaced in place, `prisma migrate deploy`
runs unconditionally in `api`'s container `CMD` on every boot). Acceptable for
an early MVP; not acceptable once this is a live ecommerce site taking real
payments during business hours.

Target: GitHub push to `main` → existing `ci.yml` (unchanged) → a new, separate
`cd.yml` triggered by CI's success → build immutable images, publish to GHCR
tagged by commit SHA → SSH to the VPS → a VPS-owned `deploy.sh` script deploys
the inactive blue/green application-service color, health-checks it, smoke-tests
it, switches Caddy's routing to it via a graceful config reload (no Caddy
restart), verifies, and leaves the previous color alive for a fast rollback
before cleaning it up. Full requirements, constraints, and process (7-lens
multi-agent review, iterate until no unresolved HIGH findings) came from the
user's task brief — see that brief for the complete original spec; this doc
records the plan that resulted from it, not the brief itself.

**This was a planning artifact as originally written** — no infra/CI/Docker/
Caddy code had landed as of the commit that introduced this file. See the
"Status" section above: a later session executed the task list below, and that
section is now the accurate record of what actually landed vs. what's still
pending. See the companion implementation-handoff prompt (delivered to the user
separately, not stored in this repo) for the execution brief that session worked
from.

## Architecture-report summary (as found in the repo, confirmed by direct

inspection — not the task brief's assumed shape)

- **Apps** (CLAUDE.md is stale on this — confirmed via `ls apps/ packages/`):
  `apps/api` (NestJS, port 3000, global prefix `/api`), `apps/web` (Next.js,
  `output: standalone`, port 3001), `apps/workers` (NestJS, BullMQ consumer,
  port 3002, HTTP health server only, **no DB dependency**). Plus `packages/db`
  (Prisma 7 + `@prisma/adapter-pg`), `packages/queue` (shared BullMQ
  connection/contracts between api and workers), `types`/`i18n`/`ui`/`utils`.
- **Current deploy** (`docs/core/deploy.md`): `git pull && pnpm docker:prod`
  (`docker compose -f infra/docker/docker-compose.yml up -d --build`).
  `api.Dockerfile`'s runtime `CMD` is
  `prisma migrate deploy && exec node
  apps/api/dist/main` — migrations fire on
  **every** container boot, unconditionally.
- **CI** (`.github/workflows/ci.yml`): `detect-changes` (dorny/paths-filter) → 9
  conditional jobs (api/web/workers/db/i18n/queue/types/ui/utils) → `ci-success`
  gate. `NODE_VERSION: "26"`, `PNPM_VERSION: "10.11.0"`.
  `permissions: contents: read` only. **No changes needed to this file** —
  `workflow_run` triggers `cd.yml` externally.
- **Docker builds**: one multi-stage Dockerfile per app, shared
  `base→deps→build→runtime` stages, BuildKit cache mounts
  (`id=pnpm-store`/`id=turbo-cache`, local-daemon-scoped — don't persist to
  ephemeral GH runners without `type=gha` cache config). `web.Dockerfile` bakes
  `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SENTRY_DSN` as build ARGs — since Caddy
  always terminates `api.biasmarket.com` regardless of which color is live
  behind it, **one web image per commit SHA serves both colors**, no per-color
  rebuild needed.
- **Health endpoints** (exact routes, confirmed by reading the controllers):
  `api` → `GET /api/health`, checks Postgres via `SELECT 1`, no Redis check.
  `workers` → `GET /health`, pure liveness, no Redis/queue check (deferred by
  design). `web` → `GET /api/health`, pure liveness, deliberately never calls
  `api`. None of these are deep-readiness checks.
- **Caddy** (`infra/caddy/Caddyfile`): bind-mounted read-only, not baked into an
  image — config swappable without rebuild/restart. 4 subdomains:
  `api.biasmarket.com`→`api:3000` (with `/internal/*` blocked 404 first),
  `biasmarket.com`→`web:3001`, `cdn.biasmarket.com`→`minio:9000`,
  `status.biasmarket.com`→Uptime Kuma. `caddy_data`/`caddy_config` volumes hold
  ACME state — must never be deleted.
- **The one-hostname problem** (biggest structural blocker, found by grep):
  `INTERNAL_API_URL=http://api:3000` is consumed by **both** `apps/workers`
  (internal order-expiration sweep) **and** `apps/web` (7+ SSR/RSC call sites:
  `sitemap.ts`, storefront pages, `features/*/api/*.api.ts`). Once `api` splits
  into `api-blue`/`api-green`, each color's `web`/`workers` must be pinned to
  its **own** color's `api` — cross-color pairing is the easiest way to ship a
  subtly broken deploy.
- **Migration safety is the real risk area.** 39 migrations exist; at least
  three apply a destructive change (`DROP TABLE`/`DROP COLUMN`) in a single
  migration with no phased deprecation (`20260808192135_delete_payment_proof`,
  `20260730205809_add_payment_methods`,
  `20260722224013_product_taxonomy_layout`), plus a recurring
  `ADD COLUMN ... NOT NULL` without `DEFAULT` pattern. The team does not
  currently follow expand/contract discipline. Combined with migrations running
  automatically on container boot, blue/green as architected (GREEN
  migrates+starts before BLUE is torn down) means a destructive migration can
  break live BLUE traffic before any human approves the cutover — classified
  HIGH, addressed structurally (migration extracted to an explicit pre-cutover
  `deploy.sh` phase) and procedurally (expand/contract checklist, a static
  keyword gate for `DROP`/`ALTER TYPE`).
- **Env/secrets**: everything lives in one gitignored `infra/docker/.env`,
  generated once via `pnpm env:init --prod`. Splitting this for blue/green
  (shared + per-color) must **copy** existing secret values, never regenerate —
  `CUSTOMER_ACCOUNT_TOKEN_SECRET` in particular backs a stateless buyer-session
  HMAC cookie with no DB backing; regenerating it would instantly log out every
  live buyer session.
- **Public smoke-test target** (confirmed real, not invented):
  `GET /api/stores/directory` (`stores.controller.ts:245`, `@Public()`,
  paginated store listing, hits Postgres, no seeded-data dependency).
- **Compose volumes** (`db_data`, `caddy_data`, `caddy_config`, `minio_data`,
  `redis_data`, `uptime_kuma_data`) must survive every deploy untouched —
  Compose project name is pinned via top-level `name: biasmarket`, and the new
  blue/green compose file **must** repeat that pin or it silently attaches to
  brand-new empty volumes instead of production data.

### Things that must NOT change

CI's job structure/`ci-success` gate/Codecov flags/version pins; the dev Compose
stack (`docker-compose.dev.yml`); Prisma's local _authoring_ workflow
(`prisma migrate dev`); Caddy's subdomain routing shape and TLS/ACME behavior;
`S3_*`/MinIO bucket layout; Redis/BullMQ usage; Uptime Kuma's external monitors.
`infra/docker/*` stays the source of truth for **local dev**; a new, separate
`infra/vps/` tree is introduced for the production blue/green stack.

## Review process

7 independent subagent reviews ran in parallel against the v1 plan, each with a
distinct lens: Docker/Compose architecture, GitHub Actions/CI-CD mechanics,
Caddy/networking/zero-downtime routing, PostgreSQL/Prisma migration safety,
security/SSH/GHCR secrets, deployment reliability/rollback, and
application-specific risk (auth sessions, BullMQ job continuity, order state
machine, MinIO uploads, Kuma monitoring, rate-limit state). 15 HIGH-severity
findings came back (3 GHA, 3 Docker/Compose, 3 security, 6 reliability, 1
app-specific); the Postgres/Prisma and Caddy reviews found the core design sound
with no HIGH findings, only MEDIUM refinements. Every HIGH and every actionable
MEDIUM is resolved in the design decisions below; a handful of MEDIUM items are
explicitly accepted as documented limitations with stated rationale, not
silently dropped. A follow-up focused verification pass then checked each of the
15 HIGH fixes specifically (not a fresh open-ended review) and caught 3 that
were incomplete as first drafted: the staleness guard's `git merge-base` needs
`fetch-depth: 0` (default shallow checkouts don't have the history to answer the
ancestry question), the SSH-detach completion signal needed one concrete
mechanism instead of two floated options, and — the substantive one — the
originally-proposed `migration_pending` alert would have silently done nothing,
since it routed through `/api/monitoring/webhook`, which is inbound-only (Kuma
calls it, it can't be called to trigger a page); the corrected design uses a
dedicated Kuma push monitor plus an independent systemd timer. All three are
folded into the design decisions and task list below, not left as open items.

## Design decisions (final, post-review)

**1. CD trigger** — `workflow_run` on workflow `"CI"`, gated on
`conclusion == 'success' && event == 'push' && head_branch == 'main' &&
head_repository.full_name == github.repository`.
The `event == 'push'` check is the load-bearing fix: without it, a public-repo
fork PR whose default branch is also named `main` produces a CI run satisfying
the original looser filter, and `workflow_run` executes with the **base repo's**
elevated permissions/secrets against the **fork's untrusted commit** —
`docker build` on an attacker-controlled Dockerfile with GHCR-push and
SSH-deploy-key access downstream. Every `actions/checkout` in every downstream
job pins `ref: ${{ needs.gate.outputs.head_sha }}` explicitly. Requires **zero
changes to `ci.yml`**.

**1b. Deploy staleness guard** — `workflow_run` events can complete out of push
order (an earlier commit's CI run can finish after a later commit's, on cache
misses/retries). Before SSHing in, the CD workflow checks the incoming SHA is a
descendant of `state/current_sha` (`git merge-base --is-ancestor`, performed
CD-side using the already-checked-out repo — keeps "no git on the VPS" intact)
and refuses to deploy an out-of-order older commit over a newer one already
live. **This job's `actions/checkout` must use `fetch-depth: 0`** (full
history), not the default shallow `fetch-depth: 1` —
`git merge-base --is-ancestor` needs both commits present locally, and an
arbitrary historical `current_sha` from a prior deploy won't exist in a depth-1
checkout, so the ancestry check would fail to resolve rather than answer
correctly (verified against this exact gap — call this out explicitly in T7,
it's easy to omit since most other jobs correctly want shallow checkouts for
speed).

**2. Registry** — GHCR, `ghcr.io/bobadilla-tech/biasmarket-{api,web,workers}`,
tag = full 40-char commit SHA only (never `latest`), digest also captured.
Package visibility set to public (one-time manual GitHub setting — does **not**
auto-inherit from the repo being public) so the VPS needs zero registry
credentials; PAT fallback documented.

**2b. Multi-arch** — the VPS is Oracle Ampere A1 (arm64, `docs/core/deploy.md`);
default GitHub-hosted runners are x86_64. Build on native arm64-hosted runners
(`runs-on: ubuntu-24.04-arm`) rather than QEMU emulation. This gap was entirely
unaddressed pre-review and would have broken every single deploy at
container-start (exec format error).

**3. Compose topology** — one file, `infra/vps/docker-compose.yml`. Infra
services (`db`, `redis`, `minio`, `minio-init`, `uptime-kuma`, `caddy`) carry no
`profiles:` key (always active). App services defined twice explicitly —
`api-blue`/`api-green`, `web-blue`/`web-green`, `workers-blue`/`workers-green` —
each tagged `profiles: [blue]`/`profiles: [green]`.

- **`name: biasmarket` is the file's literal first line.** Compose project-name
  precedence is `-p` > `COMPOSE_PROJECT_NAME` > top-level `name:` > directory
  basename; this file lives under `infra/vps/`, and omitting the pin would
  default the project name to `vps`, silently creating brand-new empty volumes
  instead of attaching to production data on first cutover. T2/T11 both gate on
  `docker volume ls | grep
  '^local\s*biasmarket_'` showing the real volumes
  attached before declaring success.
- **No `container_name:` anywhere.** Compose's per-service DNS alias (bare
  service name) already makes `api-green` resolvable — pinning `container_name`
  instead collides with "old color stays alive until explicit cleanup": the next
  deploy's migration phase would try to create a container literally named
  `api-blue` while that name is still occupied by the still-alive prior
  instance. All host-side scripting uses
  `docker
  compose exec/run/ps -q <service>`, never a hardcoded name.
- **Bare `docker compose down` is forbidden**, documented with a loud
  top-of-file comment. Compose's profile semantics mean a bare `down` (no
  `--profile`/service args) only touches services with **no** `profiles:` key —
  exactly the always-on infra set. An operator's routine "clean up" `down` would
  kill Postgres/Redis/MinIO/Caddy while leaving app containers running and
  erroring against a dead DB.

**4. Runtime config layering** — two axes: compose-variable substitution (image
tag refs) via per-invocation `--env-file`; actual container env via `env_file:`
— `env/shared.env` (DB/Redis/S3/secrets, identical across colors) plus
`env/blue.runtime.env`/`green.runtime.env` (only `INTERNAL_API_URL` legitimately
differs per color).

- `env/shared.env`'s secret values **must be copied byte-for-byte from the
  existing production `infra/docker/.env`**, never regenerated via
  `pnpm
  env:init --prod`. `CUSTOMER_ACCOUNT_TOKEN_SECRET` backs a stateless
  HMAC cookie for buyer sessions with no DB backing (unlike seller sessions,
  which are better-auth DB-backed) — regenerating it at cutover would instantly
  log out every live buyer, a hard cliff, not a gradual expiry. `deploy.sh`'s
  first-run path asserts a checksum against a known-good snapshot so an
  accidental future regeneration fails loud.
- `infra/vps/env/*.env` (the real files) are added to `.gitignore` **and**
  `.dockerignore` before any `.example` template is created — today's single
  `.env` has two layers of protection (bare-pattern gitignore + explicit
  dockerignore entry); the new filenames matched neither until explicitly added.

**5. Migrations** — extracted from `api.Dockerfile`'s `CMD` entirely (becomes
just `exec node apps/api/dist/main`), replaced by an explicit, single, logged
`deploy.sh` phase run once per deploy, using the candidate's new image, before
the candidate's long-running containers start:

- A pre-migration `pg_dump` snapshot, automated, retained N days.
- A short `lock_timeout` (~5s) on the migration-runner's DB session, so a
  conflicting lock held by live BLUE traffic fails the migration fast and loud
  instead of silently queuing and then blocking BLUE's own subsequent queries
  against that table (Postgres lock queues are FIFO per relation).
- A static gate scanning pending `migration.sql` for
  `DROP TABLE`/`DROP COLUMN`/`DROP TYPE`/`ALTER COLUMN ... TYPE`, refusing
  without an explicit `--i-understand-this-is-destructive` flag — this repo's
  own history has three confirmed instances of exactly this pattern shipped with
  no phased deprecation.
- Prisma's advisory lock (`pg_advisory_lock`, ~10s acquire timeout) makes
  concurrent `migrate deploy` invocations safe by construction (confirmed
  against Prisma's actual locking behavior) — a lock-acquisition failure is
  treated as a distinct, retryable error class, not folded into "bad migration
  SQL."
- `deploy.sh --bootstrap` (or a documented default when `state/current_color` is
  absent) covers the from-scratch/DR case.
- Expand/contract discipline for migration _authoring_ is a documented process
  control (new `docs/core/blue-green-migrations.md`, worked examples using two
  of this repo's own historical unsafe migrations) — infra can catch the
  clearly-destructive keyword classes above, not fully verify
  backward-compatibility in general.
- The same discipline extends to `packages/queue/src/jobs/*.ts` payload schemas
  (zod-validated on both enqueue and consume sides): during the
  deliberately-extended overlap window (old color's workers stay alive until
  explicit cleanup, not just during the migration instant), both colors' workers
  are simultaneously live consumers of the same unnamespaced BullMQ queues. New
  fields must be optional-with-default for one deploy cycle before becoming
  required.

**6. Caddy switching** — `infra/vps/Caddyfile` imports
`/etc/caddy/active/{api,web}.caddy`, each a one-line `reverse_proxy` target,
atomically swapped (`mv`) then
`docker compose exec caddy caddy reload
--config /etc/caddy/Caddyfile --adapter caddyfile`
— confirmed correct against real Caddy 2 semantics (transitive import resolution
on every reload, no port rebind, in-flight requests complete against their
original upstream). `depends_on` dropped from Caddy — confirmed safe, ACME/TLS
issuance is independent of backend reachability, a 502 while a backend is
unready is correct behavior, not a startup-ordering bug.

- **Weighted canary instead of instant 100% cutover**, using Caddy's native
  `reverse_proxy` load balancing (`lb_policy weighted_round_robin`, no new
  infra): switch phase first writes a small-weight config, reloads, holds
  briefly, smoke-tests the mixed traffic, then writes the final 100% config and
  reloads again — closes the gap where the original design exposed 100% of real
  traffic to a candidate that had only ever seen synthetic pre-switch checks.
- Native active health checks (`health_uri`, `health_interval`,
  `health_timeout`) on both `reverse_proxy` blocks, so Caddy itself pulls a
  failing upstream out of rotation continuously, not just at the one-shot
  post-switch smoke-test moment.
- Accepted, documented limitation (not fixed): a browser tab that loaded HTML
  from BLUE before a cutover holds BLUE's hashed Next.js chunk filenames; once
  BLUE is torn down, a stale tab's subsequent client-side navigation 404s on
  chunk load. Standard Next.js deploy behavior.

**7. No git/build on the VPS** — `infra/vps/**` synced via `rsync` ahead of
invoking `deploy.sh`, under the same remote `flock` as the deploy itself (a new
`deploy.sh`'s bytes being overwritten mid-execution by a concurrent sync is
unsafe in bash — script read is by byte offset, not a snapshot).

**8. Deploy lock and execution model** — `flock -w 300` with owner metadata
(`state/deploy.lock.meta`: PID/phase/timestamp/actor) rather than an indefinite
wait with no operator-visible signal.

- `deploy.sh` runs **detached from the SSH transport** (`setsid`, backgrounded
  by `ssh-deploy-dispatcher.sh`'s `launch()`), not directly under the invoking
  SSH session — an ordinary network blip between the GitHub runner and the VPS
  could otherwise SIGHUP-kill the script at any phase, including mid-migration
  or mid-Caddy-switch, turning routine connectivity flakiness into a stuck-state
  incident. (An earlier draft of this decision used
  `systemd-run --scope --unit=biasmarket-deploy` instead of `setsid` — dropped
  after implementation hit polkit's "Interactive authentication required" over
  this VPS's non-interactive forced-command SSH sessions; see
  `ssh-deploy-dispatcher.sh`'s `launch()` header comment for the full story.
  `systemd-run` was never load-bearing for anything beyond the SSH-transport
  detachment `setsid` already provides on its own.) **One concrete
  completion-signal mechanism, not left as an open choice**: `deploy.sh`'s final
  action, on every exit path (success or failure), is an atomic
  temp-file-plus-rename write to `state/last_deploy_result` — a small,
  deliberately secret-free file (fields: SHA, outcome, phase reached, timestamp,
  nothing from `env/*.env`) consistent with the H8 no-secrets-in- output rule.
  The CD workflow's SSH step polls this file
  (`ssh ... 'while ! grep -q "$SHA" state/last_deploy_result;
  do sleep 5; done; cat state/last_deploy_result'`,
  bounded by the job's own `timeout-minutes`) rather than blocking on the
  launching SSH session's own output or reading anything from
  `releases/history.log` (which may contain more verbose phase detail and isn't
  guaranteed secret-free by the same strict standard).
- **State/reality reconciliation at the very start of every run**: before
  trusting `state/current_color` for anything, `deploy.sh` reads the actual live
  content of `caddy/active/api.caddy` and asserts it matches; aborts loudly on
  mismatch. Closes the gap where a crash between the Caddy switch and the
  state-file write would otherwise leave the next run computing the wrong
  candidate and, on its own failure path, tearing down actual production.
- **Explicit rollback-target tracking** (`state/rollback_target`): `deploy.sh`
  refuses (requires `--force`) to deploy into a slot still recorded as the
  rollback target of a not-yet-cleaned-up prior deploy — otherwise a third
  deploy could silently overwrite a second deploy's only rollback safety net
  before the second deploy has even shown signs of trouble.
- GitHub Actions side:
  `concurrency: { group: production-deploy,
  cancel-in-progress: false }`
  (queue, never cancel mid-flight — a cancelled mid-deploy run risks a
  half-switched state) plus a bounded `timeout-minutes`.

**9. Rollback** — `deploy.sh --rollback` **health-checks the target color before
flipping Caddy back to it**, failing loudly if that color silently degraded
while sidelined, rather than blindly restoring traffic to something already
broken. "Migration applied, candidate not yet cut over" is its own explicit,
alertable state (`state/migration_pending`, wired into the existing Uptime Kuma
webhook path) so a stuck deploy leaving BLUE serving against an incompatible
schema pages someone rather than sitting silent and unbounded. **The alerting
mechanism is a Kuma push monitor, not the existing webhook** — verification
caught that the existing `/api/monitoring/webhook` is inbound-only (Kuma calls
it on its own monitor state transitions; `deploy.sh` cannot call it to trigger a
page, and `MonitoringService` only persists a `PlatformIncident` row for
admin-panel viewing, it doesn't push real-time alerts itself). The corrected
design: a new Uptime Kuma monitor of type **push** (Kuma pings itself down if it
_stops_ receiving heartbeats within a configured interval — a standard,
long-standing Kuma monitor type, distinct from the HTTP/TCP monitors already in
use). A small, independent systemd timer on the VPS (deliberately **not** part
of `deploy.sh` itself, so a wedged deploy can't also silence its own alarm) runs
every minute, checks `state/migration_pending`'s age, and pings the push
monitor's URL only when that marker is absent or younger than a threshold (e.g.
3 minutes); if the marker is older than the threshold, the timer skips the ping,
the push monitor misses its heartbeat, and Kuma's own state-transition
notification fires exactly the same way its existing HTTP/TCP monitors already
do (real-time Slack/Discord notification configured directly in Kuma's UI, per
`docs/core/incident-response.md` — nothing new needed there). Owned by T9,
alongside the other Kuma monitor updates, not by `deploy.sh`. Old-color cleanup
is a concrete, scheduled mechanism (CD-scheduled 30 minutes post-cutover, no-ops
if a newer deploy started, cancelable by an in-window rollback) rather than
hand-waved "operator confirmation." Smoke tests (pre- and post-switch) retry 3x
with backoff before declaring failure — zero retry tolerance in the original
design risked failing a whole deploy on a single transient blip. Every deploy
attempt (success or failure) appends a structured record to
`releases/history.log` on the VPS itself, not just ephemeral CI logs. All
state-file writes use temp-file-plus-atomic-rename.

**10. Security** — two separate deploy-only SSH keys, not one: key A
(`rrsync`-restricted) for the `infra/vps/**` sync, key B (a `command=`
dispatcher matching only the literal `deploy.sh <sha>`/`--rollback`/ `--cleanup`
invocations, regex-anchored, never `eval`d) for deploy invocation — a single
forced-command key restricted to "run deploy.sh" would have silently broken the
rsync step. `known_hosts` captured once, verified out-of-band via the cloud
console (not blind first-`ssh-keyscan` trust), stored as a GitHub secret,
`StrictHostKeyChecking=yes`. `environment:
production` declared on the deploy
job (approval-gate defense-in-depth, deployment history, environment-scoped
secrets). `deploy.sh` never echoes resolved secret values or runs `set -x`
around secret-bearing commands — the repo is public, GitHub Actions logs for it
are publicly viewable by default, and VPS-only secrets get zero automatic
masking since they're never passed to GitHub as `secrets.*`. Docker-group
membership on the VPS deploy user is stated plainly as root-equivalent
(bind-mount tricks bypass no-sudo/forced- command restrictions trivially) — the
real security boundary is SSH-key secrecy and CI-runner integrity, not the
deploy user's Unix permissions; this is an accepted, explicitly-stated risk for
a single-VPS MVP, not a solved problem.

**11. Monitoring** — `scripts/setup-kuma.ts`'s two internal monitors (hardcoded
to bare `api`/`web` Compose service names, which stop resolving entirely once
only `-blue`/`-green` exist) are updated to 4 static per-color targets and
re-run before/at cutover. This is an owned implementation task, not
documentation — left as "docs-only, mention it," the failure mode is a single
**permanent, non-auto-resolving** incident record, not merely per-deploy noise.
External monitors (public status page) are unaffected.

**12. Explicitly accepted, not fixed**: in-memory-per-container rate limiting
(already resets on every redeploy today; blue/green raises deploy _frequency_,
meaningfully widening the reset-window attack surface — filed as a follow-up to
back the throttler with the already-provisioned Redis, not a blocker here);
client-side stale-chunk 404s across a cutover (standard Next.js behavior);
Prisma migration rollback remains manual/documented, not automated (Prisma
generates no down-migrations for `migrate deploy` — the destructive-migration
static gate plus automated pre-migration backup are the real mitigations).

## Task list

1. **T1** — Extract `prisma migrate deploy` out of `api.Dockerfile`'s `CMD`.
2. **T2** — New `infra/vps/` tree: compose file (`name: biasmarket` pinned, no
   `container_name:`, bare-`down` warning comment), Caddyfile, env templates,
   `.gitignore`/`.dockerignore` coverage for the real env files.
3. **T3** — Caddy: drop `depends_on`, `active/*.caddy` import mechanism,
   weighted-canary support, native active health checks.
4. **T4** — Per-color `INTERNAL_API_URL` env wiring (no application code changes
   needed — pure env, both `apps/web` and `apps/workers` already read this var).
5. **T5** — `deploy.sh` and helpers: full hardened state machine (lock with
   owner metadata, detached execution via `setsid`, reconciliation-at-start,
   rollback-target tracking, canary switch, retrying smoke tests, audit log,
   atomic state writes including the final secret-free
   `state/last_deploy_result` completion signal the CD workflow polls for).
   **Owns the `env/shared.env` checksum assertion** (compares against a
   known-good snapshot recorded at T11's first run) on every invocation, not
   just at first cutover — so an accidental future regeneration of buyer-session
   secrets fails loud immediately rather than only being caught once.
6. **T6** — Migration phase (folded into T5): pre-snapshot, `lock_timeout`,
   destructive-migration gate, advisory-lock-failure handling,
   `migration_pending` marker.
7. **T7** — `cd.yml`: hardened `workflow_run` gate, staleness check (its
   `actions/checkout` step needs `fetch-depth: 0` — the default shallow checkout
   breaks `git merge-base --is-ancestor`), arm64 native builds, per-job pinned
   checkout, `environment: production`, dual-key SSH under one `flock`, polling
   `state/last_deploy_result` for the deploy outcome rather than blocking on the
   SSH session.
8. **T8** — GHCR package visibility (public) + secrets/variables provisioning.
9. **T9** — VPS provisioning: dedicated deploy user (Docker-group risk stated
   honestly), two SSH keys, pinned `known_hosts`, directory layout, Kuma monitor
   URL update (4 static per-color HTTP monitors), **new Kuma push monitor +
   independent systemd timer** for the `migration_pending` stuck-deploy alert
   (see decision 9 — deliberately not part of `deploy.sh` itself).
10. **T10** — Documentation: `docs/core/blue-green-migrations.md`
    (expand/contract checklist + BullMQ job-schema addendum, using this repo's
    own historical unsafe migrations as worked examples), updated
    `docs/core/deploy.md`, updated `docs/core/incident-response.md` (manual
    rollback procedure, accepted-limitations list).
11. **T11** — First production cutover: gated on verbatim secret copy with
    checksum assertion, volume-attachment validation, Kuma monitors updated.

Full per-task file lists, exact implementation approach, dependencies,
validation steps, and rollback considerations for each of the 11 tasks above are
in the implementation-handoff prompt delivered to the user alongside this plan
(not duplicated here to avoid drift between two copies — this doc is the
architectural record; the handoff prompt is the execution brief for a fresh
Claude session).
