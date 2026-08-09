# Uptime Kuma monitoring + incident handling

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`, and matches how
`2026-08-09-workers-infra-setup-plan.md` was already handled the same way).

## Context

Prod today (`infra/docker/docker-compose.yml`) is `db`, `api`, `web`, `minio`

- `minio-init`, `caddy` on a single Oracle Cloud VM (`docs/core/deploy.md`) — no
  uptime monitoring, no alerting, no incident record anywhere. `api` already has
  `GET /api/health` (checks Postgres via `SELECT 1`,
  `apps/api/src/modules/health/health.controller.ts`), reused as the Docker
  healthcheck (`infra/docker/api-healthcheck.ts`). `web` has no health endpoint
  at all. `minio` has its own Docker healthcheck (`mc ready local`) but nothing
  external verifies it. Nothing watches Caddy/TLS/DNS from the outside — a Caddy
  misconfig or expired cert would currently be caught only by a user complaint.

`apps/workers` (BullMQ + Redis) does **not exist yet** —
`2026-08-09-workers-infra-setup-plan.md` is a sibling plan, not yet implemented.
This plan does not add worker monitoring; it documents the follow-up once that
infra lands (see "Non-goals").

The VM is an arm64 Ampere A1 instance (`docs/core/deploy.md` §1) — every image
in the stack today is multi-arch. `louislam/uptime-kuma` publishes multi-arch
(`amd64`/`arm64`/`armv7`) images, confirmed compatible; verify the specific
pinned tag still ships an arm64 manifest at implementation time.

## Decision: alerting must not depend on the thing it's alerting about

The obvious design — Kuma detects a failure, POSTs a webhook to
`api.biasmarket.com`, `api` sends the Slack/email alert — is circular for the
single most important failure mode: **`api` itself being down**. If `api` is the
thing that's unreachable, routing the alert through `api` means the operator
hears about the outage only after it self-resolves, or never.

So this plan splits the two jobs Kuma's "webhook fires" moment needs to do:

1. **Real-time paging** — Kuma's own built-in notification providers
   (Slack/Discord/Telegram/generic webhook incoming-webhook URL), configured
   directly in the Kuma UI, firing straight to the external service. Zero new
   code, zero dependency on `api`/`web` being up. This is the primary alert
   path.
2. **Durable incident history** — a second notification target (Kuma supports
   attaching more than one notification provider per monitor) pointed at a new
   `POST /api/monitoring/webhook` endpoint in `api`, which persists the event to
   Postgres for later review/reporting. This is a system-of-record, **not** the
   alert path — if `api` is the thing that's down, this call fails, Kuma retries
   per its own retry policy, and the operator is never blind because (1) already
   fired independently. Documented as an accepted gap, not solved further
   (matches the posture `2026-08-08-observability-and-env-validation-plan.md`
   and the workers plan both already took for similar
   theoretical-vs-actual-incident tradeoffs).

## Decision: no `docker.sock` mount

Uptime Kuma's "Docker Container" monitor type needs `/var/run/docker.sock`
mounted into the container to query container state directly. Declining this: a
mounted socket — even `:ro` — gives whatever runs in that container control of
the Docker Engine API, which is root-equivalent on the host (create a privileged
container, mount the host filesystem, etc). Kuma is a small,
internet-facing-by-design (status page) app; granting it host-root blast radius
is a bad trade for a feature HTTP/TCP checks already cover — a container that's
actually down fails its HTTP/TCP health check within one interval anyway. Skip
the mount; use HTTP/TCP/Redis-native monitor types exclusively.

## Decision: dual monitors (external + internal) per critical service

One monitor per service tells you "it's down," not _why_. Two monitors per
critical surface — one hitting the public hostname through Caddy, one hitting
the container directly over the compose network — isolate the fault domain on
the first alert instead of requiring a second manual check:

| Monitor        | Target                                  | Proves                                                                                      |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| API (external) | `https://api.biasmarket.com/api/health` | DNS + TLS + Caddy + app, end to end                                                         |
| API (internal) | `http://api:3000/api/health`            | App itself, independent of edge                                                             |
| Web (external) | `https://biasmarket.com/api/health`     | DNS + TLS + Caddy + Next.js, end to end                                                     |
| Web (internal) | `http://web:3001/api/health`            | Next.js process itself                                                                      |
| DB             | TCP `db:5432`                           | Postgres accepting connections (deep check already covered transitively by API's `/health`) |
| MinIO          | `http://minio:9000/minio/health/live`   | Object storage liveness (built-in endpoint, no auth)                                        |

If external is down and internal is up: Caddy/DNS/TLS problem. If both are down:
the app itself. That distinction is the whole point of running Kuma outside the
thing it watches.

No dedicated Caddy monitor — the two external checks above already prove Caddy
is routing correctly; a third check would be redundant.

## New: `apps/web` health endpoint

`apps/web/app/api/health/route.ts` (new — first API route handler in `web`, sits
outside the `[locale]` segment so it's unaffected by `next-intl`'s routing;
confirmed no `middleware.ts` exists to interfere either):

```ts
export function GET() {
  return Response.json({ status: "ok" });
}
```

Deliberately a pure liveness ping — **no call to `api`, no DB access**. Two
reasons: `web` is hard-ruled off talking to Postgres directly (`CLAUDE.md`), and
coupling `web`'s liveness to `api`'s availability would make a `web`
health-check failure ambiguous (is `web` down, or is `api` down and `web` merely
reporting that?) — exactly the fault-domain-blurring the external/internal split
above is designed to avoid.

## New: `apps/api` monitoring module

`apps/api/src/modules/monitoring/` (flat controller/service/dto, matches every
other CRUD-style module — not the `orders` DDD-lite layering):

- `monitoring.module.ts` — imports
  `ThrottlerModule.forRoot([{ ttl: 60_000,
  limit: 20 }])` local to the module,
  same pattern as `ContactModule`/ `RestockModule`/`CustomerAuthModule`. Limit
  set higher than the `5/min` used elsewhere since Kuma may fire several
  monitors' events in a burst. Note this throttle is defense-in-depth, not the
  primary control — the 32-byte shared secret is. That matters because `main.ts`
  never calls `app.set("trust proxy", ...)`, so behind Caddy every external
  request's `req.ip` is Caddy's own socket address — Nest's per-IP throttle
  bucket is effectively **one shared global bucket**, not per-caller, for this
  (and every other) `@Public()` throttled route today. Fixing `trust proxy`
  repo-wide is out of scope for this plan (pre-existing gap, affects
  `ContactController`/`CustomerAuthModule` too), but implementation should not
  treat the throttle as caller-specific rate-limiting until that's fixed — the
  secret comparison is what actually stops an attacker here.
- No timestamp/nonce replay protection on the webhook — accepted gap, not
  overlooked: a captured valid request could be replayed, but doing so only ever
  re-opens/re-closes a `PlatformIncident` row, no privileged action. Revisit
  only if that stops being true.
- `monitoring.controller.ts`:
  - `POST /monitoring/webhook` — `@Public()` + `@UseGuards(ThrottlerGuard)` +
    `@Throttle(...)`, mirrors `ContactController.create` exactly. Body is a DTO
    matching Kuma's generic Webhook notification payload shape
    (`{ heartbeat: { monitorID, status, time, msg, important }, monitor: {
    id, name }, msg }`)
    — nested `class-validator` DTOs (`KumaHeartbeatDto`/`KumaMonitorDto` with
    `@ValidateNested()` + `@Type()`), every field the handler doesn't read
    marked `@IsOptional()` to minimize breakage risk against the global
    `forbidNonWhitelisted: true` pipe if Kuma's payload gains fields in a future
    version. **Verify the exact current payload shape against a real Kuma
    test-webhook fire at implementation time** — Kuma's docs describe the shape
    but don't version it strictly.
  - Auth is a shared-secret header, not session/role auth (Kuma isn't a
    logged-in user): `X-Webhook-Secret` compared against
    `MONITORING_WEBHOOK_SECRET` with `crypto.timingSafeEqual` (constant-time,
    avoids a timing side-channel on the comparison). Reject with 401 before
    touching the body on mismatch.
  - Only persists on `heartbeat.important === true` (Kuma's own "this is a state
    transition, not just another healthy ping" flag) — avoids a Postgres row per
    check interval for every monitor.
  - `main.ts` sets `bodyParser: false` on `NestFactory.create` — Nest's default
    body-parser is off, and no `express.json()`/size-limit override is visibly
    wired in `apps/api/src`; body parsing for existing routes presumably comes
    from `@thallesp/nestjs-better-auth`'s own middleware. **Verify at
    implementation time** that JSON parsing actually reaches this new controller
    the same way it does `ContactController`, and that there's a sane
    request-size cap — an unauthenticated public POST route with no confirmed
    size limit is worth checking explicitly rather than assuming it's covered.
  - `GET /monitoring/incidents` — `@UseGuards(AuthGuard)` + `@Roles(["admin"])`,
    same guard/decorator shape as `ContactController.findAll`. Ordered
    newest-first, paginated via the existing shared
    `parsePublicListQuery`/`page`+`limit` convention already used by
    `product-search.controller.ts` and `stores.controller.ts`'s `findDirectory`
    (Prisma `skip`/`take`) rather than inventing a new pagination shape. No
    dashboard page consumes this yet (see Non-goals) — it exists so incident
    history is queryable (via Swagger/`curl`/a future admin page) instead of
    living only in Kuma's own SQLite retention window.
- `monitoring.service.ts` — `recordEvent()` upserts a `PlatformIncident`: an
  `important, status=down` event with no existing open incident for that
  `monitorId` opens one (`resolvedAt: null`); an `important, status=up` event
  closes the open incident for that `monitorId` (`resolvedAt: now`). Matches the
  existing service-layer ownership-check convention elsewhere in the repo
  (`assertOwnership`-style), except there's no store ownership here — see next
  section for why.

### New Prisma model: `PlatformIncident`

Platform-level operational data — not tenant data, no `storeId`, sits
deliberately outside the multi-tenancy model (unlike `AuditLog`, which is
`storeId`-scoped and wouldn't fit this: an API-down incident isn't "owned" by
any one store).

```prisma
model PlatformIncident {
  id          String    @id @default(cuid())
  monitorId   Int
  monitorName String
  message     String
  startedAt   DateTime  @default(now())
  resolvedAt  DateTime?

  @@index([monitorId, resolvedAt])
}
```

New migration via `pnpm --filter @biasmarket/db migrate` (that script is
`prisma migrate dev`, which runs `prisma generate` internally — not a separate
`db:generate` + `migrate` two-step; `db:generate` alone is just
`prisma generate`, no schema diffing). `packages/db/prisma/migrations/` shows
the standard `<timestamp>_<name>` folder convention.

### Env vars

- `MONITORING_WEBHOOK_SECRET` — new, required. Added to
  `infra/docker/.env.example` with the standard "prod: ..." comment convention,
  generated in `scripts/init-env.ts`'s `replacements` map via the existing
  `genSecret(32)` helper (same pattern as `BETTER_AUTH_SECRET`).
- `apps/api/src/config/env.validation.ts`: add
  `requiredEnv("MONITORING_WEBHOOK_SECRET")` — boot-time fail-fast, same posture
  as every other required var there.

### OpenAPI

Per `CLAUDE.md`'s hard rule, regenerate and commit both artifacts after the
controller lands:
`pnpm --filter api generate:openapi && pnpm --filter
@biasmarket/types generate`.
`web` has no reason to call either endpoint today (Kuma calls the webhook
directly; the incidents list has no UI yet), so this is a docs/consistency step,
not a functional dependency.

## Docker Compose (`infra/docker/docker-compose.yml`, prod only)

Prod-only — not added to `docker-compose.dev.yml`. Monitoring is an operational
concern for the deployed stack; there's no "is my laptop up" question worth
answering per-developer, and it's one less container every contributor has to
build/pull for local dev.

```yaml
uptime-kuma:
  image: louislam/uptime-kuma:1.23.16 # pin exact version; check for a newer release at implementation time
  restart: unless-stopped
  volumes:
    - uptime_kuma_data:/app/data
  # No explicit `healthcheck:` override needed — the 1.23.16 image already
  # bakes in its own `HEALTHCHECK CMD extra/healthcheck` (compiled binary,
  # not the legacy `extra/healthcheck.js` script) with a 180s start
  # period matching Kuma's real boot time. `docker compose ps` picks that
  # up automatically; only add an override here if a future pinned
  # version changes or drops it.
  # No docker.sock mount — see plan doc "Decision: no docker.sock mount".
  # No ports: — reachable only via Caddy (status.biasmarket.com), same
  # posture as minio's admin surface being deliberately unrouted.
```

Add `uptime_kuma_data:` to the top-level `volumes:` block. No `depends_on` on
`api`/`web` — Kuma doesn't need them up to start; its own monitors handle
waiting. Add `uptime-kuma` to **`caddy`'s** existing `depends_on:` list
(alongside `api`/`web`/`minio`) — every other Caddy-proxied backend is already
listed there, and this plan should match that, not introduce an inconsistency.
No explicit `networks:` key on the new service, matching every other service in
this file (all share the implicit default `biasmarket_default` network).

**Who monitors the monitor**: a container-level `healthcheck:` (above) only
catches Kuma's own process hanging — it says nothing if the whole VM goes down,
which is exactly the scenario where every on-host check, including this one,
goes silent at once. Close that gap with one lightweight **external** heartbeat,
entirely outside this VM: a free-tier third-party monitor (e.g. UptimeRobot,
healthchecks.io, Better Stack) pinging `https://status.biasmarket.com` from
outside. This is the one piece of this plan that is deliberately _not_
self-hosted, on purpose — a watcher hosted on the thing it watches can't report
that thing being completely gone.

## Caddy (`infra/caddy/Caddyfile`)

```
status.biasmarket.com {
  reverse_proxy uptime-kuma:3001
}
```

Consistent with the file's existing style (one block per subdomain, bare
`reverse_proxy`). Requires a new DNS A/AAAA record for `status.biasmarket.com`
pointed at the VM's reserved IP — manual infra step, not something committed to
the repo (matches how `biasmarket.com`/`api.biasmarket.com`/
`cdn.biasmarket.com` DNS is presumably already managed outside this repo).

No port collision with `web` (also `:3001`) — different containers, Caddy
addresses them as distinct `service-name:port` pairs on the Docker network; the
number is coincidental.

Kuma password-gates its own admin UI (set up on first boot) — the status page
itself is intentionally public, everything else behind that login. **Before
treating that as sufficient, confirm the pinned Kuma version actually has login
rate-limiting/lockout** — if it doesn't, the admin UI is brute-forceable, and
compromising it also exposes the plaintext `MONITORING_WEBHOOK_SECRET` stored in
Kuma's own notification-provider config (see below), not just Kuma itself. If
lockout isn't confirmed, add a Caddy `basicauth` block scoped to Kuma's
`/dashboard`/`/manage-status-page` paths specifically (not the whole
`status.biasmarket.com` host — that would also gate the intentionally-public
status page) as a real requirement, not optional hardening.

**Secret duplication**: `MONITORING_WEBHOOK_SECRET` gets hand-entered a second
time, in Kuma's own webhook notification-provider config, stored in Kuma's
SQLite and visible in plaintext to anyone with Kuma admin access.
`scripts/init-env.ts --force` rotates the `.env` copy but has no way to reach
into Kuma's own config — rotating this secret is a two-step manual process
(update `.env` + redeploy `api`, then re-enter the new value in Kuma's UI) and
belongs in `docs/core/incident-response.md` as an explicit step, not assumed to
happen automatically.

## Status page

Configure inside Kuma's UI (no code — this is runtime config stored in Kuma's
own SQLite, not something this repo can commit): one public status page
containing only the two **external** monitors (API, Web) — the user-facing
surfaces. Internal-only monitors (API-internal, Web-internal, DB, MinIO) stay in
a separate, non-public monitor group used for triage, not shown on the page —
matches the ask to include "only user-facing critical ones."

## Incident handling flow

```
Kuma detects state change (important=true)
  ├─→ Notification provider #1: Slack/Discord incoming webhook (direct, real-time page)
  └─→ Notification provider #2: POST /api/monitoring/webhook (durable record)
                                    │
                                    ├─ 401 if X-Webhook-Secret mismatch
                                    ├─ validates payload (nested DTO)
                                    └─ PlatformIncident opened/closed by monitorId
                                       └─ queryable via GET /monitoring/incidents (admin-only)
```

New short runbook doc, `docs/core/incident-response.md`: what each monitor
firing means, first triage step (check the paired external/internal monitor to
isolate edge vs. app), common fixes (`docker compose logs <service>`,
`docker compose restart <service>`), and an explicit note that this is a
single-operator setup — no on-call rotation/escalation policy needed, this is a
runbook, not a paging schedule.

## Improvements suggested (not all implemented in this plan)

- **Auto-recovery**: `restart: unless-stopped` only restarts a container on
  _process exit_ — Docker does **not** restart a container solely because its
  `HEALTHCHECK` reports `unhealthy`. A `willfarrell/autoheal` sidecar (watches
  for containers labeled `autoheal=true` with a failing healthcheck,
  force-restarts them) closes that gap — but naively, it directly contradicts
  this plan's own "Decision: no `docker.sock` mount": autoheal restarts
  containers by calling the Docker Engine API, which needs
  `/var/run/docker.sock`, the exact root-equivalent access just rejected for
  Kuma. Don't hand-wave past that tension. If pursued (as a fast follow-up, not
  bundled into this plan): put `tecnativa/docker-socket-proxy` between autoheal
  and the real socket, with only `ALLOW_RESTARTS=1` enabled (gates exactly the
  `containers/{id}/{stop,restart,kill}` calls autoheal needs) and every other
  `ALLOW_*` toggle left off — narrows the surface from the entire Engine API
  down to container lifecycle calls only, not full host control. Confirm the
  proxy's current env-var names against its own docs at implementation time
  (they've shifted across versions). Also exclude `api` from the `autoheal=true`
  label set initially: it runs `prisma migrate deploy` on every boot
  (`docs/core/deploy.md` §6), so an unhealthy-but-not-crashed `api` (e.g.
  flapping DB connectivity) risks a restart loop that re-runs migrations
  repeatedly instead of surfacing the real fault — start autoheal on
  `web`/`minio` only, revisit `api` once the failure modes are better
  understood.
- **Latency monitoring**: Kuma records response time per check natively and
  graphs it; that's sufficient for coarse "is this getting slower" trend
  visibility. It is not an APM — the repo already has GlitchTip/Sentry wired for
  error tracking (`SENTRY_DSN`/`WEB_SENTRY_DSN`,
  `apps/api/src/common/error-tracking.ts`); real latency/performance
  investigation belongs there, not bolted onto Kuma.
- **Worker/queue monitoring**: out of scope until
  `2026-08-09-workers-infra-setup-plan.md` actually ships `apps/workers` +
  Redis. Once it does: Kuma has a native "Redis" monitor type (point it at
  `REDIS_URL`) for connectivity, plus an internal HTTP monitor against
  `workers:3002/health` (per that plan's healthcheck design) for the worker
  process itself. Queue-depth/backlog alerting (BullMQ job counts) is a further
  stretch — would need the workers `/health` endpoint extended to report
  `waiting`/`active`/`failed` counts and a Kuma monitor with a
  JSON-keyword/expression check against it. Not buildable today since none of
  the underlying infra exists yet.
- **Missing health-endpoint gap this plan fixes**: `web` had zero health surface
  before this plan: the new `/api/health` route closes that.

## Non-goals (explicitly out of scope)

- No admin dashboard UI page consuming `GET /monitoring/incidents` — the
  endpoint exists so the data isn't trapped in Kuma's own retention window, but
  building a page for it is real feature work with its own design questions
  (pagination UI, filtering, does it belong under `Settings` or a new nav item)
  better scoped as its own follow-up plan once someone actually wants to look at
  incident history in-app rather than via Kuma directly.
- No `docker.sock`-based "Docker Container" monitor type (see decision above).
- No on-call rotation / PagerDuty-style escalation tooling — solo-operator scale
  doesn't need it; Slack/Discord + a runbook is proportionate.
- No worker/queue/Redis monitoring (infra doesn't exist yet).
- No Kuma instance in `docker-compose.dev.yml`.
- No outbox-pattern/exactly-once guarantee on the incident-webhook write — same
  accepted-gap posture the workers plan already documented for its own enqueue
  path; if `api` is down at the exact moment Kuma's second notification fires,
  that one history row is lost, while the Slack/Discord alert (independent path)
  still fires. Revisit only if this actually bites someone.

## Files likely touched

- New: `apps/web/app/api/health/route.ts`
- New: `apps/api/src/modules/monitoring/**` (`monitoring.module.ts`,
  `monitoring.controller.ts`, `monitoring.service.ts`,
  `dto/kuma-webhook.dto.ts`, `dto/incident-response.dto.ts`, plus `.spec.ts`
  unit tests mocking `PrismaService` per the repo's existing test convention)
- `apps/api/src/app.module.ts` (register `MonitoringModule`)
- `apps/api/src/config/env.validation.ts` (`MONITORING_WEBHOOK_SECRET`)
- `packages/db/prisma/schema.prisma` (+ new migration): `PlatformIncident` model
- `infra/docker/docker-compose.yml` (`uptime-kuma` service + `uptime_kuma_data`
  volume)
- `infra/caddy/Caddyfile` (`status.biasmarket.com` block)
- `infra/docker/.env.example`, `scripts/init-env.ts`
  (`MONITORING_WEBHOOK_SECRET`)
- `apps/api/openapi.json`, `packages/types/generated/**` (regenerated,
  committed)
- New: `docs/core/incident-response.md`
- `docs/core/deploy.md` (add Kuma setup + DNS record to the runbook)

## Verification

- `docker compose -f infra/docker/docker-compose.yml up`: `uptime-kuma` reaches
  healthy status per the image's built-in `HEALTHCHECK`, `/app/data` persists
  across a `docker compose restart uptime-kuma`.
- Confirm the pinned Kuma image's login flow has rate-limiting/lockout before
  deciding whether the Caddy `basicauth` addition is required (see "Reverse
  proxy integration").
- Confirm the external, off-VM dead-man's-switch (UptimeRobot/
  healthchecks.io/Better Stack) actually alerts when `status.biasmarket.com` is
  unreachable — test by stopping `caddy` entirely, not just one backend.
- `status.biasmarket.com` resolves through Caddy once DNS is pointed at the VM;
  Kuma's setup wizard completes; admin login works.
- Configure the 6 monitors above; confirm external-vs-internal pairs both go
  green independently.
- Manually break one (e.g. `docker compose stop api`): internal API monitor goes
  down, external API monitor goes down, Slack/Discord alert fires,
  `POST /monitoring/webhook` call is attempted (will itself fail since `api` is
  down — confirms the documented accepted gap behaves as designed, not as a
  silent failure), restart `api`, confirm the "up" transition closes things out
  the same way.
- `curl -X POST https://api.biasmarket.com/api/monitoring/webhook` without the
  secret header → 401. With a wrong secret → 401. With the correct secret and a
  real Kuma-shaped payload → 201/200 and a `PlatformIncident` row appears.
- `GET /api/monitoring/incidents` as a non-admin session → 403; as admin → 200
  with the recorded incident.
- `pnpm typecheck`, `pnpm --filter api test`, `pnpm --filter web test`,
  `pnpm --filter api generate:openapi` produces a clean diff (or no diff if
  nothing's out of sync beyond the new controller).

## Definition of done

`uptime-kuma` runs in prod, monitors API/Web (external + internal)/DB/MinIO,
serves a public status page with only the two user-facing monitors, pages
Slack/Discord directly on state changes (independent of `api`'s own
availability), and separately persists incident history to Postgres via a
secret-gated webhook endpoint queryable by admins. `web` gained the health
endpoint it was missing. Worker monitoring is explicitly deferred until
`apps/workers` exists.
