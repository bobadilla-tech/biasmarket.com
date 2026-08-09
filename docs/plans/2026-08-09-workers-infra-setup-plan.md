# `apps/workers` — background job infrastructure (BullMQ + Redis)

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`).

**Companion plan**: `2026-08-09-migrate-background-jobs-to-workers-plan.md` moves
real work (transactional email, the order-expiration sweep, two half-built
notification features) onto the infra this plan builds. That plan depends on
this one landing first; this plan does not depend on that one — it ships with
one proof-of-pipeline job, not the real migrations.

## Context

`docs/core/architecture.md` §9 ("Performance & Scaling") already names the
target: "**Queues (v1+)**: payment-proof review notifications, image
processing/resizing on upload, eventually order confirmation emails — anything
that doesn't need to block the HTTP response. BullMQ (Redis-backed) is the
natural fit given NestJS + Redis already in the stack." That line is aspirational
today — grepping the repo confirms **no `bullmq`, `ioredis`, or `redis` dependency
exists anywhere**, no Redis service in either `docker-compose.dev.yml` or
`docker-compose.yml`, and no `apps/workers` directory. This plan is the "build
the queue" half of that sentence.

Concretely, every "send an email" call site in `apps/api` today
(`review-payment.usecase.ts`, `customer-account.service.ts` ×4,
`auth.config.ts`'s `sendVerificationEmail`) does `await this.mailer.send(...)`
synchronously inside the request path, wrapped in a bare `try/catch` that logs
and swallows on failure — **one Resend hiccup and that email is gone forever,
no retry**. The order-expiration sweep
(`apps/api/src/modules/orders/application/orders-cron.service.ts`, `@Cron
"*/5 * * * *"`) runs via `@nestjs/schedule` inside the `api` process itself,
which only works correctly with exactly one `api` replica — architecture.md's
own scaling path (§9) says to split `api` into multiple containers once traffic
justifies it, and an in-process cron fires once **per replica** the moment that
happens, double/triple-expiring orders. Both are real, dated problems this
infra makes fixable — see the companion plan for the actual fixes.

This plan is scaffolding only: a new `apps/workers` NestJS app, Redis wired into
both dev and prod Docker stacks, a shared queue-contracts package, CI, and one
trivial end-to-end proof job. It does not move any of the email/cron logic
above — that's 100% the companion plan's scope, kept separate so review/rollout
risk stays isolated (infra can land and soak before any real business job
depends on it).

## Decision: `@nestjs/bullmq` (official wrapper), not raw `bullmq`

The repo already leans on official NestJS ecosystem packages for exactly this
kind of cross-cutting concern (`@nestjs/schedule`, `@nestjs/throttler`,
`@nestjs/jwt`). `@nestjs/bullmq` gives DI-friendly `@Processor`/`@Injectable`
decorators on the consumer side and an injectable `Queue` on the producer side,
consistent with how every other module in this codebase is wired — hand-rolling
a raw `bullmq` `Queue`/`Worker` pair as a custom Nest provider would work too,
but reinvents what the official package already does and diverges from house
style for no gain. Both `apps/api` (producer) and `apps/workers` (consumer) take
this dependency.

## Decision: one new shared package, `packages/queue`

`apps/api` (enqueues jobs) and `apps/workers` (processes jobs) need to agree on:
queue names, job-name strings, and the shape of each job's payload. Duplicating
these as independent string literals and hand-written interfaces in both apps is
exactly the kind of drift `packages/types` exists to prevent for HTTP DTOs — but
`packages/types` is Orval-**generated** from `apps/api/openapi.json` and isn't
the right home for hand-written, non-HTTP job contracts. New package:

```
packages/queue/
  package.json           # workspace:*, single src/index.ts barrel + `main`/`types` fields (matches packages/i18n's shape, not packages/utils' per-directory wildcard-subpath-export shape — confirm both before copying either verbatim)
  src/
    index.ts
    connection.ts        # buildRedisConnection(): shared ioredis ConnectionOptions from REDIS_URL
    queue-names.ts        # `export const QUEUE_NAMES = { MAILER: "mailer", ORDERS: "orders" } as const;`
    jobs/
      mailer.jobs.ts       # job-name constants + Zod schema + inferred TS type per job (this plan: one placeholder job only)
    default-job-options.ts # attempts/backoff/removeOnComplete/removeOnFail shared across queues
