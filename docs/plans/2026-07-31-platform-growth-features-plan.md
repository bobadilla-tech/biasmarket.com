# Platform growth batch: navbar, onboarding fix, store dashboard buildout, buyer accounts, discovery, admin users

## Status

**Pre-implementation plan**, written before any code lands — deviates from this
directory's normal "record after the work lands" convention at the requester's
explicit direction, because the batch spans 15 semi-independent phases and
needs review before work starts. Reviewed by three independent subagents
(backend feasibility, frontend/mobile feasibility, product-scope/consistency)
against the actual codebase; their findings are folded in inline throughout,
marked "**Correction from plan review**" or as new open questions. Convert to
a normal changelog-style doc (or split into per-feature changelog entries)
once each phase actually ships.

## Context

Bias Market's storefront/dashboard shipped incrementally (see the other `2026-07-*`
plans in this directory) and several gaps have accumulated that now block the
next round of growth work:

- The landing page has no navbar and both its CTAs point at signup regardless
  of session state — no way to distinguish a first-time visitor from a
  returning logged-in seller.
- Every login unconditionally redirects to `/onboarding/create-store`
  (`apps/web/app/[locale]/(onboarding)/login/page.tsx`), even for a seller who
  already owns a store — onboarding was built as if it were the permanent
  post-login landing page instead of a one-time first-store setup flow.
- The store dashboard sidebar (`apps/web/components/dashboard/store-sidebar.tsx`)
  advertises seven nav items that don't exist yet (overview, storefront,
  shipping, payments, customers, analytics, "ideas") — visible "Soon" rows with
  no page behind them.
- `Customer` (buyer) accounts exist as a data model and get an emailed
  magic-link at checkout (`2026-07-31-buyer-accounts-email-confirmation.md`),
  but there is no buyer login, no profile page, no persistent session — the
  magic link is explicitly a stopgap per that plan's own "out of scope" note.
- There is no cross-store discovery surface at all: no store directory, no
  product search, no "featured stores" on the landing page. A customer has to
  already know a store's exact slug/URL.
- `/admin` has a disabled "Users" placeholder with zero backend support
  (`UsersController`/`UsersService` are empty stubs).

Requester's stated priorities, in the requester's own words, condensed:

1. Navbar + SaaS-like landing page, session-aware sign-up/"My Account" CTA.
2. Login should skip onboarding for returning sellers who already have a
   store; onboarding is a first-store-only flow. New personal account page
   with per-store stats. **Optimize for the single-store seller** — that's
   the overwhelming majority of the user base today.
3. Store dashboard: build out Overview (stats), resolve what "My Store" is
   supposed to be (implement or delete), Shipping (in-progress fulfillment
   tracking), Payments (approve/reject/partial-payment tracking, with a
   decline reason for fraudulent proof), Customers (list + purchase history +
   actions), Analytics (growth stats). Preferences/"suggestions": implement
   with real data (**no AI integrations**) or drop.
4. Store dashboard sidebar should collapse like the admin one — **without**
   regressing the mobile experience, which the requester called out as
   already working well.
5. Buyer-facing "my profile": order history + status + account settings
   (password change, etc.) — buyers need an actual account, not just a
   magic-link view. **Confirmed in scope for this batch** (Phase 12) — it's
   still the batch's largest/riskiest phase and sequenced last, but that's
   ordering, not a scope cut.
6. Landing page should promote best-selling stores (needs a ranking
   mechanism) and a cross-store product search/index, plus a store index/
   directory.
7. Admin: real Users table (`/admin/users` is currently a disabled
   placeholder).
8. Everything must work well on mobile — most users are on mobile.

## Cross-cutting ground rules for every phase

- **Mobile-first.** Every new page gets built and manually checked at a
  ~375–390px viewport before being called done, matching the existing
  storefront/dashboard convention. This is called out per-phase below where
  the risk is non-obvious (mainly Phase 4, the sidebar).
- **`web` never talks to Postgres directly** — every new stat/list/search
  surface is a new `api` endpoint, consumed over HTTP, per `CLAUDE.md`.
- **Every store-scoped query filters by `storeId` and re-verifies ownership**
  via the existing `assertOwnership`/`findOwnedProduct`-style pattern
  (`products.service.ts`) — no new endpoint gets a pass on this.
- **No AI integrations anywhere in this batch** (explicit requester
  constraint) — "suggestions" in Phase 11 means rule-based heuristics over
  real store data, nothing generative.
- Money stays `Decimal`, never `Float`, in any new aggregation.
- No new tenant-resolution middleware is introduced — this batch keeps the
  current per-service `assertOwnership` pattern (`docs/core/architecture.md`'s
  `TenantMiddleware` design stays aspirational, unchanged from today).
- **Public, cross-store, read-only catalog endpoints are not a violation of
  the storeId-filtering rule.** Phases 13/14 add the first endpoints that
  intentionally span every store at once (`/stores/featured`,
  `/stores/directory`, `/products/search`). `CLAUDE.md`'s "every query
  touching tenant data filters by `storeId`" rule targets owned, mutable
  tenant data reached through an authenticated owner check — it's the same
  category the existing public `findPublicBySlug`/`findCategoriesPublic`
  store endpoints already sit in, not a new exception. Stated once here so
  Phases 13/14 don't need to re-justify it individually.

## Phase ordering and dependency graph

