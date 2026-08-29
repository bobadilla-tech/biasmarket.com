# Run the API E2E suite on merge to `main` and block CD on it

Written before execution, at the user's explicit request, to allow a multi-agent
review pass before any code is written (deviates from this directory's normal
"record after the work lands" convention — same exception used by
[`2026-08-10-bluegreen-zero-downtime-deploy-plan.md`](2026-08-10-bluegreen-zero-downtime-deploy-plan.md)
and
[`2026-08-14-merge-e2e-cd-gate-plan.md`](2026-08-14-merge-e2e-cd-gate-plan.md)).
A fresh Claude session executes it and updates the Status section once work
lands.

## Status

Implementation landed for T1–T4 and T6–T9. T5's GitHub-runner baseline ran on
workflow dispatch run `33230628422` but is not green: all 24 files ran, 22
files/65 tests passed, and 12 tests in `couriers.e2e-spec.ts` and
`orders.e2e-spec.ts` failed. The failures are application behavior/schema issues
(`courierName` is returned but absent from the response schema; courier
duplicate/bulk-save expectations fail), not GHCR or service bootstrap failures.
No better-auth 429 was observed. The E2E job runtime was 2m13s. T11's
repository-settings checklist remains a rollout/admin step; it cannot be
completed from this local checkout. The local API unit suite and worker suite
are green, but a full E2E rehearsal could not use the fixed CI ports because
developer Postgres/Redis containers already own 5432/6379. No existing
containers were stopped.

The E2E pulls use GHCR and are digest-pinned as resolved on 2026-08-28. `mc`
uses the same GHCR MinIO image via an entrypoint override, so there are three
unique image references:

- `ghcr.io/immich-app/postgres:18-vectorchord0.5.3-pgvector0.8.1` →
  `sha256:828081a755d3911a2d94f0a2be9f98570c07d52cf080fd310a9d6e4b83b73aa5`
- `ghcr.io/valkey-io/valkey:7-alpine` →
  `sha256:8fc3da585dc963d91754d72da22d54671c6ec495d8a0257a6a9100a9a4658f38`
- `ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z` →
  `sha256:69b55a1c1c5dc285ce04db96689f5b2102317fc77a50680a1874ca6efd1c87f9`

The GHCR pulls use the workflow's `GITHUB_TOKEN` with `packages: read` in both
service-container `credentials` and the explicit `docker/login-action` step; no
Docker Hub account or repository secrets are required. The PostgreSQL image was
smoke-tested locally with the CI credentials and standard entrypoint; Valkey was
smoke-tested with `redis-cli ping`; and the MinIO image's `/usr/bin/mc`
entrypoint was smoke-tested. Decision 6 is implemented and unit-covered;
decision 6b was not applied because the baseline did not show a 429. The
regenerated tracked OpenAPI artifact is stable after generation plus JSON-format
normalization.

Branch protection (T11) is still pending: require the exact `CI Success` check,
require PRs, disallow direct pushes, and leave E2E as a push-time gate rather
than a PR-required check. This is revision 3, iterated through two rounds of
parallel subagent review (round 1: Actions semantics / runtime dependencies /
repo fact-check; round 2: Actions + consistency / runtime + accuracy) with a
consolidation pass after each — findings and resolutions are in the "Review log"
at the bottom.

This supersedes
[`2026-08-14-merge-e2e-cd-gate-plan.md`](2026-08-14-merge-e2e-cd-gate-plan.md),
which covered the same goal but was never implemented and went stale (22 vs. 24
E2E specs; pre-`postgres:18` image digests) and whose scope this plan trims —
see Non-goals.

## Context

CI (`.github/workflows/ci.yml`) today runs lint, typecheck, build, and **unit**
tests per changed package. It runs no end-to-end suite.

`apps/api` has a real E2E suite: `pnpm --filter api test:e2e`
(`vitest run
--config ./vitest.config.e2e.ts`, `apps/api/package.json:29`)
discovers **24** `test/*.e2e-spec.ts` files (`app`, `buyer-proof-submit-race`,
`categories`, `collections`, `contact`, `coupon-redeem-race`, `couriers`,
`customer-account-auth`, `customer-auth-rate-limit`, `customers`,
`delivery-config`, `notifications`, `orders`, `payment-config`, `pickup-points`,
`product-search`, `products`, `stats`, `store-sections`, `stores-sitemap`,
`stores`, `suggestions`, `users`, `whatsapp-templates`). Each spec boots the
real Nest `AppModule` in-process via `Test.createTestingModule` (no port
listener) and signs its own user in against better-auth. `vitest.config.e2e.ts`
sets `fileParallelism: false` on purpose — parallel files blow better-auth's
shared 3-req/10s sign-in limiter and later specs 403. Vitest 3.2.4 runs each
file in its own forked worker (`pool: forks`, `isolate: true`), so each file
boots its own `AppModule` with its own in-memory better-auth limiter.

The suite is **not** self-contained. `AppModule` wires:

- `PrismaModule` → real PostgreSQL, schema migrated. This is the only
  `onModuleInit` that blocks `app.init()` (`PrismaService.onModuleInit` →
  `$connect()`, 5 s timeout). `apps/api` has no `ScheduleModule`/`@Cron`.
- `QueueModule` → BullMQ `forRootAsync` against real Redis (`REDIS_URL` via
  `buildRedisConnection()` in `packages/queue`, which throws if `REDIS_URL` is
  unset), queues `PING`, `MAILER`, `ORDERS`. Connects lazily — does not block
  `app.init()`, but spec operations that enqueue will fail without Redis.
- `StorageModule` → `StorageService`, which `requiredEnv()`s all `S3_*` keys at
  field-init time. `products` / `stores` / `orders` / `buyer-proof-submit-race`
  specs `PutObject` (URL-shape assertion only, no anonymous GET-back).
- `MailerModule` → `MailerService.send()` only **enqueues** a `MAILER` job. The
  e-mail HTML is rendered and written to `apps/workers/.mailer-dev/*.html` by
  **`apps/workers`**, not the API. **21** of the 24 specs' `beforeAll` calls
  `waitForNewMailerFile(...)` (`apps/api/test/schema-assert.ts:71`) with a
  **5000 ms** timeout right after sign-up and throw on miss — so a **running
  `apps/workers` process** draining the `MAILER` queue, sharing that directory,
  is a hard dependency. The 3 that don't wait on mail are `app.e2e-spec.ts`,
  `customer-auth-rate-limit.e2e-spec.ts`, and `stores-sitemap.e2e-spec.ts`.
- Several specs `readFileSync('apps/api/openapi.json')` directly (committed,
  git-tracked, ~222 KB) and assert response shapes against it.

Both the API test helper and the worker resolve `.mailer-dev` from
`import.meta.url`, not CWD, and both land on `apps/workers/.mailer-dev` for a
single checkout — the requirement is one checkout / one filesystem, not a
specific CWD.