```

- Payload schemas are **Zod**, not bare TypeScript interfaces — a job payload
  crosses a process boundary through Redis (serialized to JSON), so it can drift
  from its compile-time type in a way an in-process function call cannot (a
  stale worker deployed against a newer payload shape, a hand-crafted `queue.add`
  call that skips the type checker). Validate on both ends: `apps/api` validates
  before `queue.add()` (fail the enqueue loudly, don't push garbage onto the
  queue), `apps/workers` validates on job pickup (fail that job loudly with a
  clear error instead of a downstream `undefined` crash three lines into the
  handler). Zod is not a new dependency — `apps/web` already uses it; this is
  its first use in `apps/api`/a shared package, worth calling out as a small
  precedent-setting choice, not a silent one.
- `connection.ts` centralizes the one non-obvious BullMQ requirement: the
  `ioredis` connection passed to a `Worker` **must** be constructed with
  `maxRetriesPerRequest: null` (BullMQ's blocking `BRPOPLPUSH`-style calls need
  it; omitting it is a common footgun that surfaces as silent stalls, not a
  clear error). Both `apps/api`'s producer connection and `apps/workers`'
  consumer connection import this one factory so the setting can't drift between
  them.
- `default-job-options.ts` ships the retry policy every queue gets unless a job
  overrides it: `attempts: 3`, `backoff: { type: "exponential", delay: 5000 }`,
  `removeOnComplete: { count: 1000 }`, `removeOnFail: { count: 1000 }` (bounded,
  not `true`/`false` — unbounded `removeOnComplete: false` grows Redis memory
  forever, unbounded `true` deletes the failure history needed to debug a bad
  job).

## `apps/workers` scaffold

Mirrors `apps/api`'s conventions exactly (same monorepo, same reviewers should
find it familiar) rather than introducing a second style:

```
apps/workers/
  package.json          # "type": "module", pnpm workspace, same script names as apps/api (dev/build/test/typecheck)
  tsconfig.json          # copy of apps/api's — nodenext module/resolution, ES2023 target
  tsconfig.build.json
  nest-cli.json          # builder: "swc", typeCheck: false — same as apps/api
  .swcrc                 # copied from apps/api's, NOT inherited from nest-cli.json/tsconfig.json — see "SWC decorator metadata" note below
  vitest.config.ts        # same swc-vite plugin — but see "No `@biasmarket/db`" below, no db-mock alias needed
  src/
    main.ts              # NestFactory.create(AppModule) — see "Health check" below for why HTTP, not createApplicationContext
    app.module.ts
    health/
      health.controller.ts  # GET /health — liveness only, see below
      health.module.ts
    queue/
      queue.module.ts     # @Global(), registers BullMQ Queue/Worker instances via packages/queue's connection + queue-names
    jobs/
      ping/
        ping.processor.ts  # the one proof-of-pipeline job — see "Definition of done"
        ping.module.ts
