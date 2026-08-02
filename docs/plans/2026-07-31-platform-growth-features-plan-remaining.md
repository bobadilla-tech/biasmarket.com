# Platform growth batch — remaining work + learnings

Companion to
[`2026-07-31-platform-growth-features-plan.md`](2026-07-31-platform-growth-features-plan.md)
(left untouched — that doc's phase numbering/design/open-questions-resolved
section is still the source of truth for scope). Only what's left + what
changed is below — full phase design for anything already shipped stays in the
original doc, not repeated here.

## Status: 14 of 15 phases shipped. Only Phase 12 (buyer accounts) remains.

Phases 4, 1, 2 shipped in an earlier session (see git history — commits
before this doc's current revision). Phases 5, 3, 6, 7, 8, 9, 10, 11, 15, 13,
14 all shipped and committed in this session, one commit per phase on
`feat/more-lots`:

- `b9f16f5` — Phase 5 (Overview/stats) + Phase 3 (account page) + Phase 6 (My
  Store resolution), combined because they landed together before the first
  checkpoint.
- `ced4c6e` — Phase 7 (Shipping tab).
- `8e1b9cf` — Phase 8 (Payments tab + decline-with-reason + the `addPayment`
  stock-decrement bug fix).
- `27389c3` — Phase 9 (Customers tab).
- `7ee4c1b` — Phase 10 (Analytics tab).
- `c5abd55` — Phase 11 (Preferences/Suggestions).
- `9a0b033` — Phase 15 (Admin Users table).
- `0ce0aa8` — Phase 13 (Featured stores + directory).
- `9cbc2af` — Phase 14 (Cross-store product search + product-detail page).

Every commit was verified with `pnpm exec tsc --noEmit` (clean) and
`pnpm exec vitest run` (green) in both `apps/web`/`apps/api`, plus
`pnpm turbo run build --filter=web` producing the expected route table, before
being committed. **Not done, any phase**: live browser/viewport verification —
no browser tool is available in this agent environment, stated explicitly
rather than claiming a mobile check that didn't happen.

**Only Phase 12 (buyer accounts: login + profile) is left.** It's explicitly
the largest/riskiest phase in the original plan — a second, parallel
authentication system, its own session/cookie handling, CSRF, and rate
limiting — sequenced last on purpose. Stopped here deliberately rather than
starting it after 14 other phases in one sitting; see "Starting Phase 12" below
for what the next session needs to know before touching it.

## A concurrent session ran into this one mid-way — what happened, for context

Partway through this session (after Phase 6, before Phase 7), a `git stash` ran
on this repo that wasn't triggered by this session — it turned out another
Claude Code session was running in parallel on the same working tree. It
stashed several in-progress uncommitted edits (the Overview page rewrite, a
sidebar edit, two i18n files) into `stash@{0}` ("WIP on feat/more-lots"), and a
second unrelated stash (`stash@{1}`) showed that same activity had also been
switching to a different branch (`feat/admin-panel`) at some point. The user
confirmed it was their other Claude Code session and asked to redo the lost
edits by hand (not pop the stash, since it also held the other session's own
in-flight work) and commit as soon as things were stable, so they could safely
resume that other session and tell it not to stash anymore.

Net effect: no work was actually lost (everything was recovered by hand,
re-verified, and committed), but **this confirms the repo is being actively
shared with another live session** at least some of the time. Every commit
from `ced4c6e` onward was staged with explicit file paths (never `git add -A`
or `git add .`) specifically to avoid sweeping up that other session's
uncommitted work into this session's commits — one exception:
`docs/plans/2026-08-02-web-app-audit-fixes-plan.md` (the other session's own
plan doc, unrelated to this batch) got swept into the `8e1b9cf` commit despite
being unstaged moments before — almost certainly a staging race from the other
session running its own `git add`/`git commit` between this session's `git
add` and `git commit` calls. Harmless (it's their own file, correctly
attributed to them in content, just not in which commit carried it), but worth
knowing: **the staging step and the commit step are not atomic against a
concurrent session touching the index** — re-check `git status` immediately
before `git commit`, not just before `git add`, if this happens again.

**If starting Phase 12 in a new session**: re-run the same baseline check this
session started with — `pnpm exec tsc --noEmit` and `pnpm exec vitest run` in
both apps — before touching anything, and don't trust this doc's file
inventory below without re-reading the actual files first. The other session
may have shipped more of its own work (or, per the incident above, may still
be active) since this was written.

## Deviations from the original plan doc, with reasons

- **Phase 8's `paymentRejectionReason` field lives on `Order`, not
  `OrderPayment`** as the original plan suggested. Reason: traced through
  `ReviewPaymentUseCase.execute()` and confirmed it flips `Order.paymentStatus`
  wholesale via `tx.order.updateMany(...)` — there is no per-`OrderPayment`
  reference anywhere in the review flow (the `PaymentProof` model exists in
  the schema with a `status`/`reviewedBy` shape that looks like it should be
  the reviewed entity, but a full-repo grep confirms it's completely dormant,
  never created or read by any code path). Putting the reason on `Order`
  matches what the code actually reviews. New migration:
  `packages/db/prisma/migrations/20260802163702_add_payment_rejection_reason/`.
- **Phase 7/8's shared row-rendering component didn't need extracting** — the
  concurrent session had already migrated `orders/page.tsx` to a
  `features/orders` slice (`OrdersTable`, `OrderStatusBadge`,
  `ConfirmTransitionDialog`, `useOptimisticStatusChange`, etc.) partway through
  this session, ahead of when Phase 7 was reached. Shipping and Payments both
  reuse those pieces directly instead of duplicating or re-extracting
  anything — see `dashboard/[slug]/shipping/page.tsx` and
  `dashboard/[slug]/payments/page.tsx`.
- **Phase 7's `GET /stores/:storeId/orders` param-shape change never
  happened** — the plan assumed the endpoint only supported single
  exact-match `paymentStatus`/`fulfillmentStatus` filters and would need a new
  IN-list param shape for Shipping's `fulfillmentStatus IN (...)` filter. By
  the time Phase 7 was reached, the concurrent session's `features/orders`
  migration had already moved all tab/status filtering to the client
  (`ordersApi.list()` fetches every order unfiltered, `matchesTab()` filters
  in JS) — so Shipping and Payments both just filter the same unfiltered
  `useOrders()` result client-side instead. No backend param change was
  needed or made.
- **`ConfirmTransitionDialog` gained an optional reason textarea** (Phase 8)
  rather than building a separate reject-with-reason dialog — it's the same
  component Shipping uses for its COMPLETED-transition confirm, now with
  `reason`/`onReasonChange`/`reasonRequired` props that no-op when omitted.
- **Phase 13's ranking/eligibility check is computed with two Prisma queries
  (one relation-filter `where`, one `groupBy`-style JS reduce over trailing
  30-day orders)**, not a single query — Prisma's relation filters
  (`products: { some: {...} }`, `owner: { banned: { not: true } }`) handle
  eligibility, then revenue/order-count ranking is computed in JS the same way
  Phase 5/10 do it. No precedent existed in this codebase for the
  `owner: { banned }` filter shape before this — added a test asserting the
  exact `where` clause since there was nothing to copy from.

## Conventions confirmed working (apply to Phase 12 and any future work)

- `features/<name>/{schemas,api,queries,mutations,components}` +
  `apps/web/test-utils/render-with-providers.tsx` (wraps
  `NextIntlClientProvider` + a fresh `QueryClientProvider` per test) is the
  standing pattern, used for every phase this session.
- Every new i18n key lives in `packages/db`-sibling `packages/i18n/{en,es}/*.json`
  — and **`packages/i18n` and `packages/utils` are both dist-based workspace
  packages** (`main`/`types` point at `dist/`, not source) — after editing any
  `packages/i18n/**/*.json` or `packages/utils/src/**`, run
  `pnpm --filter @biasmarket/i18n build` / `pnpm --filter @biasmarket/utils
  build` before `apps/web`'s typecheck will see the change. This bit twice
  this session (new i18n keys not showing up in `apps/web`'s `Messages` type
  until the dist rebuild ran).
- **`packages/db` also needs `prisma generate`** after any `schema.prisma`
  change, and Prisma 7's `prisma generate` needs a `DATABASE_URL` env var
  present (even though `generate` itself never opens a DB connection) — e.g.
  `DATABASE_URL="postgresql://ultirequiem@localhost:5432/biasmarket" pnpm
  db:generate`. Migrations in this session were hand-written
  (`migration.sql` files matching the existing naming/style convention) rather
  than run live against a database, specifically to avoid touching the
  running dev Postgres container's actual schema state from an agent session
  — `prisma migrate deploy` on the docker `api` container picks them up at
  next boot per the existing deploy convention.
- **Mocking navigation in tests**: mock `next/navigation`'s
  `useRouter`/`usePathname`/`redirect`/`permanentRedirect` — not
  `@/i18n/navigation` directly. `router.push`/`Link href` calls in a test
  arrive locale-prefixed (e.g. `push("/account")` → asserted as `/es/account`
  under the `es` locale).
- **`localStorage` in jsdom** needs `vi.stubGlobal("localStorage", <fake>)` —
  not reliably present otherwise.
- **next-intl + a dynamic (runtime-determined) message key**: when a key isn't
  known at compile time (e.g. Phase 11's suggestion `titleKey` coming from the
  backend), `useTranslations(...)`'s strict per-namespace key typing rejects a
  template-string key. Fix used: cast the `t` function itself to a plain
  `(key: string, values?: Record<string, string | number>) => string`
  signature at the point of declaration, not the individual call sites (see
  `features/suggestions/components/suggestion-card.tsx`).
- **NestJS controller unit tests need `@thallesp/nestjs-better-auth` mocked**
  whenever the controller under test has `@UseGuards(AuthGuard)`/`@Roles(...)`
  at the class or method level — otherwise `Test.createTestingModule` fails
  trying to resolve `AuthGuard`'s real constructor deps. Standing pattern
  (copy verbatim):
  ```ts
  vi.mock('@thallesp/nestjs-better-auth', () => ({
    AuthGuard: class AuthGuard {},
    Session: () => () => undefined,
    Roles: () => () => undefined, // only if the controller uses @Roles
  }));
  ```
  Used in every new controller spec this session
  (`order.controller.spec.ts`, `users.controller.spec.ts`).
- Tailwind arbitrary-value classes (`w-[76px]`) get flagged by this repo's
  editor tooling in favor of the canonical scale (`w-19`) when one resolves
  exactly.
- `authClient.useSession()` returns `isPending` alongside `data` — check it
  rather than treating `data == null` as "logged out."
- No browser/screenshot tool is available in this agent environment.
  Typecheck/vitest/`next build`'s route table are the actual extent of
  automated verification possible here — every phase this session said so
  explicitly rather than claiming a mobile check that didn't happen.
- **Public/unauthenticated cross-store endpoints** (`@Public()` decorator from
  `@thallesp/nestjs-better-auth`) all share one validation helper,
  `apps/api/src/common/public-list-query.ts` — `limit` (default 24, max 50),
  `page` (default 1, positive int), `q` (trimmed, capped at 100 chars, blank
  → `undefined`), everything else 400s. Reuse this for anything new in the
  public-discovery space rather than re-deriving the bounds per endpoint.

## Starting Phase 12 (buyer accounts) — what the next session needs

Full design is in the original plan doc's Phase 12 section — this is only the
delta/context a fresh session won't otherwise have.

- **Re-verify the concurrent-session risk is resolved** before starting —
  check `git log --oneline -5` and `git stash list`; if a stash exists that
  this doc didn't create, stop and ask before touching anything (see the
  incident writeup above).
- **This phase is exactly as scoped in the original doc, nothing shipped
  ahead of it** — no `customer-auth` module, no `CustomerSessionGuard`, no
  buyer-facing login/register/profile pages exist yet. `Customer.passwordHash`
  is still nullable and completely unused. The magic-link flow
  (`features/account`, `CustomerAccountService`,
  `apps/api/src/modules/orders/infrastructure/customer-account.controller.ts`)
  is the only buyer-identity mechanism live today, and per the plan it must
  keep working unchanged alongside whatever Phase 12 adds.
- **Session storage decision already made** (per the original plan's
  "resolved" section): stateless, HMAC-signed token/cookie following the
  existing `createCustomerAccountToken`/`verifyCustomerAccountToken`
  /`CUSTOMER_ACCOUNT_TOKEN_SECRET` pattern already used by the magic-link
  flow — not a new `CustomerSession` DB table. Read
  `apps/api/src/modules/orders/application/customer-account.service.ts` (or
  wherever that token helper actually lives now — re-check, it may have moved)
  before designing the new login-session token, since the plan wants the same
  primitive reused, not reinvented.
- **Password hashing**: the plan says to check what better-auth uses
  internally and reuse the same primitive rather than adding a second hashing
  dependency. Not yet investigated this session — first task of Phase 12
  proper.
- **Rate limiting**: the plan requires wiring up `@nestjs/throttler` on both
  the seller and buyer login endpoints if this phase ships at all — it's
  already an installed dependency per `docs/core/deploy.md`'s known-gaps list,
  just never wired in. This is not optional cleanup, it's called out as
  required alongside this phase specifically because a second password-login
  surface makes the existing "no rate limiting" gap materially worse.
- **CSRF/origin validation** on the new state-changing customer-account
  endpoints is required per the plan, and is *not* covered by the general
  "CSRF out of scope" note elsewhere in the codebase's deploy docs — that
  exemption doesn't extend to this new surface.
- **Frontend**: needs its own small session-aware header for the storefront
  (`store/[slug]/...`), separate from Phase 1's marketing navbar and separate
  from the seller dashboard sidebar — three distinct nav/session surfaces will
  exist in the app after this phase (marketing, seller dashboard, buyer
  storefront), don't conflate them.
- Given the size, consider whether this phase itself should be split into a
  backend-first checkpoint (customer-auth module + guard + endpoints, fully
  tested) before starting the frontend pages, rather than attempting the whole
  phase in one pass the way the smaller phases were done this session.