`apps/api/.env` supplies these locally (Vitest auto-loads `.env` from its
`test.root` into `process.env` without overriding already-set vars). That file
is **git-ignored**, so CI must set every value explicitly; a job-level `env:`
block is already in `process.env` before the step, so it wins over any `.env`.

`apps/workers/main.ts` calls `validateEnv()` which hard-requires `REDIS_URL`,
`INTERNAL_API_URL`, `INTERNAL_JOBS_SECRET` at boot and validates
`MAIL_DRIVER ∈
{file, resend}`, then `app.listen(process.env.PORT ?? 3002)`. Its
`/health` (`apps/workers/src/health/health.controller.ts`) is **liveness only**
— returns `{status:"ok"}` unconditionally, no Redis/DB check — and
`@nestjs/bullmq` starts its worker Redis connection _after_ `app.listen()`
resolves. `ExpireOrdersSchedulerService` / `ExpirePremiumSchedulerService`
register repeating BullMQ job schedulers in `async onModuleInit()`; their
processors `fetch()`
`${INTERNAL_API_URL}/internal/{orders,premium}/expire-sweep`.

CD (`.github/workflows/cd.yml`) triggers on
`workflow_run: { workflows: ["CI"],
types: [completed] }` and its `gate` job
(`cd.yml:26-30`) requires:

```text
github.event.workflow_run.conclusion == 'success' &&
github.event.workflow_run.event == 'push' &&
github.event.workflow_run.head_branch == 'main' &&
github.event.workflow_run.head_repository.full_name == github.repository
```

then every downstream job checks out `ref: needs.gate.outputs.head_sha`. **So
making E2E part of CI's outcome is sufficient to block CD.** Both detection
mechanisms below ultimately manifest through
`github.event.workflow_run.conclusion` — not two independent gates, but two ways
an unsatisfied E2E turns that conclusion non-`success`:

1. If `e2e` runs and is `failure` / `cancelled` / timed-out, the CI **run**
   conclusion is non-`success` on its own and `cd.yml`'s gate fails closed,
   regardless of `ci-success` (`continue-on-error` is explicitly forbidden on
   the job, which is what guarantees this).
2. The only way CD could still start is CI-run-conclusion `success` while `e2e`
   didn't actually pass — i.e. `e2e` was wrongly `skipped` on a push. That is
   caught **only** by `ci-success`'s new per-result logic (decision 5), so that
   one shell condition is load-bearing.

Branch protection (decision 7) requiring `CI Success` before merge is a third,
pre-merge layer against a PR that edits the `e2e` job or `ci-success` itself.

`ci.yml` concurrency is `group: ${{ github.workflow }}-${{ github.ref }}`
(`= CI-refs/heads/main` for main pushes), `cancel-in-progress: true`. A newer
merge cancels the older in-flight run; `cancelled` ≠ `success` so no
out-of-order deploy. The already-completed-older-run edge (a green older CI
emits its `workflow_run` after a newer push) is **not** closed by concurrency —
CD's own `git merge-base --is-ancestor` staleness guard (`cd.yml:141-153`) and
non-cancelling `production-deploy` group bound it. Unchanged here.

A `workflow_dispatch`-triggered CI run carries
`workflow_run.event ==
'workflow_dispatch'`, so `cd.yml`'s gate is never
selected for it and every `needs: gate` job is skipped — a manual run, green or
not, can never authorize CD. (It does still emit a `workflow_run` event, so CD's
`gate` job appears and immediately no-ops via its `if:` — a skipped CD run after
a manual CI dispatch is expected, not a failure.)

## Goals

1. Run all 24 existing `apps/api` E2E specs on every push to `main` (i.e. after
   a PR merges), against disposable, test-only services.
2. Do **not** run E2E on pull requests or PR updates — PR CI cost unchanged.
3. Make a failed / cancelled / timed-out / wrongly-skipped E2E run block CD, via
   CI's `ci-success` gate and CD's existing `workflow_run` trigger.
4. CD deploys exactly the SHA E2E tested (already true).
5. Enough failure diagnostics to separate an app failure from a service /
   migration / queue / storage bootstrap failure.
6. Land in two steps: a non-blocking baseline (job runs, result observed but not
   required) proving 24/24 green on a real runner, then flip to required.

## Non-goals

- No browser / Playwright / Cypress suite for `apps/web`. No E2E suite for
  `apps/workers` or `apps/sanity` (none exist; leave it).
- No new product-flow coverage — the 24 existing specs are the scope. The only
  sanctioned app-code change is the CI-only env guard in decision 6. Decision
  6b, if needed, is a test-helper change rather than an app-code change.
- No `merge_group` / merge-queue support, no `merge-policy.yml` skip-CI-token
  workflow, no `release-config` path-filter job (all were in the superseded
  plan; none exist in the repo today; orthogonal to this gate).
  `.github/CODEOWNERS` **already exists** (`*` glob missing — a pre-existing
  cosmetic defect) — leave it as-is; not touched here.
- No change to `cd.yml` behaviour — comment updates only.
- No change to `vitest.config.e2e.ts` (keep serial), no `--runInBand` flags, no
  per-package split.
- No production credentials, data, or endpoints anywhere in the job.
- Branch-protection changes are a repo-settings task, not done by this plan;
  written up as a manual checklist (decision 7).

## Design decisions

### 1. One `e2e` job inside `ci.yml`, push-only, with a manual escape hatch

Add the job to `ci.yml` (not a second workflow — a separate one would race CD,
which keys off the `CI` workflow by name).

Add a `workflow_dispatch` trigger with **one boolean input**:

```yaml
on:
  push:
    branches: [main]
    # paths-ignore intentionally kept ONLY on push — see decision 1 note.
    paths-ignore: ["...unchanged..."]
  pull_request:
    branches: [main]
    # paths-ignore REMOVED from pull_request (see decision 1 note).
  workflow_dispatch:
    inputs:
      run_e2e:
        description: "Run the API E2E job on this manual run"
        type: boolean # MUST be boolean, not string
        default: false
  # merge_group is deliberately NOT wired — if a merge queue is ever enabled
  # with `CI Success` required, add `merge_group:` here or the queue wedges.
```

Job selector:

```yaml
e2e:
  name: E2E (API)
  # needs: [] — the full suite runs on every push regardless of which
  # packages changed, and consumes no detect-changes output. Coupling it to
  # detect-changes only adds latency and a skip vector.
  needs: []
  if: >-
    github.event_name == 'push' ||
    (github.event_name == 'workflow_dispatch' && inputs.run_e2e)
  runs-on: ubuntu-latest
  timeout-minutes: 30 # a timeout is a FAILED gate, never a bypass
  # NEVER set `continue-on-error: true` on this job — it would let a red
  # suite produce a `success` run conclusion and defeat both CD-block layers.
```