```

- **No `@biasmarket/db` / Postgres dependency in `apps/workers` at all — for this plan or the companion migration plan.** An earlier draft of this plan assumed `apps/workers` would need Prisma (for a hypothetical direct-DB job) and wired a `db: service_healthy` dependency + a db-mock alias into its Docker/vitest config. The companion plan
  (`2026-08-09-migrate-background-jobs-to-workers-plan.md`) explicitly rejects
  giving `apps/workers` direct database access (its "Rejected option 1") —
  every real job it adds either does pure I/O with no DB (mailer) or calls back
  into `apps/api` over HTTP for anything DB-shaped (the order-expiration
  sweep). Keeping `apps/workers` DB-free is also a real security/ops win, not
  just consistency: it never holds `DATABASE_URL`, never needs a Prisma client
  generated, and its Docker service has one less `depends_on` — worth stating
  as a deliberate constraint on this app rather than an oversight, so a later
  session doesn't add a Prisma dependency the first time some job "just needs
  one query."
- **SWC decorator metadata**: `apps/api`'s actual decorator/build config for
  NestJS DI (`legacyDecorator: true`, `decoratorMetadata: true`) lives in
  `apps/api/.swcrc`, not in `nest-cli.json`/`tsconfig.json` — copy that file
  verbatim into `apps/workers/.swcrc`. Skipping it is the kind of gap that
  doesn't fail loudly: `@nestjs/bullmq`'s `@Processor`/`@Injectable` decorators
  would build fine under SWC defaults but silently fail to resolve constructor
  dependencies at runtime, since SWC needs `decoratorMetadata` to emit the
  `design:paramtypes` reflection metadata Nest's DI container reads.
- **No controllers beyond `/health`.** This app is never reached from the
  internet and never reached from `apps/web` — the hard rule "web only talks to
  api over HTTP" stays true; `apps/workers` is reachable **only** from
  `apps/api` (indirectly, via Redis — `api` never calls `workers` directly
  either, it enqueues a job and `workers` picks it up independently). No Caddy
  route, no `WEB_URL`-style CORS config, no auth guards — the trust boundary is
  "only `api` and `workers` are on the Docker network that can reach Redis,"
  same trust model already used for `db`/`minio` (`expose`, not `ports`).
  **One direction this plan's inbound-only description doesn't cover**: the
  companion migration plan has `apps/workers` make an *outbound* HTTP call
  back into `apps/api` (a scheduled job dispatching to a new internal
  endpoint, over the same internal Docker network — never through Caddy). This
  plan's scaffold doesn't need anything extra to support that (`apps/workers`
  can make outbound HTTP calls with no new infra), it's just worth flagging
  here so the two plans' descriptions of the trust boundary don't read as
  contradictory to whoever implements either one in isolation.
- **Health check runs as a real (tiny) HTTP server, not
  `NestFactory.createApplicationContext`.** `createApplicationContext` (no HTTP
  listener) is the more common pattern for a pure worker process, but this repo's
  existing Docker healthcheck convention
  (`infra/docker/api-healthcheck.ts`, referenced from both Dockerfiles) is "hit
  an HTTP endpoint" — matching it keeps `docker compose ps`/`depends_on:
  condition: service_healthy` working the same way for every service, and gives
  a place to later add a `/health` check that also reports queue depth /
  Redis-connection status without inventing a second healthcheck mechanism
  (stdout log scraping, a PID file, etc). Port `3002` (internal only — `expose`,
  never `ports`, in both `docker-compose.dev.yml` and prod), following
  `api`(3000)/`web`(3001)'s pattern of one port per app.
- `queue.module.ts` is `@Global()`, same shape as `MailerModule`/`StorageModule`
  in `apps/api` — every job-processor module injects the registered `Queue`s (or
  in the worker's case, mostly just needs the `Worker`/`@Processor` wiring, not
  a `Queue` producer — `apps/workers` is a consumer, it doesn't enqueue jobs onto
  itself for this plan's scope).
- **Graceful shutdown**: `app.enableShutdownHooks()` in `main.ts` +
  `OnModuleDestroy` on the queue module calling `worker.close()` for each
  registered `Worker`. Without this, a `docker compose down`/redeploy SIGTERMs
  the container mid-job — BullMQ's `close()` waits for the in-flight job to
  finish (up to a configurable timeout) instead of dropping it, which matters
  more once real jobs land (companion plan) than it does for the placeholder
  ping job, but the hook belongs in the infra layer, not bolted on per-job later.

## `apps/api` producer side

- New deps: `@nestjs/bullmq`, `bullmq`, plus `packages/queue` (workspace dep).
- New `apps/api/src/queue/queue.module.ts` (`@Global()`, mirrors the shape of
  `MailerModule`): registers the same queues `apps/workers` consumes, via
  `BullModule.forRootAsync` + `registerQueue`, using `packages/queue`'s
  `buildRedisConnection()` and `QUEUE_NAMES`.
- **Enqueue failures must not fail the parent request.** The current
  `mailer.send()` call sites already wrap sends in `try/catch` specifically so a
  transient Resend failure doesn't 500 an otherwise-successful payment-review
  request — moving to `queue.add()` keeps that same posture: wrap the enqueue
  call, log+report to Sentry on failure, let the request that already committed
  its DB transaction succeed regardless. This plan should **not** attempt an
  outbox-pattern (transactionally guaranteeing the enqueue commits atomically
  with the DB write) — real engineering for real message-loss guarantees, and
  overkill for this app's current traffic/criticality; flagged as a known,
  accepted gap (a Redis outage during the exact window between DB commit and
  `queue.add()` silently drops that one job) rather than solved here. Revisit if
  it ever actually bites someone in production, same posture the observability
  plan (`2026-08-08-observability-and-env-validation-plan.md`) took for its own
  theoretical-vs-incident-driven severity calls.
- No changes to any real call site in this plan (that's the companion plan) —
  the only new call site is the one proof-of-pipeline ping job, likely fired
  from a temporary admin-only debug endpoint or a one-off script, removed or
  left as a genuinely tiny permanent smoke-test endpoint at implementation
  time's discretion.

## Docker / infra

- **New `redis` service** in both `docker-compose.dev.yml` and
  `docker-compose.yml`, image `redis:7-alpine` (or `valkey`, the maintained
  open-source fork, if licensing on `redis:7-alpine`'s newer tags is a concern
  by implementation time — worth a quick check, not a blocker for this plan).
  **Dev port publishing should match the existing dev-stack convention, not
  the prod one**: `db` publishes `"5432:5432"` and `minio` publishes
  `9000`/`9001` straight to the host in `docker-compose.dev.yml` (host-side
  `psql`/Prisma Studio/MinIO console access), it's only the **prod** compose
  file that keeps everything internal-only via `expose`. Redis should follow
  the same split — `ports: ["6379:6379"]` in dev (so `redis-cli`/RedisInsight
  can connect from the host during development), `expose: ["6379"]` only in
  prod. Give it a password in **both** environments this time
  (`REDIS_PASSWORD`, dev gets a fixed non-secret default like
  `POSTGRES_PASSWORD=localdevpassword` already does, prod gets a generated
  one) — matching `db`'s existing posture instead of leaving redis as the one
  passwordless service in dev. Named volume for AOF/RDB persistence
  (`redis_data:/data`) so an in-flight job queue survives a container restart
  in dev. Healthcheck: `redis-cli -a "$REDIS_PASSWORD" ping`.
- **New `workers` service**, built from a new `infra/docker/workers.Dockerfile`
  — copy `infra/docker/api.Dockerfile`'s multi-stage shape (`base` → `dev` /
  `deps` → `build` → `runtime`) verbatim, swapping the `apps/api` paths for
  `apps/workers`. `depends_on: redis (service_healthy)` only — no `db` (see
  "No `@biasmarket/db`" above), no `minio-init` (workers doesn't touch storage
  in this plan's scope). Healthcheck mirrors `api-healthcheck.ts` against the
  new `/health` endpoint — likely literally reuse `api-healthcheck.ts` with a
  `PORT` argument rather than duplicating the script, since its only job is
  "GET a path, check 200." **Dev compose volumes**: needs its own full set of
  named `node_modules` volumes mirroring `api`'s block (`workers_root_
  node_modules`, `workers_app_node_modules`, plus one per workspace dependency
  it actually has — `db` is *not* one of them per the "No `@biasmarket/db`"
  decision, but `i18n`/`types`/`utils`/the new `queue` package likely are) —
  without these the bind-mounted repo shadows the container's installed
  `node_modules` exactly the way `api`'s/`web`'s existing volume blocks
  prevent for those services.
- `infra/docker/scripts/workers-dev.sh`, mirroring `api-dev.sh` (whatever that
  script actually does — check it before assuming; likely just
  `pnpm --filter workers dev` plus the same swagger-metadata-style pregeneration
  step api's has, if workers ends up needing an equivalent).
- **`apps/api`'s own dev compose volumes need one addition, not just
  `workers`'**: `apps/api` becomes a `packages/queue` consumer too (it's the
  producer side, see below), so `api`'s existing named-volume block in
  `docker-compose.dev.yml` needs a new `api_queue_node_modules` volume
  alongside its existing `api_db_node_modules`/`api_i18n_node_modules`/etc —
  easy to add three new services' worth of scaffolding and forget the one-line
  addition to a service that already exists.
- **`infra/docker/api.Dockerfile`'s `deps` stage will break without one small
  change**: it explicitly `COPY`s each workspace package's `package.json` by
  name (`apps/api`, `apps/web`, `packages/db/i18n/types/ui/utils`) before
  running `pnpm install --frozen-lockfile` with no `--filter` — so once
  `packages/queue` exists as a workspace member in `pnpm-lock.yaml` but its
  `package.json` isn't in that explicit `COPY` list, `api`'s own Docker build
  starts failing on a workspace/lockfile mismatch, not just a hypothetical
  `workers.Dockerfile`. Add `COPY packages/queue/package.json
  ./packages/queue/package.json` to `api.Dockerfile`'s existing `deps` stage
  as part of this plan, even though `api.Dockerfile` otherwise has nothing to
  do with `apps/workers`.
- **New env vars**: `REDIS_URL` (dev default
  `redis://redis:6379`, prod `redis://:${REDIS_PASSWORD}@redis:6379`),
  `REDIS_PASSWORD` (prod only, empty/unset in dev). Add to
  `infra/docker/.env.example` with the same "prod: ..." comment convention every
  other var there uses, and to `scripts/init-env.ts`'s `replacements` map (a
  freshly generated password, same `genPassword()` helper already used for
  `POSTGRES_PASSWORD`/`S3_*`).