```
Phase 1 (navbar + session-aware landing)          — independent
Phase 2 (login/onboarding redirect fix)            — independent for the redirect logic itself;
                                                       its "single store → dashboard" destination
                                                       only becomes the real Overview page once
                                                       Phase 5 also ships (until then it lands on
                                                       Phase 5's not-yet-built page, which still
                                                       redirect-chains to Settings — degrades
                                                       gracefully, not broken, just not final UX)
Phase 3 (personal account page)                    — depends on Phase 2 + Phase 5's stats endpoint
Phase 4 (store dashboard sidebar collapse)         — independent, do early since every later
                                                       dashboard phase touches nav items
Phase 5 (Overview / stats)                         — foundational stats endpoint, reused by
                                                       Phase 3 (account page), Phase 10 (analytics),
                                                       Phase 11 (suggestions)
Phase 6 ("My Store" resolution)                    — independent, small
Phase 7 (Shipping tab)                              — depends on nothing new, reuses existing
                                                       fulfillment code
Phase 8 (Payments tab + decline reason)             — touches payment domain, do carefully;
                                                       fixes a real correctness bug found in research
Phase 9 (Customers tab)                             — independent
Phase 10 (Analytics tab)                            — depends on Phase 5's stats groundwork
                                                       AND Phase 9's per-customer query (used for
                                                       the new-vs-returning split)
Phase 11 (Preferences/Suggestions)                  — depends on Phase 5 + 9 + 7 for source data
Phase 12 (Buyer accounts: login + profile)          — independent but largest/highest-risk;
                                                       confirmed in scope, sequenced last
Phase 13 (Best-selling stores + store index)        — depends on Phase 5's revenue aggregation;
                                                       also depends on Phase 15 shipping first if
                                                       banned sellers must be excluded from launch
                                                       (see Phase 13's banned-seller note)
Phase 14 (Cross-store product search)               — independent of 13, similar shape; same
                                                       banned-seller dependency on Phase 15
Phase 15 (Admin Users table)                        — independent, smallest
```

Recommended execution order: 4, 1, 2, 5, 3, 6, 7, 8, 9, 10, 11, 15, 13, 14, 12
— cheapest/independent first, sidebar collapse early so later phases add nav
items to the final shape once, Phase 15 moved ahead of 13/14 so the
banned-seller filter those two need already exists, buyer accounts (12) last
since it's the riskiest and most novel subsystem.

---

## Phase 1 — Navbar + session-aware landing page

**Goal**: landing page reads like a SaaS marketing site, with a real navbar,
and its CTA reflects whether the visitor is signed in.

**Frontend**:
- New `apps/web/components/marketing/navbar.tsx`: logo, links to
  Founder/Enterprise/Contact (existing pages), `LanguageToggle`
  (already exists, currently lives inside `hero.tsx` — move it up into the new
  navbar), and a session-aware CTA slot.
- Session-aware CTA: call `authClient.useSession()` (same client already used
  in `store-sidebar.tsx`/`app-sidebar.tsx`, from `apps/web/lib/auth-client.ts`).
  - No session → "Sign up" button → `/onboarding`, plus a smaller "Log in"
    link → `/login` (today there is no login link anywhere on the marketing
    site except two clicks deep inside the onboarding form — add a direct one).
  - Session present → single "My Account" button → `/account` (the new page
    from Phase 3).
- **Correction from plan review**: no `(marketing)` route group exists today
  — `contact/`, `enterprise/`, `founder/` sit directly under
  `apps/web/app/[locale]/`, and the landing page is the true root
  `apps/web/app/[locale]/page.tsx`; each of the four pages independently
  renders its own `<Footer />` with no shared layout at all. The only
  existing layout, `apps/web/app/[locale]/layout.tsx`, wraps *every* route
  including dashboard/onboarding/storefront — dropping `<Navbar />` there
  would incorrectly show the marketing navbar on checkout/dashboard pages
  too, so that's not a usable shortcut. This phase needs to actually
  **create** a `(marketing)` route group — physically move `page.tsx`,
  `contact/`, `enterprise/`, `founder/` into a new group directory with its
  own `layout.tsx` mounting `<Navbar />` — a real (if mechanical) file-move
  restructuring, not just "add one component."
- `hero.tsx`'s existing inline `<nav>` (logo + language toggle only) gets
  replaced by the shared navbar — delete the duplicate, don't keep both.
- Visual pass on `hero.tsx`/`solution.tsx`/`features.tsx` etc. to read more
  like a product marketing page (spacing, section rhythm) — this is a design
  polish item, not a functional change; no new components required unless the
  design review turns up a real gap.

**Backend**: none.

**Mobile**: navbar needs a mobile menu (hamburger → sheet or simple stacked
links) since the existing shadcn `Sheet` component is already in the repo
(`components/ui/sheet.tsx`) — reuse it rather than building a new overlay
primitive.

**Explicit decision**: keep `LanguageToggle` in the navbar (not duplicated in
the footer) — matches its one existing usage today.

---

## Phase 2 — Fix the login/onboarding redirect

**Goal**: onboarding is a first-store-setup flow, not a permanent post-login
landing page.

**Problem confirmed in research**: `login/page.tsx`'s `handleLogin` and
`onboarding/page.tsx`'s `handleSignup` both unconditionally
`router.push("/onboarding/create-store")` (admin excepted). The "does this
user already have a store" check only happens *inside*
`create-store/page.tsx`, after the wrong redirect already fired, via
`GET /me/stores`.