`ci.yml`'s `push` trigger is already `branches: [main]`, so
`github.event_name
== 'push'` **is** "landed on main". On `pull_request` the job
isn't selected → reports `skipped`.

**Boolean-input footgun (bake into a YAML comment):** always reference
`inputs.run_e2e`, never `github.event.inputs.run_e2e` (the latter is the string
`'false'`, which is truthy in an Actions expression). Always keep the
`github.event_name == 'workflow_dispatch' &&` guard in front of any
`inputs.run_e2e` read (job `if:` **and** the `ci-success` script) — on a `push`
the `inputs` context is null and the guard is what stops it being evaluated.

**`paths-ignore` note (decision 1):** the superseded plan removed `paths-ignore`
entirely; this plan keeps it only on `push` (so a Markdown-only or
`.gitignore`-only merge doesn't run a 30-min suite + a real CD cutover) and
**removes it from `pull_request`**. Reason: decision 7 makes `CI Success` a
required check; with `paths-ignore` on the `pull_request` trigger, a docs-only
PR never produces a `CI Success` check run and is stuck "Expected — Waiting for
status to be reported", unmergeable without admin override. Removing it from
`pull_request` only costs a fast per-package CI run (all jobs `skipped` →
`ci-success` green) on docs PRs. A Markdown-only or `.gitignore`-only push to
`main` still skips the whole workflow, emits no `workflow_run`, and CD correctly
doesn't run.

### 2. Provision disposable services; run a real `workers` process

PostgreSQL and Redis-compatible Valkey as GitHub Actions **service containers**
(digest-pinned, pulled from GHCR with `GITHUB_TOKEN`). MinIO + `mc` as explicit
steps on a user-defined Docker network (a sidecar `mc` container can't reach a
service container over `127.0.0.1`; use the MinIO container name for `mc`, the
published `127.0.0.1:9000` for the host process).

- **PostgreSQL** —
  `ghcr.io/immich-app/postgres:18-vectorchord0.5.3-pgvector0.8.1` (PostgreSQL 18
  with the standard entrypoint; GHCR image),
  `POSTGRES_USER=ci POSTGRES_PASSWORD=ci POSTGRES_DB=ci`, `5432:5432`,
  healthcheck `pg_isready -U ci -d ci`.
  `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci?schema=public`.
- **Redis-compatible service** — `ghcr.io/valkey-io/valkey:7-alpine` (matches
  the Redis protocol used by the app), no password, `6379:6379`, healthcheck
  `redis-cli ping`. `REDIS_URL=redis://localhost:6379`.
- **MinIO** — `ghcr.io/coollabsio/minio`, root creds `e2e` / `e2e-secret-key`
  (test-only literals), `--name biasmarket-e2e-minio`, `-p 9000:9000`, network
  `biasmarket-e2e`; poll `http://127.0.0.1:9000/minio/health/live`.
- **`mc`** — the same MinIO GHCR image with `--entrypoint /usr/bin/mc`, same
  network, `MC_HOST_ci=http://e2e:e2e-secret-key@biasmarket-e2e-minio:9000`;
  create buckets `products`, `logos`, `payments`; `mc anonymous set download` on
  `products` + `logos` only (`payments` stays private — mirrors `minio-init` in
  the dev compose).

**Pin all three unique images by digest.** Re-resolve digests at implementation
time (`docker buildx imagetools inspect <ref>`); record the human-readable tag
next to each digest in a workflow comment. Do **not** copy digests from the
superseded plan. The gate must not go required while any image is on a floating
tag.

**GHCR authentication — cover both pull paths:** Postgres + Valkey are
`services:` containers, pulled by the runner **before any step executes**, so
they use `jobs.e2e.services.<id>.credentials` with `github.actor` and the
workflow `GITHUB_TOKEN`. MinIO + `mc` are `docker run` inside the helper step,
so the preceding `docker/login-action` authenticates GHCR. All pulls are
digest-pinned and no Docker Hub credentials are needed.

**No standalone API process.** The suite is fully in-process; the only
worker→API traffic is the expire-sweep `fetch()`es, which decision 6 disables.
So nothing calls a running API and nothing consumes its `/api/health`. Set
`INTERNAL_API_URL=http://127.0.0.1:3000` on the worker only to satisfy its
boot-time `validateEnv()` — it is never dialed. (If decision 6's guard is ever
removed, the schedulers would fire and log `fetch` failures against that
unreachable URL — harmless log noise, not a test failure. Decision 6 stays
mandatory regardless.)

**Run the built workers as a real process** (`node apps/workers/dist/main.js`)
with `MAIL_DRIVER=file`. Gating on `GET http://127.0.0.1:3002/health` + "PID
alive" is **not sufficient** — `/health` is liveness-only and the BullMQ
`MAILER` consumer connects to Redis _after_ `app.listen()`. There is a window
where `/health` is 200 but no job is being drained, and the first mail-dependent
spec (`buyer-proof-submit-race`, 5 s budget) can flake on a cold Redis. Add a
**real MAILER-consumer readiness probe** after `/health` goes green:

1. **Preferred:** wire an `@OnWorkerEvent("ready")` handler (from
   `@nestjs/bullmq` — `WorkerHost` has no plain `onModuleInit`/listening hook,
   so this decorator on the processor, or `this.worker.on("ready", …)`, is the
   real mechanism) in `apps/workers/src/jobs/mailer/mailer.processor.ts` that
   does `logger.log("MAILER worker ready")`; the CI helper blocks on that line
   in `.ci/e2e-workers.log`. This is a small real code change (decorator +
   handler + log), not just a log line — call it out in the PR as a sanctioned
   diagnostic addition, with a unit test.
2. Fallback: from the helper, enqueue a throwaway `MAILER` job and wait for a
   corresponding `.mailer-dev` file / completion log.
3. A blind `sleep` is the weak last resort.

Build order (Turbo resolves `@biasmarket/db`, `@biasmarket/queue`,
`@biasmarket/i18n`, `@biasmarket/types`, `@biasmarket/utils` `dist/` — none
commit `dist/`, and `pnpm install` runs no build). `--filter=api` is still
needed: the OpenAPI drift check (step 7) consumes `apps/api/dist`.

```bash
pnpm turbo run build --filter=api --filter=workers
```

### 3. Shared test-only env example

All literals live in `scripts/ci/e2e.env.example` (disposable runner); **never**
production values or `secrets.*` (except the workflow-provided `GITHUB_TOKEN`
used for GHCR pulls in decision 2). The API's required set is the 16 keys in
`apps/api/src/config/env.validation.ts` — read that file and cover every one:

```text
DATABASE_URL=postgresql://ci:ci@localhost:5432/ci?schema=public
REDIS_URL=redis://localhost:6379
BETTER_AUTH_SECRET=<64-hex literal, test-only>
BETTER_AUTH_URL=http://localhost:3000
CUSTOMER_ACCOUNT_TOKEN_SECRET=<64-hex literal, test-only>
WEB_URL=http://localhost:3001
INTERNAL_JOBS_SECRET=<literal, test-only>
MONITORING_WEBHOOK_SECRET=<literal, test-only>
SITEMAP_INTERNAL_TOKEN=<literal, test-only>
S3_ENDPOINT=http://127.0.0.1:9000
S3_PUBLIC_URL=http://127.0.0.1:9000
S3_ACCESS_KEY=e2e
S3_SECRET_KEY=e2e-secret-key
S3_BUCKET=products
S3_LOGO_BUCKET=logos
S3_PAYMENT_BUCKET=payments
NODE_ENV=test
```

`NODE_ENV=test` also stops `env.validation.ts` treating the run as production.
There is no standalone API process, so `PORT` is irrelevant to the job-level
env; the worker step relies on its own `?? 3002` default (don't set `PORT` there
either unless something conflicts).

CI invokes `scripts/ci/load-e2e-env.sh` after checkout in the `api`, `db`, and
`e2e` jobs, so the API OpenAPI check, Prisma checks, and E2E helper share one
reviewed env contract. Runtime-only worker overrides are set by the helper.

Workers-process env (its own step): `REDIS_URL` (same),
`INTERNAL_API_URL=http://127.0.0.1:3000` (never dialed — see decision 2),
`INTERNAL_JOBS_SECRET` (byte-identical to the suite's), `MAIL_DRIVER=file`,
`E2E_DISABLE_EXPIRATION_SCHEDULERS=true` (decision 6). `S3_ACCESS_KEY` /
`S3_SECRET_KEY` in the suite env must equal the MinIO root creds and the `mc`
alias exactly. Never `MAIL_DRIVER=resend` / `RESEND_*`.

Decision 6b (the auth rate-limit issue) remains pending: the baseline did not
show a 429, so no spec-level stagger/retry or env flag is present. Its
conditional remedy is documented in decision 6b. No `E2E_DISABLE_AUTH_RATELIMIT`
is set.

### 4. One trapped helper; strict step order

Background processes started in one `run:` step aren't visible to a later step's
cleanup, and a `trap` in an earlier step doesn't survive into a later one. So
"start MinIO" through "run the suite" through "stop everything" is **one `run:`
block**. Prefer extracting it to a committed `scripts/ci/e2e.sh` (new dir — the
repo currently keeps shell only under `infra/`; document the new location) so
it's `bash -n` / shellcheck-able; an inline step is acceptable if small. A
separate `if: always()` step uploads the artifact afterward.

Helper order (exact — **build before the OpenAPI check**, see review H1):

1. `trap cleanup EXIT INT TERM`; `mkdir -p .ci`.
2. `docker network create biasmarket-e2e`; start named MinIO container; wait for
   `/minio/health/live` → `.ci/e2e-minio.log`.
3. Run `mc`: create 3 buckets; `anonymous set download` on `products` + `logos`.
4. Poll Postgres (`pg_isready`) and Redis with a runner-independent TCP
   connectivity check against `127.0.0.1:6379`, with service-specific failure
   messages (service containers are usually up at job start; poll anyway).
5. `pnpm --filter @biasmarket/db db:generate` (Prisma client only — does not
   build the tsc packages).
6. **`pnpm turbo run build --filter=api --filter=workers`** — builds
   `@biasmarket/queue` et al. `dist/` that `apps/api/dist/app.module.js`
   imports. Must precede step 7.
7. OpenAPI trackedness + drift check, using the **already-built** output (do
   **not** call `pnpm --filter api generate:openapi` — its inner script is bare
   `nest build`, which does not build workspace deps and throws
   `ERR_MODULE_NOT_FOUND` on `@biasmarket/queue` on a cold runner):
   - `test -s apps/api/openapi.json`
   - `git ls-files --error-unmatch apps/api/openapi.json`
   - `node apps/api/scripts/generate-openapi-spec.ts` (consumes `apps/api/dist`
     from step 6; the script `Test.createTestingModule` + `app.init()` but
     **stub-overrides `PrismaService`**, so it needs `REDIS_URL` + `S3_*` +
     auth/monitoring/sitemap env — all in decision 3 — but **no reachable DB and
     no migrated schema**, which is why running it before step 8 is fine. BullMQ
     connects lazily so `app.init()` doesn't block on Redis. It does **not**
     need Resend env, despite a stale comment in that script.)
   - `git diff --exit-code -- apps/api/openapi.json` → `.ci/e2e-openapi.log`
     (fail on drift). See decision 5a's PR-time counterpart.
8. `pnpm --filter @biasmarket/db exec prisma migrate deploy` against the empty
   `ci` DB (`packages/db/prisma.config.ts` supplies the datasource URL from
   `DATABASE_URL` and the migrations path; 43 migration dirs exist) →
   `.ci/e2e-migrate.log`.
9. Start workers:
   `(cd "$GITHUB_WORKSPACE" && exec node apps/workers/dist/main.js) >.ci/e2e-workers.log 2>&1 & WORKER_PID=$!`
   with the worker env from decision 3; poll `http://127.0.0.1:3002/health`;
   fail on early exit; assert **both** scheduler-disabled log lines appear — the
   two services must log **distinct** text (e.g.
   `"orders expiration
   scheduler disabled"` /
   `"premium expiration scheduler disabled"`) so the check can't pass on one
   line alone; then run the **MAILER-consumer readiness probe** from decision 2.
10. `pnpm --filter api test:e2e` → `.ci/e2e-suite.log` (unchanged command).
11. `cleanup`: `kill` + `wait` `WORKER_PID`, verify gone;
    `docker rm -f biasmarket-e2e-minio`; `docker network rm biasmarket-e2e`;
    `rm -rf apps/workers/.mailer-dev`.

Diagnostics: on failure, `actions/upload-artifact@v4` (repo pins action majors;
`.github/` has no artifact upload today to copy from) with `retention-days: 1`,
uploading `.ci/e2e-api.log`, `.ci/e2e-workers.log`, `.ci/e2e-migrate.log`,
`.ci/e2e-minio.log`, `.ci/e2e-openapi.log`, `.ci/e2e-suite.log`. **Never upload
`apps/workers/.mailer-dev`** — it holds verification / password-reset links
(test values, still link-shaped). No machine-readable vitest reporter is
configured; call the artifact "captured stdout/stderr", don't imply a JUnit file
(add `vitest --reporter=junit --outputFile` later if wanted).

Checkout `actions/checkout@v7` `persist-credentials: false` (default depth is
fine — the drift check diffs the working tree, not a base ref).
`pnpm/action-setup@v6` + `actions/setup-node@v6` with `NODE_VERSION` (26) /
`PNPM_VERSION` (10.11.0) from the workflow `env:`, `cache: pnpm`.
`pnpm install --frozen-lockfile`.

`timeout-minutes: 30` to start; measure real duration after the first few main
pushes and tighten.

### 5. Wire `e2e` into `ci-success`, with explicit result handling

Add `e2e` to `ci-success.needs` (current `needs`: `detect-changes`, `api`,
`web`, `workers`, `db`, `i18n`, `queue`, `types`, `ui`, `utils` —
`migration-safety` is deliberately excluded as a PR-only informational job; keep
it excluded). Keep `if: always()`. Replace the current failure-only checks
(`ci.yml:595-633`, which silently pass on `cancelled` / `skipped`) with explicit
allowed-result logic. Map every `${{ needs.*.result }}` and
`${{ needs.detect-changes.outputs.* }}` into the step's `env:` block and compare
shell vars (`"$API_RESULT"` etc.) — feeding `${{ }}` straight into `[[ ]]` is
brittle.

- **Assert `detect-changes == 'success'` first.** If it failed, its `outputs.*`
  are empty strings and every `== 'true'` / `== 'false'` check silently falls
  through.
- Each package job: `detect-changes` output `'true'` → job must be `'success'`;
  output `'false'` → job must be `'skipped'`. `dorny/paths-filter@v4` emits the
  literal strings `'true'`/`'false'` (existing jobs already rely on this).
  Anything else (`failure`, `cancelled`) fails the gate.
- `e2e`:
  - `github.event_name == 'push'` → must be `'success'`. `skipped` / `failure` /
    `cancelled` all fail `ci-success`.
  - `github.event_name == 'workflow_dispatch' && inputs.run_e2e` (guarded, see
    decision 1) → must be `'success'`. (CD still rejects the event type.)
  - **Every other case** — `pull_request`, `workflow_dispatch` with `run_e2e`
    false, and any future/unknown trigger — → `e2e` must be `'skipped'`. This
    fails closed on an unrecognised event and fixes the `workflow_dispatch` +
    `run_e2e=false` gap (a manual run without E2E must not wrongly fail
    `ci-success`).

Add an in-file comment: the whole branch-protection guarantee hinges on this
job's `name: CI Success` — renaming the job key or its `name:` silently detaches
the required check.

On a `workflow_dispatch` run, `dorny/paths-filter` has no PR base or before-SHA
and typically resolves every filter to `'false'` → all package jobs `skip` → the
`'false' ⇒ skipped` mapping passes them, and `e2e` carries the result. So
`ci-success` behaves sanely on a manual run regardless; CD rejects it on event
type anyway.

**Baseline phase (Goal 6):** use `workflow_dispatch(run_e2e=true)` on the branch
until 24/24 files are green on a clean runner, applying decision 6b's stagger
**only if** a 429 actually appears. T6 is already landed in this revision, so
the first eligible push to `main` is intentionally a production gate while T5 is
incomplete: `e2e` is in `ci-success.needs`, a failed or skipped E2E result makes
`CI Success` fail, and CD's `workflow_run` gate proceeds only for a successful
push CI run. Until T5 is green, merges with non-ignored changes are therefore
expected to block CD; after the baseline is green, continue the push/CD
verification below.

### 5a. Move the OpenAPI drift check to PR time too

The drift check in decision 4 step 7 runs only inside the push-only `e2e` job.
If a PR merges a stale `apps/api/openapi.json`, the **next** `main` push goes
red and CD is blocked until a follow-up fix PR lands. Add the same trackedness +
`node apps/api/scripts/generate-openapi-spec.ts` + `git diff --exit-code` check
to the PR-time `api` job (`ci.yml:124-180`), after its build step, so drift is
caught before merge. (The `api` job already builds via
`pnpm turbo run build --filter=api`, so the H1 ordering hazard doesn't apply —
but use the built output, not `generate:openapi`.)

**The `api` job must load the shared env example for this step.** Today it sets
only `DATABASE_URL` (`ci.yml:130-133`), but `generate-openapi-spec.ts` does
`app.init()` and `AppModule` init eagerly needs `REDIS_URL` (BullMQ factory
throws if unset — connects lazily so a bare syntactically-valid URL is enough,
no Redis service needed), all `S3_*` (`StorageService.requiredEnv` at field
init), and `BETTER_AUTH_SECRET/URL`, `CUSTOMER_ACCOUNT_TOKEN_SECRET`,
`INTERNAL_JOBS_SECRET`, `MONITORING_WEBHOOK_SECRET`, `SITEMAP_INTERNAL_TOKEN`,
`WEB_URL`. Load `scripts/ci/e2e.env.example` into `GITHUB_ENV` after checkout —
no service containers, `PrismaService` is stub-overridden in the script. This is
its own task item (T7).

### 6. CI-only worker scheduler-disable guard (app-code change #1)

`ExpireOrdersSchedulerService` / `ExpirePremiumSchedulerService`
(`apps/workers/src/jobs/{orders,premium}/*-scheduler.service.ts`) register
repeating schedulers in `async onModuleInit()`. Add an env-gated early return at
the top of both `onModuleInit()`s, with **distinct** log text per service so the
CI helper (step 9) can assert both fired:

```ts
// orders scheduler
if (process.env.E2E_DISABLE_EXPIRATION_SCHEDULERS === "true") {
  this.logger.log(
    "orders expiration scheduler disabled (E2E_DISABLE_EXPIRATION_SCHEDULERS)",
  );
  return;
}
// premium scheduler
if (process.env.E2E_DISABLE_EXPIRATION_SCHEDULERS === "true") {
  this.logger.log(
    "premium expiration scheduler disabled (E2E_DISABLE_EXPIRATION_SCHEDULERS)",
  );
  return;
}
```

Processors (`*.processor.ts`, separate `@Processor` classes) stay registered —
only the schedulers are suppressed. Default/unset behaviour unchanged. Set only
on the CI worker process. Update both `*-scheduler.service.spec.ts` to cover
both branches.

No current spec crafts an order with a past `expiresAt`
(`create-order.usecase.ts` sets `expiresAt = now + holdWindowHours*3600e3`,
default 48 h), so this guard is **preventative** — it removes a timing-dependent
flake class the 24 specs don't currently trigger. Keep it anyway (near-zero
cost); note in Status if the baseline was green without it.

### 6b. better-auth rate-limit collision — spec-level stagger, conditional

`auth.config.ts:124` forces `rateLimit: { enabled: true }` in every environment;
better-auth's default rule throttles sign-in / sign-up / change-password /
change-email at **3 requests / 10 s per IP**. `coupon-redeem-race.e2e-spec.ts`'s
`beforeAll` calls `signUpAndSignIn` twice (needs two sellers) → 4 strict-limited
hits from `127.0.0.1` in quick succession; on a fast CI runner the 2nd sign-in
can 429 and fail `.expect(200)` for the whole file.
`customer-account-auth.e2e-spec.ts`'s cross-store `it` is a secondary suspect.
This collides with the "24/24 green, minimal spec changes" criterion for
flipping the gate to required.

**An env carve-out (`E2E_DISABLE_AUTH_RATELIMIT`) is ruled out:**
`customer-auth-rate-limit.e2e-spec.ts` contains
`it("throttles better-auth sign-in after 3 requests/10s")` which asserts
`responses[3] === 429` against exactly that limiter (its file header says so). A
job-level flag that disables the limiter would make that assertion get `200` and
fail the file — trading one red spec for another.

**Remedy (only if the T5 baseline actually shows the 429):** a minimal,
called-out test-environment fix in the one or two offending `beforeAll`s — a
short `await sleep(10_000)` between the paired `signUpAndSignIn` calls, or a
retry-on-429 wrapper in the shared `signUpAndSignIn` helper
(`apps/api/test/schema-assert.ts`). The helper-level retry is preferable — one
place, benefits any future multi-seller spec, doesn't touch app code. Flag it
with severity/rationale per the Non-goals exception.

If the baseline is green as-is, skip 6b and record that. There is no app-code
change #2.

### 7. `cd.yml` comments + manual branch-protection checklist

`cd.yml` needs no functional change. Update any comment describing CI as
"lint/typecheck/build/unit tests" or "excludes E2E" to note a push-only E2E job
now gates `ci-success`; link this plan.

Manual, admin-only, recorded here as a checklist:

- Require status check **`CI Success`** on `main` (exact name = the job's
  `name:`).
- Require a PR before merging to `main`; disallow direct pushes.
- `e2e` is intentionally **not** a PR-required check — enforced post-merge by
  the push CI run + CD's `workflow_run` gate.
- If a merge queue is later enabled: add `merge_group:` to `ci.yml`'s `on:`
  first, or the queue wedges on the never-reported `CI Success` check.

### 8. Operator doc: flaky-E2E recovery

Because `e2e` is required and serial (24 files, `fileParallelism: false`,
better-auth waits), a single flake blocks all `main` deploys. Recovery is
**"Re-run failed jobs" on the CI run** — when `e2e` then passes, the run
conclusion flips to `success` and GitHub emits a fresh `workflow_run: completed`
with `event` still `push`, so CD's `gate` proceeds. Document this in
`docs/core/deploy.md` so operators re-run the job rather than pushing
empty/no-op commits (which trigger a real CD cutover).

## Task list

- **T1** — `ci.yml` `on:`: add `workflow_dispatch` with boolean `run_e2e`
  (`type: boolean, default: false`); remove `paths-ignore` from the
  `pull_request` trigger, keep it on `push`; add the `merge_group`-absence
  comment.
- **T2** — `ci.yml`: add the `e2e` job (decisions 1–4): `needs: []`,
  push-or-guarded-dispatch `if:`, no `continue-on-error`, Postgres + Valkey
  service containers (digest-pinned), shared test env example loaded after
  checkout (decision 3, no `PORT`, no standalone API), the one trapped helper
  (inline or `scripts/ci/e2e.sh`) in the exact step order (build → OpenAPI check
  → migrate → workers → suite → cleanup), `if: always()`
  `actions/upload-artifact@v4` failure artifact (`retention-days: 1`; logs
  `.ci/e2e-{workers,migrate,minio,openapi,suite}.log`; **no** mailer dir).
- **T3** — resolve + pin the 3 unique GHCR image digests (Postgres, Valkey,
  MinIO; the MinIO image also provides `mc`), record tags in comments, grant
  `packages: read`, and cover both pull paths with `GITHUB_TOKEN`: service-
  container `credentials:` for Postgres/Valkey and `docker/login-action` for the
  MinIO/`mc` `docker run`.
- **T4** — `apps/workers`:
  - `E2E_DISABLE_EXPIRATION_SCHEDULERS` guard in both `onModuleInit()`s, with
    **distinct** per-service log text, + both `*-scheduler.service.spec.ts`
    branches (decision 6).
  - `@OnWorkerEvent("ready")` handler in `mailer.processor.ts` logging
    `"MAILER worker ready"` (decision 2 probe option 1) + a unit test.
- **T5** — baseline: `workflow_dispatch(run_e2e=true)` from the branch. The
  manual run can isolate the suite, but push runs already have the E2E gate
  enabled by T6. Iterate to 24/24 files green. Explicitly confirm whether
  `coupon-redeem-race` / `customer-account-auth` trip the better-auth 429; if so
  apply decision 6b's stagger/retry (helper-level preferred). Record file/case
  counts, runtime, whether decision 6 was load-bearing, and whether 6b was
  needed.
- **T6** — `ci.yml`: add `e2e` to `ci-success.needs`; replace the gate body with
  the decision-5 per-result logic (env-mapped vars, `detect-changes` first,
  explicit `e2e` cases incl. the fail-closed default); add the check-name-rename
  comment. Landed before T5 was green; this intentionally makes the first
  eligible `main` push a production gate until T5 passes.
- **T7** — `ci.yml` `api` job: add the PR-time OpenAPI trackedness + drift check
  (decision 5a) and loads the shared test env example (no service containers).
- **T8** — `cd.yml`: update stale CI-scope comments; link this plan. No logic
  change.
- **T9** — `docs/core/deploy.md`: paragraph that merges to `main` run the API
  E2E suite before CD and PR updates don't; plus the decision-8 flaky-rerun
  recovery note (re-run the job, don't push no-op commits).
- **T10** — update this plan's Status: measured runtime, final file/case counts,
  digest tags, GHCR image choice, whether decisions 6/6b were needed.
- **T11** (manual, not code) — apply the decision-7 branch-protection checklist;
  confirm `CI Success` is the required check.

## Rollout / verification

1. **Baseline (T5) and first push (T6):** `workflow_dispatch(run_e2e=true)` on
   the branch isolates the baseline run. The clean-runner run completed all 24
   files but remains blocked by the existing courier/order failures recorded in
   Status. Because T6 is already landed, the first eligible push to `main` is
   intentionally a production gate while T5 is incomplete: `e2e` is required by
   `CI Success`, and CD's `workflow_run` gate deploys only after the whole CI
   run succeeds. Fix and rerun the failing specs before expecting a deployment.
2. Reproduce the bootstrap locally with the same env contract — **first move
   aside the developer's git-ignored `apps/api/.env`** (on this machine it's
   also missing `SITEMAP_INTERNAL_TOKEN`), or the local run won't actually
   validate the CI env set.
3. Lint the YAML; eyeball the Actions expressions — the push-only + guarded
   `inputs.run_e2e` `if:`, and `ci-success` handling of `success` / `skipped` /
   `failure` / `cancelled` for every upstream incl. the fail-closed `e2e`
   default.
4. Throwaway PR, push to it a few times: normal per-package CI runs, `e2e` stays
   not-selected, `ci-success` green with `e2e` skipped. Also open a
   **docs-only** PR: confirm `CI Success` still reports (not stuck pending).
5. Merge it: exactly one `e2e` run for the resulting `main` SHA, all 24 files
   run, `CI Success` waits on it.
6. `workflow_dispatch(run_e2e=true)` and force a failure (temporary bad
   assertion on the branch, or point `DATABASE_URL` at a dead port): that CI
   run's `ci-success` fails **and** CD does not build / SSH / deploy — its
   `workflow_run.event` is `workflow_dispatch`. Revert.
7. Merge a known-green commit: CD starts only after the successful CI run; its
   checkout / image tags equal the tested merge SHA.
8. Rapid pair of merges: the superseded/cancelled older CI run does not deploy;
   only the newest green SHA does.
9. Confirm branch protection requires `CI Success` and blocks direct pushes.
10. Fill in Status (T10).

## Risks / known limitations

- **In-process suite, not process-level.** Specs boot `AppModule` via Nest's
  testing harness — this gate does not prove `main.ts` bootstrap, the port
  listener, CORS, Helmet, or production `validateEnv()`. CD's own candidate
  health / smoke / deploy-preflight stay the process-level layer; an E2E pass is
  not "the VPS is deployable" and must not bypass a failed preflight.
- **Serial suite = wall-clock cost & flake blast radius.** 24 files, no file
  parallelism, better-auth waits. One flake blocks all `main` deploys until
  re-run (decision 8). 30-min timeout is a guess; measure and tighten. Don't
  parallelize without first making the specs data- and rate-limit-isolated.
- **Older-completed-run edge** is bounded by CD's ancestry staleness guard, not
  by CI concurrency. No separate latest-main-SHA check added.
- **Container registry availability** — mitigated by T3's two-path GHCR auth;
  still an external dependency.
- **Every `main` push with at least one non-ignored path** (anything beyond
  Markdown or `.gitignore`, including infra- or CI-meta-only changes) now runs
  the full ~30-min E2E suite and, on success, a real CD cutover. Deliberate
  (Goal 1) — the gate must test what actually ships — but it lengthens the
  merge→live path for changes that don't touch app code. Markdown-only and
  `.gitignore`-only pushes are excluded by the push trigger.
- **Digest drift** — pinned images re-resolved only through a reviewed workflow
  change.
- **Suite growth** — new `*.e2e-spec.ts` files are auto-discovered by the glob;
  one needing a service beyond Postgres / Redis / MinIO / workers would fail
  here until the job learns about it.
- **Sanctioned app-code changes:** decision 6's CI-only scheduler guard
  (env-gated, unit-covered, default behaviour unchanged) and decision 2's
  `@OnWorkerEvent("ready")` diagnostic log line. Decision 6b (a test-helper
  stagger/retry, not app code) applies only if the baseline shows the 429.

## Files expected to change

- `.github/workflows/ci.yml` — `workflow_dispatch` + `run_e2e`; `paths-ignore`
  off `pull_request`; new `e2e` job; `e2e` in `ci-success.needs` with rewritten
  result logic; shared env-example loading; PR-time OpenAPI drift check.
- `scripts/ci/e2e.env.example` — reviewed test-only env contract shared by CI
  jobs and the E2E helper.
- `scripts/ci/e2e.sh`, `scripts/ci/check-openapi-drift.sh`,
  `scripts/ci/load-e2e-env.sh`, `scripts/ci/check-destructive-migrations.sh`,
  and `scripts/ci/check-ci-success.sh` — CI helpers invoked by the workflow.
- `apps/workers/src/jobs/orders/expire-orders-scheduler.service.ts`,
  `apps/workers/src/jobs/premium/expire-premium-scheduler.service.ts` (+ their
  `.spec.ts`) — decision-6 guard, distinct log text.
- `apps/workers/src/jobs/mailer/mailer.processor.ts` (+ its `.spec.ts`) —
  `@OnWorkerEvent("ready")` readiness log (decision 2).
- `apps/api/test/schema-assert.ts` — decision-6b stagger/retry in the shared
  `signUpAndSignIn` helper, **only if** the baseline shows the 429 (T5).
- `.github/workflows/cd.yml` — comment updates only.
- `docs/core/deploy.md` — merge-gate paragraph + flaky-rerun recovery note.
- This plan — Status after rollout.
- Repo branch-protection settings — manual (decision 7), not a file.

No existing `*.e2e-spec.ts`, `vitest.config.e2e.ts`, or package test script
changes unless the suite genuinely can't run on a clean runner and the cause is
a real test-environment defect (decision 6b's helper stagger is the one
anticipated case) — call any such fix out separately with severity and
rationale.

## Review log

Three parallel subagents reviewed revision 1 (GitHub Actions semantics / runtime
dependencies / repo fact-check), then a consolidation pass folded every finding
into this revision.

**HIGH**

- _Build-before-OpenAPI ordering (runtime review H1)._ Rev 1 put the OpenAPI
  drift check (step 7) before `turbo build` (step 8). The check's
  `generate:openapi` script runs bare `nest build` (api-only, no workspace
  deps), then imports `apps/api/dist/app.module.js` which pulls
  `@biasmarket/queue` etc. — none commit `dist/`, `pnpm install` builds nothing
  → `ERR_MODULE_NOT_FOUND` on a cold runner, job dies before the suite.
  **Resolved:** build is now step 6, the check step 7 consumes the built output
  directly via `node apps/api/scripts/generate-openapi-spec.ts` (not
  `generate:openapi`).

**MEDIUM**

- _`ci-success` `workflow_dispatch` + `run_e2e=false` gap (Actions review)._ Rev
  1 only specified `run_e2e=true`. **Resolved:** decision 5 now has an explicit
  fail-closed default — any event that isn't `push` and isn't a guarded
  `workflow_dispatch`+`run_e2e` requires `e2e == skipped`.
- _`paths-ignore` + required `CI Success` wedges docs-only PRs (Actions review;
  regression vs. the superseded plan, which removed `paths-ignore`)._
  **Resolved:** decision 1 removes `paths-ignore` from `pull_request` only,
  keeps it on `push`.
- _Boolean-input footgun (Actions review)._ **Resolved:** decision 1 mandates
  `type: boolean`, `inputs.run_e2e` never `github.event.inputs.run_e2e`, and the
  `event_name == 'workflow_dispatch' &&` guard everywhere, with a YAML comment.
- _Push-only OpenAPI check can wedge `main` post-merge (Actions review)._
  **Resolved:** decision 5a adds the same check to the PR-time `api` job.
- _Worker `/health` doesn't prove the MAILER consumer is connected (runtime
  review M1)._ First mail-dependent spec has a 5 s budget. **Resolved:**
  decision 2 adds a real MAILER-consumer readiness probe (preferred: an explicit
  ready-log line + helper wait).