- `apps/api/src/config/env.validation.ts`: add `REDIS_URL` to the boot-time
  `requiredEnv()` set — same "fail fast, don't silently fall back" posture the
  observability plan established for every other required var. `apps/workers`
  needs its own equivalent boot-time check (new, small — this app doesn't have
  the five-copies-of-`requiredEnv()` history `api` had, so there's no
  consolidation work, just one clean `env.validation.ts` from the start, copied
  from `api`'s post-consolidation shape).

## CI (`.github/workflows/ci.yml`)

- New `workers` entry in `detect-changes`'s path-filter block, mirroring `api`'s
  filter list (`apps/workers/**` plus the same shared `packages/db`,
  `packages/queue` (new), `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`,
  `package.json`, workflow file itself) — and add `packages/queue/**` to
  **both** `api`'s and `workers`' filters, since both apps depend on it.
- New `workers` job, copy-pasted from the `api` job (lint → typecheck → build →
  test:cov → Codecov upload with `flags: workers`) — same `DATABASE_URL` dummy
  pattern if `packages/db` typecheck needs it, no Redis service container
  needed in CI since unit tests mock the `Queue`/`Worker` the same way `api`'s
  unit tests mock `PrismaService` (`useValue` fakes, never a real Redis
  connection) — consistent with the existing "CI runs unit only, e2e is
  local/manual" split noted in `CLAUDE.md`.
- New `queue` entry too (`packages/queue/**`), mirroring the existing `db`/
  `i18n`/`types`/`ui`/`utils` package jobs (build + typecheck, no test step
  unless the package ends up with real unit tests worth running — likely just
  Zod schemas + constants, may not need its own test suite beyond what
  `api`'s/`workers`' own tests exercise indirectly).

## Non-goals (explicitly out of scope for this plan)

- **No real job migrations.** Every current synchronous email send and the
  cron sweep keep working exactly as they do today. That's the companion plan.
- **No Bull Board / queue-dashboard UI.** Nice-to-have for local dev visibility,
  not required to prove the pipeline works — a `queue.getJobCounts()` call in a
  throwaway script or the `/health` endpoint's future queue-depth reporting
  covers debugging needs well enough for now. Revisit if debugging blind
  becomes a real friction point.
- **No outbox pattern / exactly-once delivery guarantees** — see the "Enqueue
  failures" note above.
- **No multi-queue-type topology beyond what the proof job needs.** The
  companion plan is where real queue names (`mailer`, `orders`, etc.) and their
  concurrency/rate-limit tuning get decided against real job characteristics —
  this plan's `QUEUE_NAMES` only needs one entry to prove the shape works.

## Files likely touched

- New: `apps/workers/**` (full app scaffold, see above)
- New: `packages/queue/**`
- New: `infra/docker/workers.Dockerfile`,
  `infra/docker/scripts/workers-dev.sh`
- `infra/docker/api.Dockerfile` — add `packages/queue/package.json` to the
  `deps` stage's explicit `COPY` list (breaks `api`'s own build otherwise, see
  Docker section above)
