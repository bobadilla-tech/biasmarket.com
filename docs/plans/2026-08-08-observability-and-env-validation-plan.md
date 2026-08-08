# Observability + startup env-var validation

**Status:** Pre-implementation plan (written ahead of the work, per audit
follow-up request).

**Source:** `docs/audits/audit-2026-08-08.md` §12 (important findings #5, #7),
§16 (#4).

## Context

Two independent gaps, bundled here because they're both "operational safety net"
work, both cheap, and both mostly touch bootstrap/config code rather than
business logic (low collision risk with the other concurrent plans).

Today, a production error is only visible via `Logger.error` to stdout inside
`AllExceptionsFilter` (`apps/api/src/common/filters/all-exceptions.filter.ts`) —
nothing forwards it anywhere, and `Logger`/`console.*` usage exists in only 4-5
files total across the whole API. Confirmed by reading the filter: the `catch()`
method's unhandled-exception branch (lines 35-38) does exactly one thing with
the error — `this.logger.error(...)` — before falling through to a generic 500
response; there is no hook point for a tracker today.

Separately, `deploy.md`'s own "Known limitations" section documents that
missing/misconfigured prod env vars fail silently or fall back to a `localhost`
default rather than refusing to boot. **Correction to the original framing
above:** `storage.service.ts`'s `requiredEnv()` is not the _only_ instance of
this pattern — a grep for `function requiredEnv` turns up five independent
copies of the identical helper, with different eagerness/timing that matters for
how this plan should generalize them:

- `apps/api/src/storage/storage.service.ts` (lines 9-13) — validates
  `S3_BUCKET`, `S3_LOGO_BUCKET`, `S3_PUBLIC_URL`, `S3_ENDPOINT`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY` as **class field initializers**, and
  `StorageModule` is imported eagerly into `AppModule` — so these genuinely
  throw at boot, before `app.listen()`.
- `apps/api/src/mailer/mailer.core.ts` (lines 7-11) — validates `RESEND_API_KEY`
  and `RESEND_FROM_EMAIL` the same way, also as class fields on `MailerCore`,
  constructed via `MailerService`'s own field initializer
  (`private core = new MailerCore();`). `MailerModule` is `@Global()` and
  imported eagerly too, so **these already throw at boot today,
  unconditionally** — even when `MAIL_DRIVER=file`. This directly contradicts
  the "`RESEND_API_KEY` (or `MAIL_DRIVER=file` for local)" framing below in the
  original Problem 2 text: as written today, setting `MAIL_DRIVER=file` does
  _not_ make `RESEND_API_KEY`/`RESEND_FROM_EMAIL` optional — the mailer module
  requires both regardless, which looks like an existing latent bug rather than
  intentional behavior (`resolveDriver()` clearly means to support a file-only
  local mode). Worth a one-line mention/fix-or-flag when this plan is
  implemented, not just documented around.
- `apps/api/src/modules/customer-auth/customer-auth.service.ts`,
  `.../customer-session.guard.ts`, and
  `apps/api/src/modules/orders/application/customer-account.service.ts` — three
  more copies, all validating `CUSTOMER_ACCOUNT_TOKEN_SECRET`, but called
  **lazily inside method bodies at request time**, not from a constructor or
  field initializer. A missing `CUSTOMER_ACCOUNT_TOKEN_SECRET` today does _not_
  fail at boot — the app starts fine, health checks pass, and the first
  buyer-auth request (login, session verification, or the order-flow
  customer-account paths) throws a 500 with
  `Missing required env var: CUSTOMER_ACCOUNT_TOKEN_SECRET`. This is the one
  existing var-validation gap that most resembles the "silent until it isn't"
  failure mode this plan is meant to close, and the plan should call it out by
  name — it's more concerning than the S3/Resend cases, which already fail fast,
  and than `WEB_URL`, which fails loud (broken CORS/redirects) rather than
  silently.

So the actual generalization target isn't "one helper used in one file," it's
"five duplicate helpers with inconsistent eagerness" — collapsing them to one
shared `requiredEnv` (or module) called once at bootstrap, and removing the
now-redundant per-file copies, is in scope for Problem 2 and should be listed
under "Files likely touched."

## Problem 1 — basic error tracking

Add a Sentry-class error-tracking SDK to `apps/api` (wire it into
`AllExceptionsFilter` so every unhandled exception reports there, not just
`stdout`) and, if reasonable in the same pass, `apps/web` (client + server error
boundaries). Keep this minimal — the goal is "errors are visible within
minutes," not a full APM rollout. Use environment-gated initialization (only
active when a DSN env var is set) so local dev isn't forced to configure it.
Check whether the user already has a preferred vendor/account before assuming
Sentry specifically — if no preference is known, Sentry is a reasonable default
given its NestJS + Next.js first-party SDK support, but flag this as a decision
point rather than a silent choice.

## Problem 2 — startup env-var validation

Generalize the `requiredEnv()` pattern (five duplicate copies today, see Context
above) into a single app-wide startup check. Reasonable approach: a small
validation step in `main.ts` (or a dedicated `env.validation.ts` run at
bootstrap) that asserts every env var the app actually depends on at runtime is
present and non-empty, then delete the per-file copies in favor of importing the
one shared helper.

Actual, verified list from
`grep -rn "process\.env\." apps/api/src
--include="*.ts"` (test files excluded),
grouped by current validation state:

**Already validated, but only at request time — promote to boot-time:**

- `CUSTOMER_ACCOUNT_TOKEN_SECRET` — read in
  `modules/customer-auth/customer-auth.service.ts`,
  `modules/customer-auth/customer-session.guard.ts`, and
  `modules/orders/application/customer-account.service.ts`. Buyer-session
  signing secret; currently only throws on the first buyer-auth request, not at
  boot.

**Already validated eagerly at boot today (keep, just route through the shared
helper instead of a local copy):**

- `S3_BUCKET`, `S3_LOGO_BUCKET`, `S3_PUBLIC_URL`, `S3_ENDPOINT`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY` (`storage.service.ts`)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (`mailer.core.ts`) — see the Context
  note above about this being required unconditionally today, not just when
  `MAIL_DRIVER=resend`

**Read directly with no validation, no throw, silent fallback where a fallback
exists — the vars `deploy.md` is actually describing:**

- `DATABASE_URL` (`prisma/prisma.service.ts:16`) — passed straight into
  `PrismaPg`'s `connectionString`; undefined doesn't throw a clear message, it
  fails later inside the `pg` driver at `$connect()` with a raw driver-level
  error.
- `BETTER_AUTH_SECRET` (`auth/auth.config.ts:42`) — passed straight to
  `betterAuth()`; security-critical (session signing), no validation at all
  today.
- `BETTER_AUTH_URL` (`auth/auth.config.ts:41`) — same, no validation; not
  mentioned in the original Problem 2 var list, should be.
- `WEB_URL` — read in five places (`app.controller.ts`, `auth.config.ts` twice,
  `main.ts`, `customer-auth/origin.guard.ts`,
  `orders/application/customer-account.service.ts`), every one of them
  `?? "http://localhost:3001"`. This is the literal example `deploy.md` cites
  ("forgetting to set `WEB_URL`").
- `MAIL_DRIVER` (`mailer/mailer.core.ts:14`) — has its own inline validation
  (`resolveDriver()` throws on an invalid value), but is optional and defaults
  to `"file"` when unset — correctly so, don't add this to the required list,
  just note it's already handled.

**Read with an intentional, harmless fallback — do not add to the required
list:**

- `PORT` (`main.ts:53`, defaults `3000`)
- `SWAGGER_ENABLED` (`main.ts:46-48`, defaults based on `NODE_ENV`)
- `NODE_ENV` (`main.ts`, `customer-auth.controller.ts`,
  `customer-session.guard.ts` — gates the cookie `secure` flag and the Swagger
  default; worth a startup _warning_ if unset in what looks like a prod deploy,
  not a hard failure, since Node itself treats unset `NODE_ENV` as a valid (if
  non-production) state)

Net: the boot-time-required set this plan should actually enforce is
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_URL`,
`CUSTOMER_ACCOUNT_TOKEN_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and the
six `S3_*` vars — larger and more specific than the original draft's list (which
named `DATABASE_URL`, `BETTER_AUTH_SECRET`, `WEB_URL`, `RESEND_API_KEY` and
waved at "whatever else the grep turns up"; it missed `BETTER_AUTH_URL`,
`RESEND_FROM_EMAIL`, and — the most operationally relevant miss —
`CUSTOMER_ACCOUNT_TOKEN_SECRET`).

Fail fast (throw before the server starts listening) with a clear message naming
exactly which var is missing — mirror the exact error message shape
`requiredEnv()` already uses (`Missing required env var: ${name}`) for
consistency rather than introducing a different format.

Don't build a generic schema-validation library integration (Joi/zod-env) unless
one is already a dependency somewhere in the repo — a plain function matching
the existing `requiredEnv` shape is enough and keeps this consistent with what's
already there.

## Files likely touched

- `apps/api/src/common/filters/all-exceptions.filter.ts` (Problem 1)
- `apps/api/src/main.ts` (Problem 1 init, Problem 2 validation call)
- New file, e.g. `apps/api/src/config/env.validation.ts` (Problem 2) — exports
  the one shared `requiredEnv()`
- `apps/api/src/storage/storage.service.ts`,
  `apps/api/src/mailer/mailer.core.ts`,
  `apps/api/src/modules/customer-auth/customer-auth.service.ts`,
  `apps/api/src/modules/customer-auth/customer-session.guard.ts`,
  `apps/api/src/modules/orders/application/customer-account.service.ts` — delete
  each file's local `requiredEnv()` copy, import the shared one instead (Problem
  2 cleanup, not just `main.ts`/new-file additions)