- _`coupon-redeem-race.e2e-spec.ts` 4 auth calls vs. 3-req/10s limiter (runtime
  review M2)._ **Resolved:** decision 6b adds a conditional CI-only rate-limit
  carve-out, to be confirmed/applied during the T5 baseline.
- _Docker Hub anonymous pull limits (Actions review)._ **Resolved:** T3 moves
  all E2E service and sidecar pulls to digest-pinned GHCR images and uses the
  workflow `GITHUB_TOKEN`; no Docker Hub secrets are required.
- _Flaky-E2E recovery undocumented (Actions review)._ **Resolved:** decision 8
  - T9 — "Re-run failed jobs" emits a fresh push `workflow_run`; don't push
    no-op commits.

**LOW (folded in)**

- No `continue-on-error` on `e2e` (comment) · drop `needs: detect-changes` →
  `needs: []` · map `needs.*.result` into `env:` and assert
  `detect-changes == 'success'` first · CD `gate` no-ops (not fails) on manual
  CI runs — note it · `merge_group` absence comment in `ci.yml` · `CI Success`
  check-name rename hazard comment · **`PORT` must not be job-level** (API would
  bind 3002 and collide with the worker) · step-10 asserts _both_
  scheduler-disabled lines · local repro must move aside the git-ignored
  `apps/api/.env` first · `.mailer-dev` is resolved via `import.meta.url` not
  CWD (rRev 1's "CWD at repo root" rationale dropped) ·
  `generate-openapi-spec.ts` has a stale "needs Resend env" comment — it doesn't
  · `actions/upload-artifact` pinned `@v4` (no repo precedent to copy) ·
  `.github/CODEOWNERS` already exists — Non-goals reworded to "leave as-is" ·
  concurrency group and CD gate conditions quoted verbatim in Context.

**Fact-check results (no correction needed):** 24 spec files (listed in
Context); the E2E service contracts match the dev compose (PostgreSQL 18 and
Redis protocol); Node 26 / pnpm 10.11.0 match `ci.yml` env + root
`packageManager`; `actions/checkout@v7`, `pnpm/action-setup@v6`,
`actions/setup-node@v6` match; `cd.yml` gate wording; `ci-success` is currently
failure-only over the 10-entry `needs`; `expire-*-scheduler.service.ts` +
`.spec.ts` siblings exist and implement `OnModuleInit`; `apps/api/openapi.json`
is tracked; `db:generate` is the real script name; 43 migration dirs under
`packages/db/prisma/migrations`; worker `/health` path and `{status:"ok"}`
shape; API `/api/health` `{status:'ok',db:'ok'}`; decision-3 env list covers all
16 `REQUIRED_ENV_VARS`; no spec needs a service this plan omits.

### Revision 3 (round-2 subagent review)

Two parallel subagents re-reviewed revision 2 (Actions semantics + internal
consistency / runtime + repo accuracy). Round-2 confirmed the revision-2 `HIGH`
resolution (step reorder), the `ci-success` fail-closed default (walked every
event incl. re-runs — airtight), the `needs: []` → `skipped` assumption, the
`paths-ignore`-off-`pull_request` structure, and that
`turbo run build
--filter=api` builds workspace deps (H1 can't recur in the
`api` job).

**HIGH**

- _Decision 6b's env carve-out breaks a spec (runtime review)._
  `customer-auth-rate-limit.e2e-spec.ts` has
  `it("throttles better-auth sign-in after 3 requests/10s")` asserting
  `responses[3] === 429` — a job-level `E2E_DISABLE_AUTH_RATELIMIT` would flip
  that to `200` and fail the file. Rev 2's claim "no spec asserts the seller
  limiter" was wrong. **Resolved:** decision 6b rewritten — the env flag is
  ruled out; the remedy (only if T5 shows the 429) is a helper-level
  stagger/retry in `signUpAndSignIn`. There is no app-code change #2.
- _PR-time OpenAPI check crashes the `api` job on env (Actions review)._ The
  `api` job sets only `DATABASE_URL`; `generate-openapi-spec.ts` does
  `app.init()` and `AppModule` needs `REDIS_URL` + `S3_*` + auth/monitoring/
  sitemap env. **Resolved:** decision 5a + T7 now require loading the shared
  test env example in the `api` job (no service containers; Prisma is
  stub-overridden in the script).

**MEDIUM**

- _Standalone API process is dead weight once decision 6 lands (runtime
  review)._ Its only consumer was the worker's expire-sweep `fetch()`, which
  decision 6 disables. **Resolved:** decision 2 drops the standalone
  `node apps/api/dist/main.js` entirely; `INTERNAL_API_URL` is set only to
  satisfy the worker's boot `validateEnv()` and is never dialed.
  `turbo build
  --filter=api` stays (OpenAPI check needs `apps/api/dist`). Step
  count 12 → 11.
- _`docker/login-action` can't authenticate service-container pulls (Actions
  review)._ Service containers are pulled before steps run. **Resolved:**
  decision 2 + T3 use `services.<id>.credentials:` with `GITHUB_TOKEN` for
  Postgres/Valkey, and the login step for the MinIO/`mc` `docker run`.
