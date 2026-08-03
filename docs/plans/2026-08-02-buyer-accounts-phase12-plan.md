# Phase 12 — Buyer accounts (login + profile)

Standalone, self-contained plan for the one remaining phase of the platform
growth batch. The other 14 phases (navbar, account page, dashboard tabs,
admin users, discovery/search) are shipped and committed on `feat/more-lots` —
this doc does not depend on reading those; everything needed is below.

Parent docs, for context only (don't need to be read to do this work):
[`2026-07-31-platform-growth-features-plan.md`](2026-07-31-platform-growth-features-plan.md)
(original full design, Phase 12 section) and
[`2026-07-31-platform-growth-features-plan-remaining.md`](2026-07-31-platform-growth-features-plan-remaining.md)
(handoff notes from the session that shipped the other 14 phases).

## Goal

Buyers (`Customer` rows) get a real account: phone+password login, a profile
page (order history + status + account settings), and a change-password
flow — not just the existing one-time magic-link email.

## Before touching anything

1. Run baseline verification fresh — don't trust any file inventory below
   without re-checking:
   ```bash
   cd apps/web && pnpm exec tsc --noEmit && pnpm exec vitest run
   cd apps/api && pnpm exec tsc --noEmit && pnpm exec vitest run
   ```
2. Check `git log --oneline -5` and `git stash list`. **This repo has been
   actively shared with another concurrent Claude Code session at times** —
   if a stash exists that you didn't create, or files look different from
   what this doc describes, stop and ask before proceeding rather than
   guessing. When staging commits, always pass explicit file paths to
   `git add` (never `git add -A` / `git add .`) so a concurrent session's
   unrelated in-progress work never ends up in one of your commits.
3. Re-read every file this doc names before editing it — it may have moved
   or changed since this was written.

## Context: what already exists (don't rebuild these)

- **`Customer` model** (`packages/db/prisma/schema.prisma`): `id`, `storeId`,
  `phone`, `passwordHash String?` (nullable, **completely unused today** —
  this phase is what starts using it), `email`, `emailVerified Boolean`,
  `name`, `createdAt`. Unique on `(storeId, phone)` — a phone can be a
  `Customer` in multiple stores independently.
- **Magic-link flow already shipped, must keep working unchanged**:
  - `apps/api/src/modules/orders/application/customer-account.service.ts` —
    `CustomerAccountService.sendVerificationEmail`/`confirmAccount`.
  - `apps/api/src/modules/orders/infrastructure/customer-account.controller.ts`
    — the HTTP surface for it.
  - `packages/utils/src/customer-account-token/index.ts` — the token
    primitive to reuse (see "Session storage" below), full current
    implementation:
    ```ts
    import { createHmac, timingSafeEqual } from "node:crypto";
    const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    function sign(payload: string, secret: string): string {
      return createHmac("sha256", secret).update(payload).digest("base64url");
    }
    export function createCustomerAccountToken(customerId: string, secret: string): string {
      const payload = `${customerId}.${Date.now() + TOKEN_TTL_MS}`;
      const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
      return `${encodedPayload}.${sign(payload, secret)}`;
    }
    export function verifyCustomerAccountToken(token: string, secret: string): { customerId: string } | null {
      // ... HMAC-SHA256 verify + expiry check, returns { customerId } or null
    }
    ```
    Signed with `CUSTOMER_ACCOUNT_TOKEN_SECRET` env var. This is the exact
    primitive style the new login session token should follow — same file,
    new function(s), not a new mechanism.
  - `apps/web/features/account/` — the buyer-facing magic-link confirmation
    page/query (`account-confirm-view.tsx`, `use-confirm-account.ts`). Unrelated
    domain from the new login/profile pages (different feature), but review it
    for the existing visual/copy conventions for buyer-facing pages.
  - Frontend route: `apps/web/app/[locale]/(storefront)/store/[slug]/account/confirm/page.tsx`.
- **Better-auth's password hashing — reuse this directly, don't add a new
  hashing dependency.** Already resolved by inspecting the installed package
  (`better-auth@1.6.25`): import `{ hashPassword, verifyPassword }` from
  `better-auth/crypto` (a real subpath export in `better-auth`'s
  `package.json`). It delegates to `@better-auth/utils/password`, which uses
  Node's `scrypt` (or a pure-JS fallback on unsupported runtimes) — this is
  the actual primitive better-auth itself uses for seller/`User` passwords.
  Signatures: `hashPassword(password: string): Promise<string>`,
  `verifyPassword({ hash, password }): Promise<boolean>`.
- **Seller auth for comparison** (`apps/api/src/auth/auth.config.ts`) —
  better-auth's own login (`authClient.signIn.email`), for reference on shape
  only; the new customer/buyer auth is deliberately a *separate* system
  (`Customer` is not a `User`), don't try to reuse better-auth's session
  mechanism itself, only its password-hashing primitive.
- **`docs/core/deploy.md`** (or wherever the deploy runbook now lives — check)
  already documents "no rate limiting wired in despite `@nestjs/throttler`
  being installed" as a known gap. `@nestjs/throttler` is an installed
  dependency, never wired into any module.

## Backend

New `apps/api/src/modules/customer-auth/` module (flat, like `notifications`/
`stats` — no DDD-lite layering needed for this):

- `POST /stores/:slug/account/register` — sets a password for an existing
  (checkout-created) `Customer` row. **Requires a verified magic-link/OTP
  proof for that customer first** — a phone match alone is not enough to set
  credentials. The verification proof must be single-use: consume it (e.g.
  mark the underlying token/claim invalid) on successful registration, for
  every password-registration path including "set your password" reached via
  the existing confirm-account flow. Decide the exact mechanism: either reuse
  `verifyCustomerAccountToken` as the proof (the magic-link token itself,
  requiring the request to carry it) and don't allow reuse after a
  successful register, or extend the confirm flow to hand back a short-lived,
  single-use "register" grant once the magic link has been clicked. Either
  way, hash the password with `hashPassword` from `better-auth/crypto` before
  storing in `Customer.passwordHash`.
- `POST /stores/:slug/account/login` — phone + password, scoped to
  `(storeId, customerId)` per the existing `@@unique([storeId, phone])`
  constraint (a phone can be a different `Customer` per store). Verify with
  `verifyPassword` against `Customer.passwordHash`. On success, issue a
  session token — see "Session storage" below. On failure, don't leak
  whether the phone exists (generic "invalid credentials").
- **Session storage — already decided, don't re-litigate**: stateless,
  HMAC-signed cookie/token, same style as
  `createCustomerAccountToken`/`verifyCustomerAccountToken`, **not** a new
  `CustomerSession` DB table. Known, accepted tradeoff: can't be revoked
  per-session (only by rotating the shared secret for *every* customer at
  once). Mitigate the "password changed but old tokens still valid" case by
  embedding a version/timestamp derived from the password hash (or a
  `passwordChangedAt` column, add one if needed) into the signed payload, so
  a changed password invalidates previously-issued tokens without needing a
  revocation table. Deliver in an HttpOnly, Secure cookie, explicit
  `SameSite` policy, explicit expiration + renewal rule (e.g. fixed absolute
  expiry + sliding renewal only on authenticated reads, if you choose that —
  make the choice deliberately and write it down in the code comment, don't
  leave it implicit).
- `POST /stores/:slug/account/change-password` — guarded by the new session
  (see guard below). Requires current password verification before setting
  the new one.
- `GET /stores/:slug/account/me` — profile + order history for the
  authenticated customer. This becomes the primary authenticated path;
  `confirmAccount`'s magic-link view stays working for buyers who never set a
  password (don't break it).
- `PATCH /stores/:slug/account/me` — update name/email/phone. Validate all
  inputs (global `ValidationPipe({ whitelist: true, forbidNonWhitelisted:
  true })` already enforces DTO shape — add a proper DTO class, don't accept
  a bare untyped body). Enforce per-store uniqueness for phone/email where
  applicable. Require verification before committing an email or phone
  change (reuse the magic-link/verification-email primitive for this, or
  stage the change until verified) — if that verification step isn't
  implemented in the first pass, keep the corresponding frontend field
  read-only rather than silently accepting unverified changes.
- **New guard**, e.g. `CustomerSessionGuard`, parallel to but independent of
  the existing `AuthGuard` (`@thallesp/nestjs-better-auth`) — reads/verifies
  the `Customer` session cookie, attaches the authenticated `customerId`
  (and `storeId`) to the request. Don't reuse `AuthGuard`/`@Roles`/`Session`
  decorators from the seller auth library for this — it's a different
  session mechanism entirely.
- **Rate limiting — required alongside this phase, not optional cleanup.**
  Wire up `@nestjs/throttler` on both the new buyer login endpoint and the
  existing seller login endpoint (`authClient.signIn.email`'s backing
  route — check `apps/api/src/auth/` for where better-auth's email/password
  route is actually mounted, since it's likely handled inside the
  `@thallesp/nestjs-better-auth` module rather than a controller you write
  directly; if you can't attach a decorator-based throttle to it, at minimum
  apply global or route-level throttling in front of it and document why).
  A second password-login surface makes the pre-existing "no rate limiting"
  gap materially worse — this is why the original plan calls it out as
  required specifically for this phase.
- **CSRF/origin validation** on every state-changing customer-account
  endpoint (register/login/change-password/PATCH me) — the codebase's
  general "CSRF out of scope" deployment note does not exempt these new
  routes. Minimum bar: strict `Origin`/`Referer` validation on
  state-changing requests if a full CSRF-token scheme is out of scope for
  this pass — but don't skip validation entirely.
- Controller test pattern for the new guard/controllers — mock
  `@thallesp/nestjs-better-auth` only if you end up importing anything from
  it (you likely won't, since this is a separate guard); otherwise standard
  `Test.createTestingModule` + mocked service/Prisma, same shape as every
  other controller spec in this codebase (see e.g.
  `apps/api/src/modules/orders/infrastructure/order.controller.spec.ts`).

## Frontend

New pages under `apps/web/app/[locale]/(storefront)/store/[slug]/account/`:

- `login/page.tsx` — phone + password form.
- `register/page.tsx` — or fold into the existing confirm-page flow (a "set a
  password" CTA shown there once the magic link is confirmed) — the plan
  leaves this as an open implementation choice, pick whichever is less
  disruptive to the existing confirm page.
- `page.tsx` (profile) — name/email/phone (editable only if the backend PATCH
  contract above is fully implemented with verification; otherwise read-only),
  order list + status (reuse the existing order-status badge/label
  conventions from the seller dashboard's `features/orders` if useful, but
  this is buyer-facing so keep copy buyer-appropriate), change-password form.

Follow this repo's standing feature-slice convention: new
`apps/web/features/customer-auth/` (or similar name — avoid colliding with
the existing `apps/web/features/account/` which is the *different*,
magic-link-only feature) with `schemas/`, `api/` (wrapping `apiFetch`, each
call ending in `schema.parse(data)`), `queries/`/`mutations/` (TanStack
Query), `components/`. New forms use `react-hook-form` +
`@hookform/resolvers/zod`, matching `features/auth/components/login-form.tsx`
(the seller login form) as the reference implementation.

**New session-aware storefront header, separate from the other two nav
surfaces that already exist**: Phase 1 shipped a marketing-site navbar
(`components/marketing/navbar.tsx`, seller session via
`authClient.useSession()`), and the seller dashboard has its own sidebar
(`components/dashboard/store-sidebar.tsx`). This phase needs a *third*,
independent one for `store/[slug]/...` showing buyer "My Account" vs. "Log
in", driven by the new `Customer` session cookie — not `authClient`'s
seller session. Don't conflate any of the three.

## Verification bar (same as every other phase in this batch)

- `pnpm exec tsc --noEmit` clean in both `apps/web` and `apps/api`.
- `pnpm exec vitest run` green in both, including new tests for: the guard
  (valid/expired/tampered token), the login/register/change-password
  services (ownership/uniqueness/verification-required paths), and the new
  frontend forms (RHF + zod validation, submit success/error paths) using
  `apps/web/test-utils/render-with-providers.tsx`.
- `pnpm turbo run build --filter=web` succeeds, new routes appear in the
  route table.
- **No browser tool is available in this environment.** State that
  explicitly in whatever summary/handoff follows — don't claim a mobile or
  live-browser check that didn't happen.

## Suggested internal sequencing (this phase is large enough to checkpoint)

1. Backend: `customer-auth` module skeleton, password hash/verify wiring,
   `CustomerSessionGuard`, register/login/change-password endpoints + tests.
   Commit.
2. Backend: profile `GET`/`PATCH` `.../account/me` + tests. Commit.
3. Backend: rate limiting on both login surfaces + CSRF/origin validation.
   Commit (this is required for the phase to be considered done, not a
   follow-up).
4. Frontend: `features/customer-auth` slice + login/register pages. Commit.
5. Frontend: profile page + session-aware storefront header. Commit.

Re-run the full verification bar before each commit, not just once at the
end — this repo has shown it can change under you mid-session.

## Shipped (2026-08-02)

All 5 steps landed on `feat/more-lots`, one commit each, in the order
above:

1. `20bbf71` — `customer-auth` module skeleton: `CustomerSessionGuard`,
   register/login/change-password, session token functions added to
   `@biasmarket/utils/customer-account-token` (same file, per the plan).
2. `86f6573` — `GET`/`PATCH .../account/me`.
3. `a69f7ba` — `OriginGuard` (Origin/Referer same-origin check) on every
   state-changing route, `@nestjs/throttler` on buyer register/login,
   better-auth's native `rateLimit` turned on for the seller's own
   sign-in/sign-up/change-password (its built-in default rule already
   covers those paths at 3 req/10s once enabled — no `customRules` needed).
4. `4ac65b2` — `features/customer-auth` frontend slice, `/store/[slug]/
   account/login` page, registration folded into the existing confirm page
   (`SetPasswordForm` in `AccountConfirmView`) rather than a separate
   `/register` route.
5. `fa647f0` — `/store/[slug]/account` profile page, `AccountNavLink`
   header widget wired into `store/[slug]/layout.tsx`.

### Decisions made while implementing (not fully pinned down in the plan)

- **Session token "version"**: instead of adding a `passwordChangedAt`
  column, the session token embeds a hash-derived fingerprint of
  `Customer.passwordHash` itself (`derivePasswordVersion` in
  `customer-auth.service.ts`) — changing the password changes the hash,
  which naturally invalidates old tokens with no schema migration needed.
- **Register single-use enforcement**: the magic-link token is the
  "verified proof," reused as-is (not consumed/marked invalid). Single-use
  for registration specifically comes from rejecting the call once
  `Customer.passwordHash` is already set — simpler than adding a
  single-use grant table, but means the same magic-link token can still be
  replayed for *other* purposes (e.g. `confirmAccount`) within its 30-day
  TTL. Accepted as consistent with the existing magic-link flow's own
  security model.
- **Session renewal**: fixed 7-day token TTL, but `CustomerSessionGuard`
  reissues a fresh cookie on every authenticated request (sliding renewal)
  — an active session never expires mid-use; idle ones expire 7 days after
  last use.
- **PATCH `.../account/me`**: `name` only. Email/phone changes need a
  verification step not built in this pass — left out of the DTO entirely
  (not silently accepted), and the frontend profile page shows all three
  fields read-only rather than a partial edit UI.
- **Logout endpoint**: `POST .../account/logout` — not in the original
  plan, added in step 5 because the header widget needs a way to sign out
  and the session cookie is HttpOnly (frontend can't clear it directly).
  Public, unguarded — logging out an already-invalid session is a harmless
  no-op.
- **Rate limiting on the seller's own login**: `@nestjs/throttler` can't
  reach it — `@thallesp/nestjs-better-auth` mounts its handler via
  `httpAdapter.use()` inside its own `onModuleInit`, as raw Express
  middleware ahead of Nest's router, so no Nest guard (global or
  route-level) ever sees those requests. Used better-auth's own native
  `rateLimit` config instead (`auth.config.ts`), which runs inside its
  request handling and is guaranteed to apply.
- **Header placement**: `AccountNavLink` is a small fixed-position pill
  (top-right), mirroring the existing `CartLink`'s fixed-position
  convention, rather than a full nav bar layout change across every
  storefront page — lower risk with no browser tool available to visually
  verify a bigger layout change.

### Known gaps / follow-ups for whoever picks this up next

- A customer revisiting an old magic-link confirmation URL after already
  setting a password still sees the "set a password" CTA on the confirm
  page; submitting it surfaces the backend's "already registered" error
  instead of the CTA being hidden upfront. The confirm-account response
  doesn't currently expose whether a password is already set — fixing this
  cleanly means either adding a field to that response or querying session
  state separately on that page.
- No email/phone change flow (verification-gated) — see PATCH decision
  above.
- No "forgot password" flow for a buyer who set a password and lost it —
  only the original magic-link path exists as a recovery mechanism (it
  still works, since `confirmAccount` was kept unchanged), but there's no
  direct "reset password" entry point from the login page.
- **No browser/live check was possible in this environment** — every step
  was verified via `tsc --noEmit`, `vitest run`, and `pnpm turbo run build
  --filter=web` (confirms the new routes appear in the build's route
  table), never in an actual browser. Visual/interaction QA (styling,
  responsive layout, the fixed-position header pill not overlapping page
  content on smaller viewports, real end-to-end login/register/logout
  flows against a running API) is still outstanding.
- This repo was actively shared with another concurrent Claude Code
  session throughout this work. An automated commit unrelated to this
  session (`3b6880`, `"tweaks: session limit"`) swept up this session's
  then-in-progress `customer-auth` files alongside a large batch of the
  other session's work (admin/checkout/collections/sections/contact
  features) partway through step 5. Nothing was lost or corrupted — verify
  this yourself with `git log --oneline` and `git show --stat 3b6880` if
  anything looks unfamiliar before building further on this branch.
