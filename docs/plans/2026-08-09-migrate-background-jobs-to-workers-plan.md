# Migrate transactional email + order-expiration sweep onto `apps/workers`

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`).

**Depends on**: `2026-08-09-workers-infra-setup-plan.md` (BullMQ/Redis infra,
`apps/workers` scaffold, `packages/queue` contracts). This plan assumes that one
has already landed and only adds real jobs on top of it — start a fresh session
per plan, in this order.

## Context — what's actually running today

Full read of every `apps/api` call site that does non-trivial I/O outside the
request's own DB transaction, to find real "shouldn't block the HTTP response"
candidates (not a hypothetical list — every item below is a real, currently-live
code path):

**Transactional email — 7 call sites, all synchronous, all silently
non-retrying:**

- `apps/api/src/auth/auth.config.ts:70` — better-auth's
  `emailVerification.sendVerificationEmail` hook (seller signup + resend-on-
  sign-in). Already wrapped in better-auth's own
  `advanced.backgroundTasks.handler` (fire-and-forget, catch-and-log) — the one
  call site that's _already_ non-blocking, just not retrying.
- `apps/api/src/modules/orders/application/review-payment.usecase.ts:161` —
  payment approved/rejected email to the buyer, `await`ed inside the use case,
  wrapped in `try/catch { logger.error }`. **Blocks the seller's
  approve/reject-payment API response** on a live Resend call.
- `apps/api/src/modules/orders/application/customer-account.service.ts` — four
  sends (`sendVerificationEmail`, `sendPasswordResetEmail`,
  `sendEmailChangeConfirmation`, `sendPhoneChangeConfirmation`), each `await`ed
  inline with the same `try/catch { logger.error }` shape. Two of these
  (verification, password reset) sit directly in the **public checkout / buyer
  login path** — a slow Resend response measurably slows checkout for every
  buyer, not just the one whose email is being sent.

Every one of the seven has the exact same failure mode: **one transient Resend
error (rate limit, timeout, 5xx) and that email is gone — no retry, just a log
line**. No incident tied to this has actually been reported (same
theoretical-vs-incident-driven distinction the observability plan drew for its
own severity call) — this is a real, currently-live gap worth closing, not a
"this already caused a problem" claim.

**Scheduled sweep — one cron, in-process, replica-unsafe:**

- `apps/api/src/modules/orders/application/orders-cron.service.ts` —
  `@Cron
  "*/5 * * * *"` calls `ExpireOrdersUseCase.execute()`, which finds
  orders past `expiresAt` still `PENDING_PAYMENT`/`PARTIALLY_PAID` and releases
  their stock holds. **Correction to an earlier draft of this section**: this is
  _not_ a live correctness bug even under multiple `api` replicas —
  `expire-orders.usecase.ts` already guards each order's cancel/stock-release
  inside a `$transaction` with a status-checked `updateMany` (bails with
  `count === 0` if another process already flipped that order's status first,
  the same "guarded `updateMany`" pattern `review-payment.usecase.ts` uses for
  its own concurrent-review guard). Two replicas ticking at once can't
  double-cancel an order or double-release its stock; they can only both scan
  the same `findMany` and one of them does redundant, wasted work per order.
  `architecture.md` §9's documented scaling path ("split `api` into multiple
  containers... once traffic justifies it") makes that redundant-work problem
  real the moment it happens, and — more importantly for this plan's actual goal
  — the cron staying api-local means **nothing about scheduling this sweep is
  "work relocated to workers"** even today, at one replica. Both are legitimate
  reasons to migrate; neither is "fixing a bug," and the design below is
  justified on that more honest basis, not a correctness claim.

**Considered and explicitly rejected for this plan:**

- **Image upload post-processing** (resize/thumbnail, EXIF strip).
  `docs/core/
  architecture.md` §7 documents "re-encode/strip EXIF before
  storing" as a requirement, but a grep for `sharp` (the only image-processing
  lib present anywhere in the repo's `allowBuilds`/`onlyBuiltDependencies` pnpm
  config) turns up **zero actual usage** — `storage.service.ts` uploads the raw
  buffer as-is today. This is a real, pre-existing gap (uploaded
  product/logo/proof images keep their original EXIF data, no resizing happens),
  and it's a good future worker job — but it's _new feature work_ (building
  EXIF-stripping/ resize logic that doesn't exist yet), not a migration of
  existing behavior, and mixing "build a new capability" into a "move existing
  sync work to async" plan makes both harder to review. Flagged here so it isn't
  lost; belongs in its own plan.
- **Stock-alert notification writes** (`notifications.service.ts`'s
  `syncStockAlerts`, called from `review-payment.usecase.ts` and product
  mutations). These are plain Prisma writes inside the caller's existing
  transaction, no external I/O, no retry-worthy failure mode — moving them to a
  queue would add latency (a round trip through Redis) for zero benefit and
  would also pull them out of the transaction they currently need to stay inside
  (an approved payment and its stock-alert state should commit atomically). Not
  a queue candidate.
- **`AuditLog` writes** — same reasoning, worse: these are the evidence trail
  `docs/core/architecture.md` §10 explicitly calls out as needing to stay
  reliable and atomic with the state change they record ("don't allow deletion,
  only status changes"). Moving this off the transaction it's written in for the
  sake of async-ing it would weaken the one thing it's for. Not a queue
  candidate, full stop.
- **Stats/suggestions precomputation** (`modules/stats`, 326-line
  `stats.service.ts`). Computed on-demand per dashboard request today; a
  worker-driven nightly precompute-and-cache job is a legitimate future
  optimization but there's no evidence yet (no reported slow-dashboard
  complaint, no plan/audit doc mentioning it) that it's a real problem today —
  speculative work, not migration of a known-slow path. Left out.

## Decision: `MailerService.send()` keeps its exact signature; only its guts

change

The lowest-risk way to move email sending off the request path is to change
**only** what `MailerService.send()` does internally, not any of the 7 call
sites that already depend on it:

- **Stays in `apps/api`, unchanged**: every `buildXEmailHtml()` function
  (`review-payment.usecase.ts`, `customer-account.service.ts`, `auth.config.ts`)
  — pure, synchronous, no I/O, no reason to move. `apps/api` keeps rendering the
  final HTML string exactly as it does today.
- **`apps/api/src/mailer/mailer.service.ts`**: `send(params: SendEmailParams)`
  now does `queue.add(QUEUE_NAMES.MAILER, "send", validatedParams)` (via
  `packages/queue`'s Zod schema for the mailer job, from the infra plan) instead
  of constructing a `MailerCore` and calling Resend/writing a file directly.
  **Its return type doesn't change for free**: today's signature is
  `Promise<{ id: string }>` where `id` is Resend's message id; `queue.add()`
  resolves to a BullMQ `Job`, not that shape. `send()` should map `job.id` into
  the same `{ id: string }` return (a BullMQ job id, not a Resend message id —
  different meaning, same shape) so none of the 7 call sites — which don't
  currently use the return value, confirmed by reading all seven — need to
  change, and the type checker still passes.
- **`apps/api/src/mailer/mailer.core.ts` moves to
  `apps/workers/src/jobs/
  mailer/mailer.core.ts`** — the Resend SDK call and
  the dev-mode file-writer both belong where the actual send happens now.
  `apps/api` no longer depends on the `resend` package at all once this lands
  (drop it from `apps/api/package.json`, add to `apps/workers/package.json`).
- **Job-retention override for the mailer queue — the rendered HTML payload is
  sensitive and needs tighter handling than a blind default.** Correction to an
  earlier draft: the infra plan defines a shared `defaultJobOptions` constant in
  `packages/queue/src/default-job-options.ts`, but **nothing in `apps/api` or
  `apps/workers` actually passes it to `registerQueue()`/`queue.add()` today** —
  grep confirms zero call sites reference it. So there is no active baseline to
  "override" yet; every existing queue (`PING`) runs on BullMQ's own hardcoded
  defaults (keep-everything), not the infra plan's intended one. This plan must
  pass `defaultJobOptions` explicitly when registering the `mailer` queue (in
  both `apps/api/src/queue/queue.module.ts` and
  `apps/workers/src/queue/queue.module.ts`, see the "Files likely touched" note
  below), and then apply its own tighter override on top for the reasons below —
  not assume a shared policy is already governing anything. Four of the seven
  emails embed a live, working account-action token directly in the HTML
  (`customer-account.service.ts`'s
  verification/password-reset/email-change/phone-change links,
  `auth.config.ts`'s seller signup-verification link) — today that token only
  ever exists in process memory plus the one outbound Resend call. Once
  `mailer.send()` becomes `queue.add()`, the finished HTML (token included)
  becomes a Redis-persisted job payload, and leaving it on `defaultJobOptions`'s
  `removeOnComplete: { count: 1000 }` (backed by an AOF/RDB-persisted volume)
  would keep it there well past the moment the email is actually sent — a real
  widening of exposure for what's effectively a bearer credential, not mentioned
  in either plan's original security discussion. **Override for the `mailer`
  queue specifically**: `removeOnComplete:
  true` (delete immediately on
  success, no retention — mailer jobs don't need historical debugging the way,
  say, a future analytics job might), `removeOnFail: { count: 20 }` (kept
  deliberately small, and called out explicitly here as an **accepted residual
  risk**: a failed job's payload — including its token — still sits in Redis
  until that count rolls over or someone clears it by hand). This is
  meaningfully mitigated but not eliminated by the tokens' own TTLs
  (`packages/utils/src/customer-account-
  token/index.ts` — confirm/change-type
  tokens run ~30 days per `infra/docker/.env.example`'s existing comment, reset
  tokens are deliberately much shorter), not eliminated by network security
  (Redis stays internal-only per the infra plan), which together are judged
  sufficient for this app's current scale — revisit if this pattern is ever
  reused for a higher-value credential.
- **New `apps/workers/src/jobs/mailer/mailer.processor.ts`**: a
  `@Processor(QUEUE_NAMES.MAILER)` that receives the validated job payload and
  calls `MailerCore.send()`. Concurrency: start conservative (e.g. 5) — Resend
  has its own rate limits, and unlike inline sends there's now backpressure
  (BullMQ) instead of an unbounded flood if, say, a bulk operation ever enqueues
  many emails at once (relevant for the "Stretch opportunities" restock-notify
  idea below, which would be exactly that kind of fan-out).
- **`MAIL_DRIVER`/`RESEND_API_KEY`/`RESEND_FROM_EMAIL` env vars move from being
  `apps/api`-required to `apps/workers`-required** — `apps/api`'s
  `env.validation.ts` drops them from its required set (it no longer touches
  Resend), `apps/workers` gains its own copy of the same conditional-on-
  `MAIL_DRIVER=resend` validation logic `mailer.core.ts` already has today. The
  dev-mode `.mailer-dev/` output directory moves from `apps/api/.mailer-dev/` to
  `apps/workers/.mailer-dev/` — update `.gitignore` and tell whoever's testing
  locally where dev emails land now (worth a one-line callout in whatever
  PR/changelog closes this out, easy to lose track of).
- **`apps/api/scripts/send-test-email.ts` / `pnpm --filter api mail:test`**:
  keep the script in `apps/api`, but change it to call `MailerService.send()`
  (i.e. enqueue through the real pipeline) instead of instantiating `MailerCore`
  directly — this makes it an actual smoke test of the new queue path end to
  end, not just of Resend credentials in isolation. Rename if the "api
  mail:test" naming gets confusing once sending itself lives in workers; not
  essential, implementer's call.
- **`auth.config.ts`'s `advanced.backgroundTasks.handler`**: leave as-is.
  `queue.add()` is itself an async Redis round-trip, so keeping better-auth's
  own fire-and-forget wrapper around the (now much cheaper, but not zero-cost)
  enqueue call is still correct — no change needed here beyond `mailer.send()`
  itself changing underneath it.

**Net effect at the 7 call sites**: zero code changes beyond what dependency
injection already wires up. The existing `try/catch { logger.error }` blocks
stay — their meaning shifts from "email failed to send" to "email failed to even
get scheduled" (a Redis-down scenario), which is rarer and generally louder
(Redis being down affects far more than one email) but still worth catching for
the same reason it was worth catching before.

## Decision: order-expiration sweep — BullMQ repeatable job in `apps/workers`,

calling back into a new internal endpoint on `apps/api`, reached only over the
internal Docker network

This is the one genuinely non-trivial design decision in this plan, and worth
laying out the alternatives considered — including a real reassessment of the
"chosen" option's original justification, which an earlier draft overstated (see
the corrected Context note above: this is not a live correctness bug at today's
traffic, both remaining options are legitimate for different reasons):

1. **(Rejected) Duplicate `ExpireOrdersUseCase`'s logic into `apps/workers`,
   giving it its own `@biasmarket/db` access.** Would require either duplicating
   `OrderRepository`/`Order` entity/`order-status.vo.ts` in `apps/workers`, or
   extracting the `orders` module's DDD-lite layer into a new shared package
   both apps import. The latter is a real, defensible refactor eventually, but
   it's a much bigger and riskier change than "move a cron trigger" — it splits
   a single bounded context's business logic across two deployable apps,
   contradicts `docs/core/architecture.md` §2's explicit scoping of the DDD-lite
   layering to `orders` _within_ `api`, and would need its own careful plan. It
   would also break the infra plan's deliberate choice to keep `apps/workers`
   entirely free of `@biasmarket/db`/Postgres access (see that plan's scaffold
   section) — rejected for this pass.
2. **(Real alternative, not just a fallback) Redis-based distributed lock, keep
   the cron in `apps/api` itself.** `orders-cron.service.ts` wraps
   `expireOrders.execute()` in a `SET lock:expire-orders NX PX 60000` mutex so
   only one `api` replica's tick actually runs. Smaller, zero new HTTP attack
   surface, no new env var, no new controller — genuinely the lower-risk option
   on pure engineering merit. It's passed over here for one reason only: it
   relocates nothing to `apps/workers`, which is this plan's actual purpose per
   the user's explicit ask to find real background work to move off `apps/api`.
   If review pushes back on option 3's added surface area being worth it for a
   redundant-work optimization rather than a correctness fix, this is the right
   fallback — swap it in without needing a new plan doc, the tradeoff is fully
   described here already.
3. **(Chosen, with hardening this draft adds) `apps/workers` owns _scheduling_**
   (BullMQ repeatable job, `*/5 * * * *`, replaces `@nestjs/schedule`'s `@Cron`
   — remove `ScheduleModule.forRoot()` and the `@nestjs/schedule` dependency
   from `apps/api` once this lands, confirmed it's the _only_ `@Cron` usage in
   the app), **but the job's processor does nothing more than call a new
   internal endpoint on `apps/api`** — `POST /internal/orders/expire-sweep` —
   which still runs `ExpireOrdersUseCase.execute()` exactly as
   `orders-cron.service.ts` does today, in-process, with full access to the
   existing `OrderRepository`/ `PrismaService`/transaction handling.
   `apps/workers` becomes a scheduler / dispatcher for this job, not an executor
   — genuinely relocates _ownership of scheduling_ (today, nothing about "when
   this runs" lives outside `api` at all) while leaving 100% of `orders` domain
   logic where it belongs. Chosen over option 2 specifically because it
   satisfies the plan's actual objective; **its justification is "centralizes
   scheduling + eliminates redundant per-replica scans," not "fixes a
   duplicate-cancellation bug"** — there isn't one, per the corrected Context
   note.

   **Three required layers of defense, not one — an earlier draft of this plan
   relied on the shared secret alone, which a review pass correctly flagged as
   insufficient given the endpoint sits on the same container Caddy already
   proxies `/api/*` to publicly:**

   1. **Network path**: `apps/workers` calls this endpoint over the internal
      Docker network hostname only —
      `http://api:3000/internal/orders/expire-
      sweep`, never the public
      `api.biasmarket.com` domain. New env var `INTERNAL_API_URL` on
      `apps/workers`, reusing the exact name and value `apps/web` already sets
      for the same purpose (`INTERNAL_API_URL=http://
      api:3000` — SSR
      fetches from inside the `web` container use it today exactly the same way;
      `apps/workers` is just a second consumer of an existing convention, not a
      new one).
   2. **Caddy-level block**: add an explicit `handle /internal/*` block to
      `infra/caddy/Caddyfile` that responds `404` (or `403`), placed _before_
      the existing catch-all `handle /api/* { reverse_proxy api:3000 }` block
      (Caddy's `handle` directives are first-match-wins) — mounting the new
      controller under a path prefix (`/internal/...`, not `/api/internal/...`)
      specifically so it's easy to block as a whole prefix rather than having to
      enumerate individual excluded routes under `/api/*`. This costs nothing
      for the legitimate call (`workers` never goes through Caddy in the first
      place) and turns "internet-reachable unless the secret holds" into "not
      internet-reachable at all, and also requires a secret if that's ever
      wrong" — genuine defense in depth, not a redundant layer.
   3. **Shared secret**: still required as the last line of defense (Caddy
      misconfiguration, a future reverse-proxy change, someone reaching the
      container directly on a shared network segment). New
      `INTERNAL_JOBS_
      SECRET` env var, known to both `apps/api` and
      `apps/workers`, generated the same way `scripts/init-env.ts` generates
      `BETTER_AUTH_SECRET` today, checked via a dedicated Nest guard doing a
      **constant-time comparison** (not `===`, which leaks timing information on
      a secret comparison). Sits behind `@nestjs/throttler` too — this repo
      wires the throttler **per module** (`customer-auth.module.ts`,
      `contact.module.ts`, `restock.module.ts` each call
      `ThrottlerModule.forRoot(...)` independently, there's no global instance
      to inherit from), so whichever module houses the new controller needs its
      own explicit `ThrottlerModule.forRoot(...)` import — easy to drop silently
      if this isn't called out. **Log every call (success and auth-failure)
      distinctly** — an auth failure here is a more interesting signal than a
      normal 401 (someone/something reached an internal endpoint it shouldn't
      have), worth its own log line, not lumped in with routine auth noise.

## Files likely touched

- `apps/api/src/mailer/mailer.service.ts` (enqueue instead of direct send),
  `apps/api/src/mailer/mailer.core.ts` (deleted — moves to `apps/workers`),
  `apps/api/package.json` (drop `resend`, add `@biasmarket/queue`)
- `apps/workers/src/jobs/mailer/mailer.core.ts` (moved),
  `apps/workers/src/jobs/mailer/mailer.processor.ts` (new),
  `apps/workers/package.json` (add `resend`)
- `apps/api/scripts/send-test-email.ts` (call through `MailerService` instead of
  `MailerCore` directly)
- `apps/api/src/config/env.validation.ts` (drop `RESEND_*`/`MAIL_DRIVER`
  requirement), new equivalent in `apps/workers/src/config/env.validation.ts`
  (add it, conditional on `MAIL_DRIVER=resend` — same logic, new home)
- `packages/queue/src/queue-names.ts` — **new file, not a placeholder to flesh
  out.** The infra plan shipped `QUEUE_NAMES` with a single `PING` entry only
  (its own non-goals section deliberately scoped it that way); add `MAILER` (and
  `ORDERS`, for the sweep dispatcher below) here.
- `packages/queue/src/jobs/mailer.jobs.ts` — **new file**, same caveat: no
  mailer job file exists yet anywhere in `packages/queue`, only
  `jobs/ping.jobs.ts`. Add the `SendEmailParams`-shaped Zod schema + inferred
  type from scratch, following `ping.jobs.ts`'s shape.
- `apps/api/src/queue/queue.module.ts`, `apps/workers/src/queue/queue.module.ts`
  — both currently only call
  `BullModule.registerQueue({ name:
  QUEUE_NAMES.PING })`. Add a
  `registerQueue({ name: QUEUE_NAMES.MAILER,
  defaultJobOptions })` call (with
  this plan's mailer-specific override, see above) to **both** files —
  `@Processor(QUEUE_NAMES.MAILER)` in `apps/workers` has nothing to attach to
  otherwise, and `apps/api`'s producer side can't `queue.add()` into an
  unregistered queue name either.
- `apps/api/src/modules/orders/application/orders-cron.service.ts` (deleted),
  `apps/api/src/app.module.ts` (remove `ScheduleModule.forRoot()`),
  `apps/api/package.json` (drop `@nestjs/schedule` — confirm no other usage
  first)
- New `apps/api/src/modules/orders/infrastructure/internal-jobs.controller.ts`
  (mounted at `/internal/orders/expire-sweep`, **not** under the global `api`
  prefix — confirm at implementation time whether `main.ts`'s
  `setGlobalPrefix("api")` needs an explicit exclusion for this controller, or
  whether it's registered on a path that bypasses the prefix entirely; either
  way the Caddy block below assumes the final path is `/internal/*`, not
  `/api/internal/*` — keep the two in sync), new `InternalJobsSecretGuard`, new
  `ThrottlerModule.forRoot(...)` import wherever this controller's module lives
  (this app doesn't have a global throttler instance to inherit from)
- `apps/workers/src/jobs/orders/expire-orders-scheduler.ts` (BullMQ repeatable
  job registration + the HTTP call to the internal endpoint, using
  `INTERNAL_API_URL`) — needs `QUEUE_NAMES.ORDERS` registered in
  `apps/workers/src/queue/queue.module.ts` (see above) to attach the repeatable
  job to
- `infra/caddy/Caddyfile` (new `handle /internal/*` block responding 404, placed
  before the existing `/api/*` catch-all)
- `infra/docker/.env.example`, `scripts/init-env.ts` (`INTERNAL_JOBS_SECRET`,
  `INTERNAL_API_URL` for `apps/workers` — reuses `apps/web`'s existing
  value/convention, not a new pattern — and moving `RESEND_*`/`MAIL_DRIVER`'s
  "which service needs this" comments to point at `workers` instead of `api`)
- `.gitignore` (`apps/api/.mailer-dev/` → `apps/workers/.mailer-dev/`)
- `docs/core/architecture.md` §9 (mark the "order confirmation emails"/queue
  bullet implemented; note the cron-migration pattern for future scheduled-job
  work)

## Stretch opportunities (explicitly out of this plan's core scope)

Found during research, real gaps, but **new feature work**, not migration of
existing behavior — worth their own future plan(s) once the core migration above
has landed and proven itself, not bundled in here:

- **Restock notifications are a half-built feature today.**
  `RestockService.create()` (`apps/api/src/modules/restock/restock.service.ts`)
  stores a buyer's name/phone against a product/variant when they ask to be
  notified on restock — but grepping the entire module and every mailer/
  WhatsApp call site turns up **no code anywhere that ever notifies them**. Once
  a stock-increase mutation happens, nothing checks `RestockRequest` rows at
  all. This is a natural fit for the exact fan-out-friendly infra this plan
  builds (one job per pending request, bounded concurrency, retryable) — but
  deciding the actual product behavior (email? WhatsApp link? both? notify once
  and delete the request, or allow repeat notifications?) is a product decision
  this plan shouldn't make unilaterally.
- **Contact inquiries have no admin notification.** `ContactService.create()`
  just writes a row; an admin only finds out by checking the dashboard. A "new
  inquiry" email to the admin/support address would be a small, natural
  mailer-queue job once the mailer migration above exists — but again, new
  behavior, not a migration.

## Verification

- Unit tests: `MailerService.send()` now asserts a `queue.add()` call with the
  validated payload (mock the injected `Queue`), not a `MailerCore`
  instantiation. `apps/workers`' `MailerProcessor` unit-tested against a mocked
  `MailerCore`/Resend client. `InternalJobsSecretGuard` unit-tested for both
  valid-secret and invalid/missing-secret cases, including a timing-safety
  sanity check if feasible.
- e2e / manual: trigger each of the 7 email flows locally with
  `MAIL_DRIVER=
  file`, confirm the `.html` file now appears under
  `apps/workers/.mailer-dev/` rather than `apps/api/.mailer-dev/`, and confirm
  the triggering HTTP request (e.g. approve-payment) returns **before** the
  email file is necessarily written (proving it's actually async now, not just
  relocated-but-still- blocking).
- Kill `apps/workers` entirely, exercise one of the 7 flows, confirm the
  triggering request still succeeds (enqueue succeeds even if nothing's
  consuming yet) and the job appears/waits in the queue, then bring
  `apps/
  workers` back up and confirm it drains and sends the backlog.
- From inside the `workers` container (or another container on the same Docker
  network), curl the internal endpoint without the secret header, confirm
  401/403; with a wrong secret, same; with the correct secret, confirms it runs
  the sweep. Confirm it's rate-limited (rapid repeated calls without a valid
  secret get throttled, not just individually rejected). **Separately**, from
  outside the Docker network (host machine, hitting whatever Caddy fronts in the
  dev/staging stack), confirm the same path 404s before it ever reaches the
  guard — this is the layer most likely to be skipped since the app-level test
  above can pass while the Caddy block is missing or misconfigured.
- Let the BullMQ repeatable job run for at least two ticks locally, confirm
  exactly one dispatch per tick — the correctness property being verified here
  is "only one process in the system ever triggers this sweep," not "concurrent
  triggers would corrupt data" (they wouldn't, per the corrected Context note —
  `expire-orders.usecase.ts`'s own guard already prevents that); this check is
  about ownership/redundant-work, not data safety.
- `pnpm typecheck`, `pnpm --filter api test`, `pnpm --filter workers test`.

## Definition of done

All 7 transactional-email call sites route through `apps/workers` with
retry/backoff instead of blocking the request path — every approve/reject-
payment and buyer-checkout/login response returns without waiting on Resend. The
order-expiration sweep's scheduling is owned by `apps/workers` (single
dispatcher regardless of `api` replica count), with the sweep itself still
executing inside `api`'s existing `orders` domain layer, reached only over the
internal Docker network and behind a Caddy-level block plus a shared secret. No
behavior visible to a buyer or seller changes (same emails, same content, same
expiration timing) — only where and how reliably the work executes.
