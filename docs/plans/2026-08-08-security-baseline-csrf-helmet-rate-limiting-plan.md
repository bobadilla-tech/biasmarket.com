# Security baseline: CSRF/helmet + general rate limiting

**Status:** Pre-implementation plan (written ahead of the work, per audit
follow-up request).

**Source:** `docs/audits/audit-2026-08-08.md` §12 (important findings #3, #4),
§13 (findings #2, #4), §16 (#5, #6).

## Context

Two related, documented-but-unaddressed gaps, both already called out as known
limitations in `docs/core/deploy.md`'s "Known limitations" section: no CSRF
middleware / no `helmet` app-wide, and rate limiting that only covers auth
surfaces (`customer-auth`, `contact`, `restock` — confirmed via
`@Throttle`/`ThrottlerGuard` usage grep). The single most exposed gap is that
`checkout.controller.ts`'s order-creation endpoint is `@Public()` (no auth) and
has zero rate limiting, despite `docs/core/security-payments.md §7.4` explicitly
naming "rate limiting on order creation specifically (per IP and per buyer
account)" as the main abuse-vector mitigation for the "orders exist before
payment" design.

## Severity Classification

Ratings below are grounded in what the code actually does today, not a generic
"public endpoint = high severity" reflex — each was checked against the actual
controller/guard code and `security-payments.md §7.4` before rating (see the
per-problem sections below for the specific evidence).

- **Problem 1 — checkout rate limiting: MEDIUM.** `security-payments.md §7.4`
  names this the explicit design-known abuse vector, and it's genuinely the
  easiest endpoint in the API to hit unauthenticated (`checkout.controller.ts`'s
  `create` is `@Public()`, zero `@Throttle`). But the actual worst case, given
  no payment gateway exists yet, is **not** financial loss or fraud — it's
  spammed `PENDING_PAYMENT` orders holding stock (`§7.4`'s own framing: "prevent
  someone from spamming `PENDING_PAYMENT` orders to exhaust limited-stock
  items"). That damage is bounded and self-healing: `expire-orders.usecase.ts`'s
  cron sweep releases the soft hold via `expiresAt`, so the blast radius is
  temporary stock unavailability during a drop window, not permanent loss, data
  exposure, or money moving. That's a real availability/business-logic nuisance
  — MEDIUM, not HIGH — but it's the single most exposed, cheapest-to-close gap
  of the three, which is why it's still first in this plan's ordering.

- **Problem 2 — general rate limiting on `order.controller.ts` (`addPayment`):
  LOW.** Unlike Problem 1, this route sits behind `@UseGuards(AuthGuard)` at the
  controller level plus a per-request
  `assertOwnership(storeId, session.user.id)` check — exploiting it requires an
  already-authenticated seller session that only acts on that seller's own
  store's orders. There's no cross-tenant blast radius: a compromised or
  careless seller session hammering this endpoint can only spam file uploads and
  payment rows onto orders that seller already owns. The audit itself (`§13`
  finding 4) calls this "low likelihood, non-zero impact," which this plan
  agrees with — worth closing because it's cheap and the audit named it, not
  because it's an active threat.

- **Problem 3 — CSRF/helmet baseline: MEDIUM (mostly defense-in-depth, not an
  open hole).** `OriginGuard`'s own comment explains the team chose
  Origin/Referer checking as a minimum bar over a full CSRF-token scheme because
  the primary defense is already cookie-based: better-auth's session cookie
  defaults to `sameSite: "lax"` (confirmed in
  `better-auth/dist/cookies/index.mjs`), which already blocks the classic
  cross-site POST/PATCH CSRF attack in every modern browser — the cookie simply
  isn't sent on a cross-site state-changing request. `apps/web` fetches with
  `credentials: "include"`, so seller-dashboard routes ride the same cookie and
  get the same `SameSite=Lax` protection today, contrary to a naive read of
  "nothing else is protected." What's actually missing is defense-in-depth
  (Origin/Referer as a second check, matching the buyer-auth pattern) and
  `helmet`'s unrelated header hardening (clickjacking via `X-Frame-Options`,
  MIME-sniffing via `X-Content-Type-Options`, etc.), which has independent value
  regardless of the CSRF story. Worth doing, not urgent — there is no known
  practical bypass of `SameSite=Lax` in this app's cookie config today.

## Problem 1 — rate limit the public checkout endpoint (highest priority in this plan)

Add `@Throttle` **and** `@UseGuards(ThrottlerGuard)` to
`checkout.controller.ts`'s order-creation route — both decorators are required,
matching the existing pattern used in
`apps/api/src/modules/contact/contact.controller.ts:36-37` and
`apps/api/src/modules/restock/restock.controller.ts:18-19` (both
`{ ttl: 60_000, limit: 5 }` — pick a limit appropriate for checkout, likely
higher than 5/min since a real buyer might legitimately retry, but bounded).
`@Throttle` alone does nothing without `ThrottlerGuard` applied — there is no
global `ThrottlerGuard` (no `APP_GUARD` provider anywhere; confirmed no match
for `Throttler`/`APP_GUARD` in `app.module.ts`), so each module wires its own,
same as `contact` and `restock` do.

**Additional gap not yet in "Files likely touched" below:** unlike
`contact`/`restock`/`customer-auth`,
`apps/api/src/modules/orders/orders.module.ts` does not import `ThrottlerModule`
at all today. `contact.module.ts`, `restock.module.ts`, and
`customer-auth.module.ts` each independently call
`ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }])` in their own `imports` —
that per-module repetition is the established pattern here (not a shared global
registration), so `orders.module.ts` needs the same
`ThrottlerModule.forRoot(...)` import added before `@Throttle` will work on
either `checkout.controller.ts` or `order.controller.ts`.

Per-IP is what `@nestjs/throttler` gives by default; per-buyer-account limiting
would need a second throttle keyed off `customerId`/phone if one is present —
check whether that's easy to add with the installed throttler version
(`@nestjs/throttler@^6.5.0`, confirmed in `apps/api/package.json`) before
treating it as required, and note in this file whether it was included or
deferred.

## Problem 2 — general rate limiting on state-changing endpoints

Extend `@Throttle` + `@UseGuards(ThrottlerGuard)` coverage to the other
authenticated state-changing endpoints this audit flagged as uncovered —
specifically the payment-registration endpoint in `order.controller.ts`
(`addPayment` at line 315, currently zero rate limiting despite being a
file-upload endpoint that writes to MinIO). Confirmed by reading the full
controller: `findAll`/`findOne` (reads), `review`, `advance`, and `cancel` have
no `@Throttle` either, but `addPayment` is the one the audit named specifically
(it's the file-upload + money-mutation combination); use judgment on whether
`review`/`advance`/`cancel` need the same treatment or are low-value enough to
skip — the goal is closing the specific gap the audit named, not
blanket-throttling every route in the API, which risks breaking legitimate
dashboard usage patterns (a seller reviewing many orders in a row). If in doubt,
prefer a generous limit on a narrow set of endpoints over an aggressive limit on
everything.

**Note:** `apps/api/src/modules/orders/infrastructure/order.controller.ts` is
also being edited by two other in-flight plans
(`docs/plans/2026-08-08-orders-module-hardening-plan.md` touches `addPayment`'s
partial-payment branch at lines ~412-418;
`docs/plans/2026-08-08-payment-proof-image-access-control-plan.md` adds a new
endpoint to the same controller) — re-read the file immediately before editing,
don't assume the line numbers cited here still hold.

## Problem 3 — CSRF/helmet baseline

Add `helmet` middleware in `apps/api/src/main.ts` (standard NestJS
`app.use(helmet())` wiring, inserted before `app.enableCors(...)`). `helmet` is
confirmed **not** a dependency anywhere in the monorepo today (no match in any
`package.json`) — this is a genuinely new package, not just a new usage of an
existing one; add it to `apps/api/package.json`.

**Known conflict to plan around:** `main.ts` conditionally serves Swagger UI at
`/api/docs` (`swaggerEnabled` — on by default outside production, off in
production unless `SWAGGER_ENABLED=true`). `helmet()`'s default
`contentSecurityPolicy` will break Swagger UI's inline scripts/styles — this is
a well-documented NestJS+helmet+Swagger interaction, not specific to this
codebase. Since Swagger defaults to _on_ in dev (which is also where this plan's
own manual verification step runs), either scope/relax CSP directives for the
`/api/docs` path or disable `contentSecurityPolicy` outright
(`helmet({ contentSecurityPolicy: false })`) and rely on the production default
(Swagger off) to keep CSP meaningful where it matters. Don't discover this by
hitting a broken Swagger page after the fact.

The Verification section below flags a _different_ possible helmet conflict —
COEP/CORP breaking cross-origin image loading. That concern is likely misapplied
here: `helmet` is only being added to `apps/api` (a JSON-only API server past
the Swagger page), not to the Next.js `apps/web` process that actually renders
the HTML documents which embed product/proof images from `S3_PUBLIC_URL` (a
separate MinIO origin, confirmed via `storage.service.ts`). COEP/CORP are
enforced by the browser against the _document's own_ response headers, and that
document is served by `web`, not `api` — so headers `helmet` adds to `api`
responses shouldn't affect image loading on the storefront/dashboard pages at
all. Still worth the manual check as cheap insurance, but don't expect to find
anything there; the Swagger CSP issue above is the real, concrete conflict.

For CSRF: the buyer-auth flow already has a working minimal pattern —
`apps/api/src/modules/customer-auth/origin.guard.ts` checks `Origin`/`Referer`
against `WEB_URL`. Its own comment block explains why: the primary defense is
already the session cookie's `sameSite: "lax"` default (see Severity
Classification above), and Origin/Referer checking is a deliberately minimal
second layer, not a full CSRF-token scheme — stay consistent with that reasoning
rather than overriding it unless there's a concrete reason to.

**Generalizing `OriginGuard` is not a drop-in change — read this before assuming
the "global guard with a `@Public()` GET opt-out" framing works.** Confirmed by
reading `customer-auth.controller.ts`: every route on that controller is
`@Public()`, including the mutating ones (`register`, `login`,
`change-password`, `PATCH /me`) that `OriginGuard` currently protects.
`@Public()` here means "bypass the global better-auth `AuthGuard`" (buyers use a
separate `CustomerSessionGuard`, not better-auth) — it has no correlation with
HTTP method or whether the route mutates state. So an opt-out keyed on
"`@Public()` + GET" needs to actually mean "skip when the HTTP method is safe
(GET/HEAD/OPTIONS)," evaluated independently of the `@Public()` decorator — not
"skip all `@Public()` routes that happen to be GET," which could be misread as
also allowing an unauthenticated bypass path if a future public mutating route
doesn't get the guard. Also confirm the global guard doesn't fire on
`/api/health` or Swagger's own asset requests, which won't send
`Origin`/`Referer` and aren't buyer/seller mutations. Today `OriginGuard` is
applied per-route via explicit `@UseGuards(OriginGuard, ...)`, not globally —
converting it to a global `APP_GUARD` is a real architecture change (interacts
with the global better-auth `AuthGuard` and any future `ThrottlerGuard`
ordering), not just a call-site relocation; scope that work explicitly rather
than treating it as incidental to "add helmet."

## Files likely touched

- `apps/api/src/main.ts` (helmet + CSP scoping for Swagger)
- `apps/api/package.json` (new `helmet` dependency)
- `apps/api/src/modules/orders/orders.module.ts` (**new** — must add
  `ThrottlerModule.forRoot(...)` import; not previously present, needed by both
  Problem 1 and Problem 2)
- `apps/api/src/modules/orders/infrastructure/checkout.controller.ts`
  (Problem 1)
- `apps/api/src/modules/orders/infrastructure/order.controller.ts` (Problem 2 —
  **note:** two other concurrent plans also touch this file; re-read before
  editing)
- `apps/api/src/modules/customer-auth/origin.guard.ts` (Problem 3, if
  generalized)
- Possibly a new shared/global guard if `OriginGuard` is generalized into one,
  plus wherever it's registered as `APP_GUARD` (likely `app.module.ts`)

## Verification

- `pnpm --filter api test` + `pnpm --filter api test:e2e` locally.
- Manually verify: hammering the checkout endpoint past the new limit returns
  429, not a 500 or a silent pass-through; a legitimate single checkout still
  works; helmet headers show up on a response
  (`curl -I http://localhost:3000/api/health`).
- Confirm Swagger UI (`/api/docs`, on by default outside production) still loads
  and functions with `helmet` enabled — this is the concrete, expected conflict
  (default CSP breaks Swagger's inline scripts), not a hypothetical.
- Confirm CORS (`WEB_URL`-locked) still works correctly with `helmet` enabled,
  and that the dashboard/storefront still load cross-origin product/proof images
  from `S3_PUBLIC_URL` — low-risk given `helmet` only touches `apps/api`'s own
  JSON/Swagger responses, not the `apps/web` document that embeds those images,
  but cheap to verify rather than assume.

## Definition of done

The public checkout endpoint is rate-limited; the payment-registration endpoint
is rate-limited; `helmet` is active; a CSRF baseline exists beyond the current
buyer-auth-only `OriginGuard`, applied consistently rather than as a one-off.

## Implementation notes (2026-08-08)

- **Problem 1 (checkout throttle):** done. `orders.module.ts` now imports
  `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }])` (matching the repo's
  per-module convention); `checkout.controller.ts`'s `create` route overrides
  with `@Throttle({ default: { ttl: 60_000, limit: 10 } })` +
  `@UseGuards(ThrottlerGuard)`. Per-buyer-account throttling (keyed off
  phone/customerId, on top of the default per-IP tracker) was **deferred**:
  `@nestjs/throttler@6.5.0` supports this via a custom `getTracker()` override
  on a `ThrottlerGuard` subclass, but that's a second moving part for a problem
  rated MEDIUM specifically because the blast radius is bounded and self-healing
  (soft-hold `expiresAt` sweep) — not worth the added complexity in this pass.
- **Problem 2 (`addPayment` throttle):** done, narrowly. Only `addPayment` got
  `@Throttle({ default: { ttl: 60_000, limit: 20 } })` +
  `@UseGuards(ThrottlerGuard)`; `review`/`advance`/`cancel` were left alone per
  the plan's own guidance ("goal is closing the specific gap the audit named,
  not blanket-throttling every route").
- **Problem 3 (helmet):** done.
  `app.use(helmet({ contentSecurityPolicy:
  false }))` in `main.ts`, added
  before `setGlobalPrefix`/`enableCors`. Went with disabling CSP outright (one
  of the two options this plan named) rather than path-scoping it to skip
  `/api/docs` — simpler, and consistent with the plan's own reasoning that CSP's
  value here is mostly about the Swagger page, which is off by default in
  production.
- **Problem 3 (CSRF/`OriginGuard` generalization): deferred, scope explicitly
  cut down.** Did not convert `OriginGuard` to a global `APP_GUARD`. Reason:
  this repo's e2e suite has zero `Origin`-header coverage outside
  `customer-auth-rate-limit.e2e-spec.ts` and `customer-account-auth.e2e-spec.ts`
  — a global guard would 403 every state-changing request in ~15 other e2e spec
  files (`stores`, `products`, `orders`, `categories`, `collections`, seller
  `auth` sign-up/sign-in, etc.), none of which are in this plan's scope, and
  several of which were actively being edited by two other in-flight plans while
  this work happened. Given the Severity Classification above already rates this
  "mostly defense-in-depth, not an open hole" and explicitly says "there is no
  known practical bypass of `SameSite=Lax` in this app's cookie config today,"
  the risk/benefit of a blanket global guard didn't clear the bar for this pass.
  `OriginGuard` stays applied exactly where it was (buyer-auth mutations), which
  is already internally consistent, not a one-off within that domain. Full
  app-wide CSRF middleware is a reasonable follow-up but should be its own
  scoped plan with e2e fixture updates included, not squeezed into a
  helmet/throttler pass.
- **Verification:** `pnpm --filter api test` (unit) passes, including the
  orders-scoped suite re-run in isolation. `pnpm --filter api test:e2e` could
  not be exercised end-to-end in this environment — no local Docker/MinIO stack
  running (`S3_BUCKET`/`S3_PAYMENT_BUCKET` env vars point at a MinIO instance
  that wasn't up), and the working tree was in heavy concurrent flux from other
  in-flight plans while this was being verified. Confirmed by reading code and
  by unit tests that: `ThrottlerModule`/ `@Throttle` wiring matches the working
  `contact`/`customer-auth` pattern exactly, and
  `helmet({ contentSecurityPolicy: false })` doesn't touch any
  CORS/response-shape behavior. **Still needs a real manual pass** once
  `pnpm docker:dev` is up: hammer `POST /api/stores/:slug/checkout` past 10
  req/min and confirm 429, load `/api/docs` with helmet on, and load the
  dashboard/storefront in a browser to eyeball images/fonts.