**Frontend changes**:
- `login/page.tsx`: after a successful login (non-admin), call
  `GET /me/stores` before deciding where to go:
  - `stores.length === 0` → `/onboarding/create-store` (first-time setup,
    unchanged).
  - `stores.length === 1` → straight to that store's dashboard
    (`/dashboard/{slug}` → now a real Overview page per Phase 5, not the old
    settings-redirect).
  - `stores.length > 1` → `/account` (Phase 3's personal account page, since
    there's no single obvious store to land on).
- `onboarding/page.tsx` (signup): a brand-new signup always has 0 stores, so
  its redirect to `/onboarding/create-store` stays unconditional — no change
  needed there beyond confirming that invariant holds.
- `create-store/page.tsx`: keep as-is functionally (still lists existing
  stores + create form) — it remains reachable directly (e.g. "add another
  store" from the account page later), just no longer the forced landing spot
  for every login.

**Backend**: none — `GET /me/stores` already exists and returns exactly what's
needed (`stores.controller.ts`/`my-stores.controller.ts`). Separately (not
part of the redirect fix itself — call this out as its own one-line diff/
changelog note so Phase 2's actual scope stays 1:1 with the requested
behavior change): a duplicate route was found during research
(`/me/stores` and `/stores/me/stores` both resolve to the same
`findAllForUser`, confirmed live in `stores.module.ts`) — worth deleting the
redundant one (`stores.controller.ts`'s copy) while in this file, as an
unrelated small cleanup, not because the redirect fix requires it.

**Mobile**: no new UI, just redirect logic — no mobile-specific concern.

---

## Phase 3 — Personal account page

**Goal**: a seller-facing "My Account" page, optimized for the single-store
case per the requester's stated priority, that still scales to multiple
stores.

**Frontend**: new route
`apps/web/app/[locale]/(dashboard)/account/page.tsx`:
- Fetches `GET /me/stores` (existing) plus, per store, the Phase 5 overview
  stats endpoint.
- **Single-store case (primary)**: render the one store's key stats directly
  on this page (revenue, order count, pending-payment count — same shape as
  the store's own Overview) with a prominent "Go to dashboard" action. Don't
  make the single-store seller click through an extra list page to see
  anything.
- **Multi-store case**: a card per store, each showing the same compact stat
  set, linking into that store's dashboard.
- Account-level actions: name/email display, "change password" (existing
  better-auth flow — confirm what UI, if any, already exists for this on the
  `User` side; if none, add a minimal form calling better-auth's
  `changePassword` client method), sign out.
- This page is reached from: Phase 1's navbar "My Account" CTA, Phase 2's
  post-login redirect for the multi-store case, and a new link from inside
  the store dashboard sidebar footer (currently just shows name/email/sign-out
  — add a "My Account" link there too).

**Backend**: none beyond Phase 5's stats endpoint (reused, not duplicated).

**Mobile**: single-column stacked cards; this is a straightforward responsive
page, no special risk.

---

## Phase 4 — Store dashboard sidebar: collapsible, mobile-safe

**Goal**: collapsible sidebar like `/admin`'s, without touching the mobile
behavior the requester specifically flagged as already working well.

**Current state recap**: `StoreSidebar` is a hand-rolled `<aside>` (not
shadcn `Sidebar` primitives), rendered directly on desktop
(`hidden lg:flex`) and reused verbatim inside a `Sheet` via `MobileSidebar` on
mobile — one component, two contexts, no collapse state today.
`AppSidebar` (admin) *does* use shadcn's `Sidebar`/`SidebarProvider` with real
icon-collapse behavior.

**Explicit decision (flagging the tradeoff, not just picking silently)**:
**do not** migrate `StoreSidebar` onto shadcn's `Sidebar` primitives in this
pass. A full migration would touch the exact component `MobileSidebar` embeds
inside its `Sheet`, and the requester explicitly called out that the mobile
sidebar works well today and shouldn't regress — the safer change is additive:
add a desktop-only collapsed/expanded state local to `StoreSidebar` (icon-only
rail when collapsed, same as the visual effect of the admin sidebar), persisted
in `localStorage`.

**Correction from plan review**: `StoreSidebar` is rendered from exactly two
call sites today with no differentiating prop —
`store-theme-frame.tsx:48` (`<StoreSidebar slug={slug} store={store} />`,
desktop, `hidden lg:flex` wrapper) and `mobile-sidebar.tsx:30` (the identical
call, inside the `Sheet`). Since it's the *same component instance shape*
rendered in both places, a `collapsed` flag read from `localStorage` inside
`StoreSidebar` itself would apply to both render sites — there is nothing
today that would keep the mobile `Sheet` expanded while the desktop rail
collapses. Forcing "always expanded in the sheet" therefore **requires**
threading an explicit prop in from the caller — `MobileSidebar` must pass
something like `forceExpanded` (or `variant="mobile"`) into `StoreSidebar`,
and `StoreSidebar` must only read/apply its `localStorage`-persisted
`collapsed` state when that prop is absent/false. This means
**`mobile-sidebar.tsx:30` is edited** (one added prop on its existing call),
even though the collapse *state and toggle button* still live only in
`StoreSidebar` and `store-theme-frame.tsx` stays untouched.

Reassess a full shadcn-`Sidebar` migration as a separate future change, once
there's a reason to (e.g. wanting the built-in keyboard shortcut or the
tooltip-on-hover-when-collapsed behavior) — out of scope here.

**Frontend changes**:
- `store-sidebar.tsx`: add `collapsed` state (`useState` + `localStorage`
  read/write), a `forceExpanded?: boolean` prop that short-circuits the
  collapsed rendering path entirely when true, a collapse/expand toggle
  button (chevron icon, same visual language as admin's `SidebarTrigger`,
  hidden when `forceExpanded`), and conditional rendering — icon-only rows
  when collapsed (icons already exist per nav item), full label+icon rows
  when expanded or `forceExpanded`. Section headers (`SidebarSection`'s group
  labels) hide when collapsed.
- `mobile-sidebar.tsx:30`: pass `forceExpanded` into its `<StoreSidebar />`
  call — the one required edit outside `store-sidebar.tsx` itself.
- `store-theme-frame.tsx`: no structural change — still `hidden lg:flex`
  wrapping the (now collapsible) `StoreSidebar`, still `lg:hidden` wrapping
  `MobileSidebar`.
- Fix the pre-existing orphaned-nav gap while the item list is already being
  edited in this phase: `collections/page.tsx` and `sections/page.tsx` are
  real, shipped features with no `StoreSidebar` entry today (only reachable
  by typing the URL, via the separate, partially-broken `dashboard-nav.tsx`
  sub-nav which also links to a nonexistent `categories/` route — that dead
  link should be dropped too). Add `collections` and `sections` as real
  `href`s in `StoreSidebar`'s item list alongside the placeholder-to-real
  conversions for Overview/Shipping/Payments/Customers/Analytics/Preferences
  as those phases land — tracked per-phase below, not duplicated here.

**Backend**: none.

**Mobile verification (required, not optional)**: after this change, manually
check the dashboard at a 375–390px viewport — hamburger opens the `Sheet`,
full sidebar renders inside it (not the collapsed icon rail), all nav items
clickable, sheet closes on navigation. In addition, add one automated
component test asserting the actual invariant this phase relies on:
`MobileSidebar` renders `StoreSidebar` fully expanded even when
`localStorage` holds a collapsed value — a manual viewport check alone
doesn't pin this down against a future regression. This is the regression
the requester is worried about; treat both checks as a hard verification
gate before calling Phase 4 done.

---

## Phase 5 — Overview tab (stats foundation)

**Goal**: `/dashboard/[slug]` becomes a real stats overview instead of a bare
redirect to Settings, and exposes a reusable stats endpoint other phases
(account page, analytics, suggestions) build on.

**Backend**: new endpoint, `GET /stores/:storeId/stats/overview`
(owner-auth-gated, same `assertOwnership` pattern as `products.service.ts`).
New module `apps/api/src/modules/stats/` (flat CRUD-style module per
`CLAUDE.md`'s guidance — this is a read-only aggregation service, not a
domain worth DDD-lite layering). Computes, scoped to `storeId`:
- Revenue: `sum(OrderPayment.amount)` for orders with `paymentStatus =
  VERIFIED`, matching the *semantics* `order.repository.ts`'s
  `withPaymentSummary()` already uses for a single order's `paidAmount` — note
  that method is a `private` instance method that sums one already-hydrated
  order's `payments` array in JS, so it can't literally be imported/called
  from a new `stats` module; this needs a genuine new store-wide Prisma
  aggregate (`orderPayment.aggregate`/`groupBy` joined through
  `Order.paymentStatus`), just computed the same way, so the two numbers
  never disagree.
- Order counts bucketed by **all six** `PaymentStatus` values
  (`PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAYMENT_SUBMITTED`, `VERIFIED`,
  `REJECTED`, `CANCELLED`) and all four `FulfillmentStatus` values — omitting
  any bucket means the counts won't sum to the total order count, which reads
  as a bug on a stats page even if it's just an intentionally-folded state.
- Low-stock/out-of-stock count (reuse `notifications.service.ts`'s existing
  unread-count query shape, scoped the same way).
- Recent orders (last 5–10, same shape as `orders/page.tsx` already renders).

**Frontend**: `dashboard/[slug]/page.tsx` stops being a bare
`redirect(...)` to `settings` — becomes a real page rendering stat tiles +
recent-orders list, using the new endpoint. Add `overview` as a real `href`
in `StoreSidebar`'s item list (currently a disabled placeholder).

**Mobile**: stat tiles in a responsive grid (1 column mobile → 2–3 desktop),
same pattern as `products/page.tsx`'s existing responsive grid usage.

---

## Phase 6 — Resolve "My Store"

**Goal**: the sidebar's disabled "storefront" placeholder is ambiguous today
— resolve it rather than leave it as permanent dead weight.

**Decision**: the existing `settings/page.tsx` mega-page (profile / appearance
/ payments-config / delivery-config / defaults / notification-prefs sections)
**is** "My Store" in substance already — it's reachable today via the
`settings` nav item, just not labeled that way. Rather than build a second,
redundant page:
- Relabel the sidebar's real `settings` item to "My Store" (i18n key change
  only) if that phrasing is preferred, **or** leave the label as "Settings"
  and just delete the separate disabled `storefront` placeholder row — either
  is a one-line sidebar change. Recommend: **delete the placeholder row**,
  keep "Settings" as the label (it's accurate — payment/delivery/theme
  config is settings, not a preview), and instead give the sidebar's
  primary "Store" section a lightweight **"View store" external-link button**
  (opens the public storefront URL, `/store/{slug}`, in a new tab) somewhere
  visible (e.g. next to the store name at the top of the sidebar) — that's
  the one genuinely missing capability (quickly previewing your live site from
  the dashboard), without inventing a whole new settings-duplicate page.

**Frontend**: `store-sidebar.tsx` — remove the disabled `storefront` item,
add a small "View store ↗" link/button near the store name header, pointing
at the public storefront route.

**Backend**: none.

**Mobile**: trivial, single link.

---

## Phase 7 — Shipping tab

**Goal**: a dedicated view of orders actively being fulfilled, so a seller can
see shipping status at a glance without wading through payment-review noise.

**Current state**: `orders/page.tsx` already does both payment review *and*
fulfillment advancement in one page, tabbed by a combined
payment+fulfillment filter (`pending`/`transit`/`delivered`).

**Decision**: split by concern rather than duplicating the whole orders page.
`orders/page.tsx` keeps ownership of payment-status-driven views (this
becomes Phase 8's home). New `dashboard/[slug]/shipping/page.tsx` shows only
orders where `paymentStatus = VERIFIED` (money already confirmed) filtered by
`fulfillmentStatus IN (ORDERING, IN_TRANSIT, READY)` — i.e., money's settled,
package is moving — with the existing `advance-fulfillment.usecase.ts`
action to move a card to the next state. `COMPLETED` orders drop off this
view (visible in Phase 9/10 history views instead, not duplicated here).

**Backend**: no new use-case — `advance-fulfillment.usecase.ts` and its
controller route already do exactly this transition. `GET
/stores/:storeId/orders` (`order.controller.ts:37-46`,
`order.repository.ts:56-60`) currently only accepts a single exact-match
`paymentStatus`/`fulfillmentStatus` value each — confirmed it does **not**
support an IN-list, so a `fulfillmentStatus IN (ORDERING, IN_TRANSIT, READY)`
filter needs a real, new param shape (e.g. accept a comma-separated list or
repeat the query key) added to the existing endpoint, rather than a whole new
one — this is a required change for this phase, not a maybe.

**Frontend**: **correction from plan review** — `orders/page.tsx` does not
have a responsive card layout to reuse. It renders a plain `<table>` (8
columns: number/customer/product/total/delivery/date/status/actions) inside
a `Card` with `overflow-x-auto`, no breakpoint-gated card/list alternate
(confirmed no `hidden md:`/`sm:hidden` split anywhere in the file; its only
`Sheet` usage is the review-approval modal, not a mobile list view).
Reusing this as-is for Shipping means an 8-column horizontally-scrolling
table on a 375px screen — acceptable as a stopgap (it's the existing
behavior on `orders/page.tsx` already, not a new regression), but don't
carry it forward silently: either accept the horizontal-scroll table for v1
and note it as a known mobile-ergonomics gap, or design a stacked-card
fallback below a breakpoint as part of extracting the shared row-rendering
component for this phase. Extract the shared row/card rendering out of
`orders/page.tsx` into its own component either way, since Shipping and
Phase 8's Payments page both need it and it isn't factored out today.
Add `shipping` as a real `href` in `StoreSidebar`.

**Mobile**: see correction above — this is not pre-verified low-risk
territory; treat the horizontal-scroll-table-on-mobile question as a real
design decision for this phase, not an inherited freebie.

---

## Phase 8 — Payments tab (tracking, partial-payment requests, decline reason)

**Goal**: a dedicated payments view — track status, prompt for the remainder
on a partial payment, and decline with a reason when proof is fraudulent.

**Correctness bug found during research — fix as part of this phase**:
`OrderController.addPayment` (`infrastructure/order.controller.ts:58-123`)
computes `nextStatus = 'VERIFIED'` directly once `paidAmount >=
requiredAmount`, bypassing `order-status.vo.ts`'s transition guard and
`ReviewPaymentUseCase.execute()`/`entity.approvePayment()` entirely. That
means a payment that reaches 100% via the partial-payment path marks the order
`VERIFIED` **without ever decrementing real `stock`** (only
`review-payment.usecase.ts`'s approve branch does that decrement) — the
soft-hold (`reserved`) is never converted, leaving inventory in an
inconsistent state (stock reserved forever, never actually sold down). Fix:
route `addPayment`'s VERIFIED transition through the same domain guard/stock
decrement `review-payment.usecase.ts` uses, or call
`ReviewPaymentUseCase.execute(orderId, storeId, userId, 'approve')` directly
once the running total reaches `requiredAmount`, instead of hand-rolling the
status write in the controller. This needs its own focused test coverage
(`review-payment.usecase.spec.ts`/`order.controller.spec.ts` equivalent) —
treat as a bug fix, not a side effect of the UI work.

**Decline-with-reason** (new): requester wants to decline a payment (e.g. a
faked Yape screenshot) with a stated reason.
- **Schema**: add `paymentRejectionReason String?` to `Order`
  (`packages/db/prisma/schema.prisma`) — new migration. Set it when
  `ReviewPaymentUseCase.execute(..., 'reject', reason)` runs; `null` for the
  approve path.
- **Backend**: `ReviewPaymentUseCase.execute` gains an optional `reason`
  param; `review-payment.controller` route (wherever the review endpoint is
  wired — confirm exact file, likely `order.controller.ts` or a dedicated
  review controller) accepts it in the request body, validated
  (`whitelist`/`forbidNonWhitelisted` per global `ValidationPipe` — add a DTO
  field, not a bare untyped body). Include the reason in the buyer-facing
  rejection email (`buildPaymentStatusEmailHtml`, already escaped via
  `escapeHtml` per the prior review-fixes plan — apply the same escaping to
  the new free-text reason field, since it's seller-authored and reaches
  buyer-facing HTML).
- **Frontend**: the existing reject action (in `orders/page.tsx`'s review
  sheet, or the new Payments page if the review UI moves there) gains a
  required reason text field before the reject button is enabled.

**Request-more-payment — two different things the requester's phrasing could
mean, not yet resolved; see open questions**: re-reading "know when to
request for more (eg partial payments)... egg add extra % of partial
payment" turns up a more literal reading than a UI nudge. `PaymentMethodConfig`
(`schema.prisma`) already has `depositPercentPickup`/`depositPercentCourier`
columns (`Int @default(100)`) — a **per-store, per-delivery-method deposit
percentage** spec'd in `docs/core/product.md` §5.4 ("Set a deposit rule, as a
percentage e.g. 30%") but completely unwired: zero reads/writes anywhere in
`apps/api`/`apps/web` today, and `create-order.usecase.ts:155` always sets
`requiredAmount: finalAmount` (100%, full payment only). "Add extra % of
partial payment" plausibly means **finally exposing that dormant
seller-configurable deposit setting** in the Settings/payments-config UI so a
seller can require e.g. 30% up front instead of 100% — a materially different,
currently-nonexistent feature — not just a message asking a buyer to pay the
rest of what checkout already required. These aren't mutually exclusive
(both could ship), but they're different amounts of work and different
surfaces. Until resolved:
- **The cheap version (definitely worth building regardless)**: on an order
  sitting at `PARTIALLY_PAID`, show the exact `pendingAmount`/`paidPercentage`
  (already derived correctly by `OrderRepository.withPaymentSummary()`) and a
  "Request remaining balance" action that opens a WhatsApp deep link asking
  for the remainder. **Correction from plan review**: the existing
  `buildWhatsAppOrderMessage` helper (`packages/utils/src/whatsapp/index.ts`)
  is hardcoded to the buyer-facing "new order" checkout message and can't
  produce a seller→buyer balance-request message — only the generic
  `buildWhatsAppUrl(phone, text)` half is reusable; a new message-builder
  function is needed. Also note `apps/web` has zero existing references to
  `@biasmarket/utils/whatsapp` (checkout only ever receives a pre-built URL
  string from the backend) — this would be the first client-side use of that
  package, not literal reuse of "the same helper already used at checkout."
- **The deeper version**: wire up `depositPercentPickup`/`depositPercentCourier`
  end to end — expose the percentage as an editable field in
  `settings/page.tsx`'s existing payments section, read it in
  `create-order.usecase.ts` when computing `requiredAmount` instead of always
  using the full total. Bigger surface: touches checkout math, needs its own
  test coverage on the required-amount calculation.

**Frontend**: new `dashboard/[slug]/payments/page.tsx` — list orders needing
payment attention (`PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAYMENT_SUBMITTED`),
each row showing `paidAmount`/`pendingAmount`/`paidPercentage`, with
approve/decline(+reason)/request-remainder actions. `orders/page.tsx` keeps
its current full order list (all statuses) for general order lookup — Payments
becomes the focused, action-oriented subview. Add `payments` as a real `href`
in `StoreSidebar`.

**Mobile**: same card/sheet pattern as the existing orders review UI — verify
the new required-reason text field doesn't break the mobile sheet layout.

---

## Phase 9 — Customers tab

**Goal**: list every customer a store has had, what they bought, plus
actions.

**Backend**: new endpoint `GET /stores/:storeId/customers`
(owner-auth-gated). No "list customers for a store" endpoint exists today —
`Customer` rows are currently only ever touched from checkout and the buyer
magic-link flow. New query: `Customer.findMany({ where: { storeId } })` joined
with an aggregate per customer — order count, lifetime spend (`sum` of
`OrderPayment.amount` across that customer's orders), most recent order date.
Add to the same `stats` module from Phase 5, or a small dedicated
`customers` read endpoint inside the existing `orders` module (where
`Customer` is already touched) — prefer the latter, since `Customer` is
conceptually part of the orders/checkout domain already and this avoids a
new module for a single query.
Optional: `GET /stores/:storeId/customers/:customerId` for a detail view
(that customer's full order history) if the list view alone isn't enough for
"see what they bought" — likely needed given "list what they bought" is
explicit in the ask.

**Frontend**: new `dashboard/[slug]/customers/page.tsx` — table (name, phone,
email + verified badge, order count, lifetime spend, last order date), click
into detail view (or expand-in-place) for order history. "Extra actions":
message via WhatsApp (reuse existing phone-based deep link builder), and a
link into the specific orders in `orders/page.tsx`/Phase 8's Payments page
filtered by that customer. Add `customers` as a real `href` in
`StoreSidebar`.

**Mobile**: **correction from plan review** — `products/page.tsx` does have a
`ViewMode = "grid" | "list"` toggle, but it's a manually user-toggled switch
that **defaults to `"list"`** (a `<table>` with `min-w-[820px]` inside
`overflow-x-auto`), not a breakpoint-driven responsive fallback — copying it
verbatim would default mobile customers-tab users to a horizontally-scrolled
table until they manually tap to grid view. Either default the Customers tab
to card/grid view (not list), or make the switch responsive
(auto-grid below a breakpoint) rather than copying the manual-toggle-
defaulting-to-table pattern as-is.

---

## Phase 10 — Analytics tab (growth stats)

**Goal**: statistics about growth over time, distinct from Overview's
point-in-time snapshot.

**Backend**: extend the Phase 5 `stats` module with a time-bucketed endpoint,
`GET /stores/:storeId/stats/analytics?range=30d|90d|12m` (or similar):
revenue-over-time (bucketed by day/week/month depending on range), order-count
over time, top products by units sold (reuse the existing `soldUnits`
aggregation already computed in `products.service.ts`, just resorted/limited
rather than reimplemented), new-vs-returning customer split (derived from
Phase 9's per-customer order-count query — a "returning" customer is one with
`orderCount > 1` as of the bucket).

Given current expected data volumes (single-store sellers, not high-volume
yet), a straightforward `groupBy`/date-truncation query against
`OrderPayment`/`Order` is sufficient — no need for a pre-aggregated
rollup/materialized-view table at this stage. Revisit only if this endpoint
becomes a measured perf problem.

**Frontend**: new `dashboard/[slug]/analytics/page.tsx` — simple line/bar
charts (check what charting library, if any, is already a dependency before
adding one; if none exists, a lightweight option consistent with the existing
shadcn-based UI is preferable to pulling in a heavy charting framework for a
handful of simple time series). Add `analytics` as a real `href` in
`StoreSidebar`.

**Mobile**: charts need to be horizontally scrollable or reflow to a simpler
sparkline/list view below a breakpoint — don't ship a fixed-width chart that
overflows on a 375px screen.

---

## Phase 11 — Preferences / Suggestions (rule-based, no AI)

**Goal**: implement the "ideas"/suggestions placeholder with real,
non-generative logic, or drop it — requester's explicit either/or.

**Decision**: implement, since the underlying data already exists across
Phases 5/7/9 and a rule-based version is cheap once those land. Rename the
sidebar's "ideas" placeholder to "Preferences" (or keep "Suggestions" as a
sub-section within a broader Preferences page if there's other seller-level
preference UI worth consolidating here — confirm there isn't already a
scattered "preferences" concept elsewhere before deciding the page's exact
scope; today notification toggles already live inside `settings/page.tsx`,
so don't duplicate those here).

**Backend**: `GET /stores/:storeId/suggestions` — a small rules engine, each
rule a pure function over already-fetched data (no new tables):
- N products below `lowStockThreshold` → "restock these products" (reuses
  existing low-stock query).
- Orders sitting in `PENDING_PAYMENT`/`PARTIALLY_PAID` older than some
  threshold (e.g. 48h, configurable via `holdWindowHours` already on `Store`)
  → "these orders need follow-up."
- No orders in the last N days → "your store's had no orders recently, check
  your payment/delivery config is discoverable" (generic, not personalized
  copy — this is a rule, not a recommendation model).
- Top-selling product (from Phase 10's aggregation) → "consider restocking or
  featuring your best seller."

Each rule returns a `{ id, severity, titleKey, bodyParams }`-shaped object so
copy stays in i18n, not hardcoded strings from the backend.

**Frontend**: `dashboard/[slug]/preferences/page.tsx` (or reuse a renamed
route) — list of suggestion cards, dismissible (client-side only, no need to
persist dismissal server-side for a first version — flag as a known
limitation, not a blocker).

**Mobile**: simple stacked card list, low risk.

---

## Phase 12 — Buyer accounts: login + profile (highest risk/effort phase)

**Goal**: buyers get a real account — login, profile, order history +
status, password change — not just a one-time magic link.

**Context**: `docs/core/product.md` §5.8 already specs phone+password buyer
auth; `Customer.passwordHash` exists (nullable) and is completely unused
today. The magic-link mechanism from `2026-07-31-buyer-accounts-email-confirmation.md`
was explicitly built as a stopgap, not this feature.

**This phase is materially larger and riskier than the others in this batch**
— it's a whole second authentication system, separate from better-auth
(`Customer` is deliberately not a `User`), and needs its own session/cookie
handling, password hashing, and route guards. **Confirmed in scope for this
batch** — sequenced last precisely because it's the riskiest and most novel
subsystem, so everything else lands and stabilizes first.

Shape of the work:

**Backend**: new `apps/api/src/modules/customer-auth/` module:
- Password hashing: check what better-auth uses internally (likely
  `scrypt`/`bcrypt` under the hood) and reuse the same primitive rather than
  adding a second hashing dependency — confirm exact library before deciding.
- `POST /stores/:slug/account/register` — sets a password for an existing
  (checkout-created) `Customer` row matched by phone, or the magic-link flow
  can gain a "set your password" step post-confirmation.
- `POST /stores/:slug/account/login` — phone + password, per-store scoped
  (a phone can be a `Customer` in multiple stores independently, per the
  existing `@@unique([storeId, phone])` constraint) — issues a session
  scoped to `(storeId, customerId)`, separate from better-auth's session
  cookie/table. **Open design decision, not yet resolved (see open
  questions)**: a stateless signed cookie in the same style as the existing
  magic-link token (`createCustomerAccountToken`) is the cheapest option but
  **can't be individually revoked** — e.g. on password change or a "sign out
  everywhere" action, the only way to invalidate it is rotating the shared
  `CUSTOMER_ACCOUNT_TOKEN_SECRET` for every customer across every store at
  once. A real DB-backed `CustomerSession` table (new model + migration),
  mirroring what better-auth's own `Session` model already does for `User`,
  is revocable per-row but is more work and is exactly the kind of new
  table this batch otherwise avoids adding. Decide before implementation.
- `POST /stores/:slug/account/change-password`, guarded by that session.
- `GET /stores/:slug/account/me` — profile + order history, replacing the
  magic-link's `confirmAccount` as the primary path once logged in (the
  magic-link stays working for buyers who never set a password — don't break
  the existing flow).
- New guard (e.g. `CustomerSessionGuard`) parallel to the existing
  `AuthGuard`, scoped to the `Customer` session cookie, not better-auth's.

**Frontend**: `store/[slug]/account/login/page.tsx`, `.../account/register/page.tsx`
(or fold registration into the existing confirm-page flow — "set a password"
CTA shown there), `.../account/page.tsx` (profile: name/email/phone editable,
order list + status, change-password form).

**Explicit interaction with Phase 1's navbar**: this is a *separate* account
system from the seller `User` navbar CTA — the storefront (`store/[slug]/...`)
needs its own small session-aware header (buyer "My Account" vs. "Log in"),
distinct from the marketing-site navbar built in Phase 1. Don't conflate the
two session systems in one navbar component.

**Security note (not a security-warning-in-caveman-sense, just accuracy)**:
this introduces a second password-based login surface with its own rate
limiting/lockout considerations — `docs/core/deploy.md`'s already-known gap
("no rate limiting wired in despite `@nestjs/throttler` being installed") gets
more serious once there's a *second* password login endpoint. If this phase
ships, wiring up `@nestjs/throttler` on both login endpoints (seller and
buyer) should ship alongside it, not be deferred again.

---

## Phase 13 — Best-selling stores + store index/directory

**Goal**: landing page promotes top-performing stores; a public store
directory exists.

**Backend**:
- `GET /stores/featured?limit=N` (public, no auth) — ranks stores that have
  at least one `Product` with `status: PUBLISHED` (`Store` itself has no
  `status`/published column — only `Product.status` does; don't go looking
  for a `Store.status` field) by verified revenue over a trailing window
  (e.g. last 30 days), matching the semantics of Phase 5's per-store revenue
  aggregation, scoped across stores instead of one. No new
  "ranking"/"featured" column needed — compute at request time same as
  everything else in this batch; revisit caching only if this becomes a real
  load concern (unlikely at current scale).
  - **Algorithm floor, since revenue-alone has a real gap**: a single large
    sale could vault a brand-new store above stores with many smaller repeat
    sales, and there's no tie-break rule. Add a minimum order-count
    threshold for "featured" eligibility (e.g. ≥3 `VERIFIED` orders in the
    window) before ranking by revenue, and tie-break by order count. State
    this explicitly as the chosen v1 signal rather than leaving "algorithm"
    underspecified given how much emphasis the request placed on it — a
    more sophisticated ranking (recency-weighted, category-diversity-aware,
    etc.) is a reasonable future iteration, not v1.
  - Excludes stores owned by a `User` with `banned: true` (see Phase 15 —
    banning a seller shouldn't leave their storefront promoted on the
    homepage). Depends on Phase 15 shipping first, or on `banned` being
    checked even before Phase 15's admin UI exists (the column is already on
    the schema, just currently unused).
- `GET /stores/directory?q=&page=` (public) — paginated list of stores with
  at least one published product, optional name search (`ILIKE` on
  `Store.name`, no full-text infra needed at this scale). Same banned-seller
  exclusion as `/stores/featured`.
- Both endpoints only return stores with published products — a store with
  zero live inventory shouldn't appear in either. Public/cross-store-read
  justification against `CLAUDE.md`'s storeId rule: see the cross-cutting
  ground rules section above (stated once there, applies here and to
  Phase 14).

**Frontend**:
- Landing page: new "Featured stores" section (between `SocialProof` and
  `Cta`, or wherever reads best) rendering `GET /stores/featured` results as
  cards (logo, name, maybe a top-product thumbnail) linking to
  `/store/{slug}`.
- New `apps/web/app/[locale]/stores/page.tsx` (or `/discover`) — the public
  directory, paginated grid + search input, using `GET /stores/directory`.

**Mobile**: card grid, same responsive pattern as `products/page.tsx`.

---

## Phase 14 — Cross-store product search

**Goal**: a customer can search for a product by name and find matches
across every store carrying it.

**Backend**: `GET /products/search?q=&page=` (public, no auth, deliberately
cross-tenant read-only — see the cross-cutting ground rules section for why
this doesn't violate `CLAUDE.md`'s storeId rule). Filters to
`status: PUBLISHED`, `deletedAt: null`, and excludes products whose store is
owned by a banned `User` (same exclusion as Phase 13's `/stores/featured`/
`/stores/directory`). Query: case-insensitive `contains` on `Product.name`
(and maybe `description`) to start — Postgres `pg_trgm` + a GIN index only if
`ILIKE '%...%'` proves too slow in practice; don't add that extension
speculatively. Returns product + its store's name/slug so results can link
into the right storefront.

**Frontend**: new `apps/web/app/[locale]/search/page.tsx` — search input +
result grid (product image/name/price/store name). **Correction from plan
review**: there is no product-detail route of any shape today —
`store/[slug]/product-card.tsx` only renders an inline
variant-select-and-add-to-cart card directly on the store's own grid page
(`store/[slug]/page.tsx`); there's no `/product/[productId]` route, no
click-through, no modal/detail view anywhere in the storefront. Cross-store
search results have nowhere to deep-link into as things stand today, so
building a real product-detail page/anchor (even a minimal one — image,
name, price, add-to-cart, linking back to the parent store) is in scope for
this phase, not a pre-existing route this phase can just point at.

**Mobile**: search input + result grid, same responsive card pattern reused
elsewhere in this batch.

---

## Phase 15 — Admin Users table

**Goal**: `/admin/users` becomes real, matching the already-real
`/admin/stores` pattern.

**Correction from plan review**: don't hand-roll ban/unban endpoints —
better-auth's `admin` plugin, already wired in `auth.config.ts:83-88`
(`admin({ defaultRole: 'seller', adminRoles: ['admin'] })`), already exposes
`listUsers`/`banUser`/`unbanUser`/`setRole` client methods operating on these
exact `banned`/`banReason`/`banExpires` columns, and the frontend already
has the client registered (`adminClient()` in `apps/web/lib/auth-client.ts`)
and already calls a plugin method directly from a page component
(`authClient.admin.impersonateUser(...)` in `admin/stores/page.tsx:42`) —
that's the established in-repo pattern for admin-plugin actions, not a new
NestJS endpoint per action. Use `authClient.admin.listUsers()`,
`authClient.admin.banUser()`/`unbanUser()` directly from
`admin/users/page.tsx`, the same way Stores already does.

**Backend**: the one genuinely new piece is the per-user store count, which
`listUsers` can't provide — a small `GET /admin/users/store-counts` (or
equivalent) endpoint, `@Roles(['admin'])` guarded like
`stores.controller.ts`'s `findAllForAdmin`, returning `{ userId, storeCount
}[]` to join against the client-fetched user list. Implement in the `users`
module (currently an empty `UsersController`/`UsersService` stub — this is
exactly what it's for) rather than bolting it onto `stores`.

**Frontend**: `apps/web/app/[locale]/(dashboard)/admin/users/page.tsx` —
fetches via `authClient.admin.listUsers()` + the new store-count endpoint,
table modeled on `admin/stores/page.tsx` (name/email/role/store
count/banned-status columns, ban/unban action calling
`authClient.admin.banUser()`/`unbanUser()` directly). Remove
`disabled: true` from the `users` entry in `app-sidebar.tsx`'s `NAV_ITEMS`.

**Mobile**: `admin/stores/page.tsx` today wraps its table in `overflow-hidden`
(not `overflow-x-auto`) — columns silently clip on narrow viewports, no
horizontal-scroll affordance at all. The new Users table has more columns
(name/email/role/banned-status/store-count vs. Stores' 5), so copying this
pattern verbatim makes the clipping worse, not just "not ideal" — at minimum
swap to `overflow-x-auto` for the new Users table rather than inheriting the
existing gap silently.

---

## Explicit out of scope for this batch

- Full shadcn-`Sidebar` migration for the store dashboard (Phase 4 uses an
  additive collapse instead — see that phase's explicit decision).
- Any AI/ML-based recommendations, ranking, or generated suggestion copy.
- A pre-aggregated stats rollup table / caching layer for analytics or
  featured-stores ranking — plain on-demand aggregation first, revisit only
  under measured load.
- Full-text search infra (`pg_trgm`, Elasticsearch, etc.) — start with
  `ILIKE`, upgrade only if proven too slow.
- Rate limiting / CSRF / `helmet` generally (pre-existing documented gaps in
  `infra/docker/DEPLOY_ORACLE.md`) — **except** the buyer-login-specific
  throttling called out in Phase 12, which should ship with that phase if
  that phase ships at all.
- Subdomain-per-store, tenant-resolution middleware — unchanged from current
  architecture.
- Persisting suggestion-dismissal state server-side (Phase 11) — client-only
  dismissal for v1.

## Open questions for the requester

1. **Phase 12 (buyer accounts)**: confirmed as its own follow-up plan, or
   wanted inline in this same batch despite the size/risk called out above?
   This is a firm ask (see Context, priority 5) — the question is sequencing,
   not whether it happens.
2. **Phase 12 session storage**: stateless signed cookie (cheap, matches the
   existing magic-link pattern, but not individually revocable) vs. a new
   DB-backed `CustomerSession` table (revocable per-row, more work, a new
   model this batch otherwise avoids)?
3. **Phase 6 ("My Store")**: confirmed "delete the placeholder, add a 'View
   store' link" instead of building a second settings-like page — or is there
   a specific "My Store" concept in mind that this plan is missing?
4. **Phase 8 "add extra % of partial payment"**: does this mean (a) a cheap
   WhatsApp nudge asking for the existing `pendingAmount`, (b) finally wiring
   up the dormant `PaymentMethodConfig.depositPercentPickup`/`Courier`
   columns so a seller can require e.g. 30% up front instead of 100%, or (c)
   both? These are different amounts of work on different surfaces (UI
   affordance vs. checkout-math change) — see Phase 8 for the full
   breakdown.
5. **Phase 10 charting**: no charting library currently in `apps/web`'s
   dependencies (confirmed by direct check, not just "to be confirmed later")
   — acceptable to add one, and if so any preference, or should Analytics
   ship as numbers/tables only for v1?
6. **Phase 13 "algorithm"**: is a minimum-order-count floor + revenue sort
   (see Phase 13's "algorithm floor" note) an acceptable v1 given how much
   weight the request placed on "an algorithm," or is a specific ranking
   approach expected?