- `apps/web/` root layout / instrumentation file, if Sentry is added there too
  (Problem 1)
- `.env.example`, `infra/docker/.env.example` if new required vars are
  documented as part of this (don't add new required vars unless introducing
  Sentry's DSN — keep validation additive to what already exists)

## Verification

- Start the API with a required var unset locally — confirm it refuses to boot
  with a clear message, not a silent fallback.
- Trigger a deliberate unhandled exception locally (e.g. a temporary throw in a
  route) and confirm it's captured by the error tracker if a DSN is configured,
  and still logs to stdout either way (don't remove the existing stdout logging,
  add to it).
- `pnpm typecheck`, `pnpm --filter api test`.

## Definition of done

A production error is visible somewhere other than stdout within minutes of
happening; the app refuses to boot with a clear error naming the missing var if
a required env var is absent, for every var the app actually depends on, not
just the storage-related ones.

## Severity Classification

Both problems are correctly bundled as cheap, low-collision "safety net" work,
but they are not equally urgent today. Rated against actual operational risk on
the current deploy target — a single Oracle Cloud VM, explicitly scoped in
`deploy.md` as "get it live and shareable, not a hardened production setup"
(`docs/core/deploy.md` intro + "Known limitations") — and against whether either
gap has actually caused an incident: a search of `docs/plans/*.md` and
`docs/audits/*.md` for "sentry," "error track," "missing env," and "silently
missing" turns up only the audit itself and one earlier session-recap note
(`docs/plans/2026-07-22-session-recap-and-gaps.md`) that names the _same_
still-open gap — no plan record of either problem actually biting anyone in
production. Both are currently theoretical, not incident-driven.

**Problem 1 (error tracking): LOW today, rising to HIGH the moment there's real
production traffic.**

- The audit's own priority list (§10) independently classifies this as "NICE TO
  HAVE... becomes MUST HAVE the moment real users hit it" — this plan should
  keep that framing rather than treating it as equally urgent to Problem 2 right
  now.
- Current mitigation is real, if manual: every unhandled exception already
  reaches stdout via `AllExceptionsFilter` (confirmed at
  `all-exceptions.filter.ts:35-38`), and on a single Docker Compose VM that's
  `docker logs` or `docker compose logs api` away — slow and reactive (nobody's
  paged), but not silent/invisible the way a raw crash with no logging at all
  would be.
- Cost of staying LOW a while longer: debugging any production issue today means
  SSH + log grep instead of a dashboard. Annoying, not dangerous, at
  pre-launch/low-traffic volume.
- Trigger to re-rate as HIGH: first cohort of real (non-team) users placing real
  orders — at that point a silent payment/order-flow exception with no alerting
  is a real revenue/trust risk, consistent with the audit's own framing.

**Problem 2 (startup env-var validation): MEDIUM, with one sub-case that's
closer to HIGH.**

- Not uniformly silent today, which the original plan draft undersold: `S3_*`
  and `RESEND_*` vars already hard-fail at boot (verified above); `DATABASE_URL`
  and `BETTER_AUTH_SECRET` are unvalidated but fail loud and fast in practice
  (`$connect()` errors, better-auth internal errors) — bad error messages, not
  silent misbehavior.
- `WEB_URL`'s silent `localhost` fallback — the specific case `deploy.md` calls
  out by name — is real but self-limiting: a wrong `WEB_URL` in prod breaks
  CORS/redirects for essentially every cross-origin request immediately after
  deploy, which is loud (visibly broken login/checkout) rather than a quiet
  data-corruption risk. Costly in debugging time on a bad deploy, not a
  silent-failure risk to end users' data.
- `CUSTOMER_ACCOUNT_TOKEN_SECRET` is the sub-case that pushes this toward HIGH:
  it's validated, but lazily, per-request, in three separate files — so a bad
  deploy passes health checks and looks fine until the first buyer tries to log
  in or check order status, then 500s with no boot-time signal that anything was
  wrong. This is the one existing case in the codebase that matches the
  "silently missing env var" failure mode this plan is actually meant to close;
  it should be the leading example in the plan's problem statement, not `S3_*`
  (which was never actually silent).
- Net: MEDIUM overall — real, named in `deploy.md` as a known gap, cheap to fix,
  and the fix is almost entirely consolidation of code that already exists (five
  `requiredEnv()` copies) rather than new design work — but not HIGH across the
  board, since most of the affected vars already fail loudly, just with rough
  error messages rather than a silent, no-boot-time failure.