- `infra/docker/docker-compose.dev.yml`, `infra/docker/docker-compose.yml` (new
  `redis` + `workers` services, new `api_queue_node_modules` volume on the
  existing `api` service)
- `infra/docker/.env.example`, `scripts/init-env.ts` (`REDIS_URL`/
  `REDIS_PASSWORD`)
- `apps/api/package.json` (`@nestjs/bullmq`, `bullmq`, `@biasmarket/queue`), new
  `apps/api/src/queue/queue.module.ts`, `apps/api/src/config/env.validation.ts`
- `.github/workflows/ci.yml` (new `workers` + `queue` filter entries and jobs)
- `pnpm-workspace.yaml` — already globs `packages/*`/`apps/*`, likely no change
  needed; confirm at implementation time.
- `docs/core/architecture.md` §9 — once this lands, update the "Queues (v1+)"
  bullet from aspirational to "implemented, see
  `2026-08-09-workers-infra-setup-plan.md`," matching how other sections of that
  doc were annotated after their own plans shipped (§2, §3, §4 all carry
  "✅ Implemented" or "considered and rejected" framing already).

## Verification

- `docker compose -f infra/docker/docker-compose.dev.yml up`: `redis` and
  `workers` both reach healthy status.
- Trigger the ping job from `apps/api` (debug endpoint or script), confirm it's
  picked up and completed by `apps/workers` — visible via container logs and/or
  `queue.getJobCounts()`.
- Kill `apps/workers` mid-job (or add an artificial delay + `docker compose
  stop workers` during it), confirm graceful shutdown lets the in-flight job
  finish rather than losing it.
- Stop `redis`, confirm `apps/api` still boots and serves unrelated requests
  (Redis is required-at-boot per `env.validation.ts`, but confirm the *specific*
  failure mode is "refuses to boot with a clear message" if `REDIS_URL` is
  literally unset, vs. "boots fine, individual enqueue calls fail loudly" if
  `REDIS_URL` is set but Redis itself is unreachable — these are different
  failure modes and the plan should pick one deliberately, not by accident).
- `pnpm typecheck`, `pnpm --filter workers test`, `pnpm --filter api test`,
  `pnpm turbo run build --filter=workers`.

## Definition of done

`apps/workers` boots in both dev and prod Docker stacks, connects to Redis,
and successfully processes one real end-to-end proof job enqueued from
`apps/api` — with retry/backoff, graceful shutdown, and CI all wired the same
way `apps/api` already is. No production behavior changes: zero real email
sends or cron logic moved yet.