- _Mail-waiter count off by one (runtime review)._ 21 specs wait on mail, not
  22; the non-waiters are `app`, `customer-auth-rate-limit`, **and
  `stores-sitemap`**. **Resolved:** Context corrected.

**LOW (folded in)**

- Name the MAILER-ready mechanism: `@OnWorkerEvent("ready")` (there is no plain
  `WorkerHost` listening hook) — it's a decorator + handler + log + unit test,
  not just a log line · the two scheduler guards must log **distinct** text or
  step 9's "both lines" assert can pass on one · `needs: []` comment wording
  reconciled · add to Risks: every `main` push with at least one non-ignored
  path triggers the full suite + a CD cutover · note `dorny/paths-filter` on
  `workflow_dispatch` resolves all-`false` (→ `ci-success` still sane) · soften
  "two independent layers" — both manifest via `workflow_run.conclusion`; branch
  protection is the third, pre-merge layer.

**Confirmed sound, no change:** decision 4 step order (the OpenAPI script
stub-overrides `PrismaService`, so it needs neither a reachable DB nor a
migrated schema — running before `migrate deploy` is fine); calling
`generate-openapi-spec.ts` directly works with `apps/api/dist` present, and
`turbo run build` fires the `prebuild`→`generate:swagger-metadata` hook (pnpm
pre/post scripts default on) so `dist/metadata.js` exists; the
`customer-auth-rate-limit.e2e-spec.ts` buyer-side 5/min test is the separate
`modules/customer-auth` throttle; better-auth's limiter is in-memory per
`AppModule`.
