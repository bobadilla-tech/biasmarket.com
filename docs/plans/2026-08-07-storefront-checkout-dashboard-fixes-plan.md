# Plan: sold-out product sorting, pickup-point date selection, stale "Ingresos verificados" stat, notification badge counts

Written before execution (deviates from this directory's normal "record after
the work lands" convention, at the user's explicit request, to allow a review
pass before any code is written — same exception
`2026-08-06-order-status-buyer-login-pickup-checkout-fixes-plan.md` made).
Rename/fold into a normal changelog entry after the work ships, or split per
feature if that's cleaner at that point.

## Context

Four reports batched into one plan, investigated directly (grep + file reads,
not yet Explore subagents) before writing:

1. Storefront product grid mixes sold-out products with available ones.
2. Checkout pickup-point cards are fully unselectable when the point has no
   availability today, blocking a valid "buy now, pick up later" flow.
3. Seller dashboard "Resumen" → "Ingresos verificados" stat shows PEN 0.00 after
   a payment is registered and approved.
4. Neither the header nor sidebar notification bell shows an unread count badge.

Two of these turned out to be smaller than the report implied because recent
work already landed most of the mechanism (see §2 and §4) — read those sections'
"Current state" before assuming a from-scratch build.

**Reviewed by two independent parallel agents** after the first draft, each
re-reading the actual current source (not trusting the draft's line numbers or
claims) and classifying findings HIGH (wrong root cause/file/claim, or a gap
that would ship a broken fix) / MEDIUM (directionally right, missing an edge
case/test/call site) / LOW (line-number drift, style, optional scope). Every
HIGH and MEDIUM finding from both passes is folded into the sections below —
notably §2's frontend scope was significantly under-stated in the first draft (4
more `selectablePoints` call sites, a weekday-vs-date type mismatch, a timezone
risk, and a confirmation-UI step that assumed markup which doesn't exist), §3
gained a newly-found adjacent float-precision bug in `getAnalytics`, and §4's
"read-state sync" open question was resolved (already works, no fix needed)
rather than left as a TODO for the implementer. LOW findings (mostly
line-citation drift as the draft was written against a moving codebase) aren't
individually called out — line numbers in this doc are approximate, re-check
them at implementation time.

---

## 1. Sold-out products mixed with in-stock ones on the storefront grid

### Current state (confirmed via investigation)

`apps/web/app/[locale]/(storefront)/store/[slug]/page.tsx` renders each
`COLLECTION` section's products in whatever order the API returns them
(`section.collection.products`, lines 136–153) — no client or server sort by
stock status. `ProductCard`
(`apps/web/app/[locale]/(storefront)/store/[slug]/product-card.tsx:75-78`)
already computes `outOfStock` per-card (soldOut flag OR every variant's
`stock - reserved <= 0`) and shows a "soldOut" badge + disabled buy button, but
that's purely a per-card visual — nothing upstream reorders or separates cards.

**The "let buyers register interest for restock" ask in the report is already
built**, not missing: `RestockInterestDialog`
(`apps/web/features/restock/components/restock-interest-dialog.tsx`, wired at
`product-card.tsx:173-181`) already renders a "registrar interés" CTA on every
out-of-stock card, backed by a real API
(`apps/web/features/restock/api/restock.api.ts`,
`apps/web/features/restock/mutations/use-request-restock.ts`) and a seller-side
`RestockRequestsPanel`. Scope here is sorting/placement only — don't rebuild
restock interest.

### Fix

1. Sort in-stock products before out-of-stock ones within each collection
   section in `page.tsx`. The stock-status computation currently lives
   client-side in `product-card.tsx` (`availableStock`/`allVariantsOutOfStock`)
   — since `page.tsx` is a server component with the same `product` shape
   available, either: (a) extract a pure `isProductOutOfStock(product)` helper
   shared between `page.tsx` and `product-card.tsx` (e.g. new file under
   `apps/web/app/[locale]/(storefront)/store/[slug]/` or a small
   `features/discovery`-adjacent lib), or (b) have the API's `findPublicBySlug`
   response include a precomputed `soldOut`-equivalent per product so the
   frontend doesn't duplicate variant-stock math. Prefer (a) first — smaller
   blast radius, no API/DTO/Orval regen needed — confirmed via review there is
   no existing precomputed "effectively out of stock" flag anywhere in the API
   response for any other consumer, so (a) really is the smaller change, not
   just the default guess.
   - **The extracted helper can only ever be
     `product.soldOut ||
     allVariantsOutOfStock`, not a full match for
     `ProductCard`'s own `outOfStock`** (confirmed via review): `ProductCard`'s
     version (`product-card.tsx:70-72`) additionally ORs in the
     _currently-selected variant's_ stock, which is client-only `useState`
     `page.tsx` has no equivalent of. `ProductCard` keeps its own extra OR
     condition on top of the shared helper — don't try to unify them completely,
     the sort only needs the product-level signal anyway.
2. **Evaluate the "separate 'Agotados'/'Próximamente disponibles' section at the
   bottom of the page" idea from the report as a distinct, larger UI change**,
   not a rename of the sort step above: it means pulling sold-out products out
   of their collection's own section grid entirely and re-grouping them into one
   new page-level section after all collections. Decide during implementation
   whether that's in scope for this pass or a fast-follow — the minimum fix
   (in-stock-first sort within existing sections) already satisfies "shouldn't
   occupy visible priority space" on its own; the dedicated section is a bigger
   visual/IA change worth a separate go/no-go with the user given it changes how
   collections are presented, not just item order.
3. **i18n**: none needed for the sort-only fix (no new copy); the dedicated
   section (if pursued) needs new section-heading copy in
   `packages/i18n/{es,en}/`.
4. **Tests**: this page has no existing test file (`page.tsx` is a server
   component doing a raw `fetch`, not migrated to `features/`) — if the sort
   helper is extracted as a pure function per option (a) above, unit-test it
   directly; a full page render test is disproportionate for this fix.

### Non-goals

- Not touching per-card sold-out UI (`ProductCard`'s badge/disabled-button/
  restock-CTA already correct).
- Not rebuilding restock-interest — already shipped, see "Current state".
- Not deciding the dedicated-section IA change unilaterally — flag it, don't
  silently build or silently skip it.

### Follow-up bug found during review, out of scope for this fix

`buildJsonLd` (`page.tsx:79-81`, the storefront's `Product`/`Offer` JSON-LD)
sets `availability` from raw `product.soldOut` only — not the fuller
"effectively out of stock" computation (`soldOut` OR all-variants-depleted)
`ProductCard` uses. A product with `soldOut: false` but every variant at 0 stock
reports `https://schema.org/InStock` in structured data while the card itself
shows the "soldOut" badge — pre-existing, unrelated to sorting, but in the same
file and fixable with the same shared helper from fix item 1 above. Worth a
one-line follow-up once that helper exists; not blocking this plan.

---

## 2. Checkout pickup-point cards unselectable when closed today

### Current state (confirmed via investigation)

This is **not greenfield** —
`2026-08-07-checkout-card-redesign-and-payment-method-fix.md` (landed the day
this plan is being written) already built the pickup-point day-availability data
path end to end: `PickupPoint.openDays`/`closedOverride` (schema + API, from the
2026-08-06 batch), a pure `getPickupAvailability()` helper
(`apps/web/features/checkout/lib/pickup-availability.ts`, unit-tested, 6 cases),
and card rendering in `checkout-form.tsx`. The behavior the report objects to —
a closed-today point renders as a **disabled**, non-clickable card — is exactly
what that PR shipped **by design**, not a regression: `checkout-form.tsx:246`
(`disabled={!availability.availableToday}`), and the `selectablePoints` memo at
`checkout-form.tsx:96-103` filters closed points out of what's assignable to the
form entirely. The report is asking for that design decision to change, not for
a bug fix.

Server-side, `CreateOrderUseCase`
(`apps/api/src/modules/orders/application/create-order.usecase.ts:73-88`) hard
-rejects a submitted `pickupPointId` that's `closedOverride`'d or outside
`openDays` **for today** — there is currently no concept of "submit an order
today, pick up on a future date" anywhere in the order model. Confirmed via
review: the ownership check (`point.storeId !== store.id`) runs inside this same
row-locked transaction before the availability check, so the new date-validation
logic naturally inherits correct multi-tenant scoping without extra work — just
land it after that existing check, same position. `Order`/`CreateOrderDto`
(`packages/db/prisma/schema.prisma:209-244`,
`apps/api/src/modules/orders/dto/create-order.dto.ts`) have no pickup-date field
at all — `deliveryDetails` is a generic JSON blob for delivery-method data, not
a structured date.

### Fix

This is a **schema-sized change**, comparable to the payment-method fix the
2026-08-07 checkout PR just did — plan and land it as such, not as a tweak to
the disabled-prop.

1. **Schema**: add `Order.pickupDate DateTime?` (nullable — only meaningful for
   `PICKUP` orders selecting a non-today point). New Prisma migration,
   `pnpm db:generate` after.
2. **API**:
   - `CreateOrderDto` gains an optional `pickupDate` (date-only string,
     `YYYY-MM-DD`, validated).
   - `CreateOrderUseCase`'s current hard-reject
     (`create-order.usecase.ts:73-88`) needs to become: if `pickupPointId` is
     set and the point isn't open today, **require** `pickupDate` and validate
     it against that point's `openDays` (weekday of the given date must be in
     `openDays`, and reject a date if `closedOverride` is true — a manually
     closed point has no future date to offer either, matching
     `getPickupAvailability()`'s existing `nextAvailableDay: null` case for
     `closedOverride`; the frontend's `enabled === false` branch yields the same
     `null` without `closedOverride`, but that's moot server-side since
     `findEnabledForSlug` already filters to `enabled: true` points before the
     storefront sees them — mention this only for defense-in-depth parity with
     the frontend helper's shape, no separate backend check needed). If the
     point _is_ open today, `pickupDate` should be optional/ignored (today is
     implied) — don't force every pickup order through the new field.
   - **Timezone correctness, confirmed as a real risk via review, not
     theoretical**: the existing "today" check derives from
     `new Date().getDay()` (`create-order.usecase.ts:80`, and mirrored in
     `PublicPickupPointsController.findEnabled`'s `weekday` field) — an instant
     converted to whatever timezone the Node process runs in. No `TZ` env var is
     set anywhere under `infra/docker/`, so the container's effective timezone
     is environment-dependent (defaults to UTC in most container base images),
     while the business operates in Peru (PEN currency throughout this
     codebase). This is **pre-existing behavior, not a regression to fix as part
     of this plan** — but the _new_ `pickupDate` parsing must not introduce a
     second, differently-computed weekday: parse the submitted `YYYY-MM-DD`
     string as UTC explicitly
     (`new Date(dto.pickupDate + "T00:00:00Z").getUTCDay()`) and compare against
     `openDays` using the same convention the existing `weekday` field already
     uses, whatever that turns out to be once checked — don't let the two
     computations silently diverge by using plain `new Date(dateString)` + local
     `.getDay()` for one and UTC for the other. If this surfaces a preexisting
     TZ bug in the "today" check while implementing, flag it back rather than
     silently fixing (or silently ignoring) it — it's adjacent but independent
     of this plan's scope.
   - Response DTOs (`OrderResponseDto`/`OrderDetailResponseDto`/
     `OrderStatusResponseDto`/`CheckoutOrderResponseDto` and their
     hand-maintained `*Row` shadow interfaces — same set the 2026-08-07 PR had
     to touch by hand for `paymentMethod`, per that plan's note on
     excess-property-check behavior with spread) need `pickupDate` added
     explicitly.
   - Regenerate OpenAPI + Orval client:
     `pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`,
     commit the diff.
3. **WhatsApp handoff message**: `WhatsAppOrderInput`/
   `buildWhatsAppOrderMessage` (`packages/utils/src/whatsapp/index.ts`) gains a
   `pickupDate` field, rendered only when present (mirrors how the 2026-08-07 PR
   added `paymentMethod` there) — the seller needs to see the buyer's chosen
   pickup date in the same handoff message they already read, not a separate
   surface.
4. **Frontend (`checkout-form.tsx`) — bigger redesign than a two-line prop drop,
   confirmed via review**: `selectablePoints` (`checkout-form.tsx:96-103`,
   currently meaning "points open today") has 4 consumers, not 2 — the
   `disabled` prop (line 246) and the filter itself are the obvious two, but
   it's also read at line 108
   (`buildCheckoutFormSchema(selectablePoints.length > 0, ...)`, deciding
   whether a pickup point is _required at all_), inside the auto-select
   `useEffect` at lines 122-151 (which currently blindly assigns
   `selectablePoints[0]` as the default `pickupPointId`), and in the submit
   button's disabled condition at line 345. Once closed-today points become
   selectable, "a point is assignable" must stop meaning "a point is available
   today" everywhere it's checked, not just at the two obvious sites:
   - Rename/repurpose the concept to "any active pickup point exists"
     (`points.length > 0`) for the schema's `pickupPointsAvailable` arg and the
     submit-button gate — a closed-today point is still a valid, completable
     selection once the date picker exists.
   - The auto-select effect must stop defaulting to "first point in
     `selectablePoints`" once that array's meaning changes — either default to
     the first _available-today_ point if one exists (preserve today's good-case
     UX of not making the buyer pick anything) and leave the field unset if none
     are available today (forcing an explicit choice + date-pick), or drop the
     auto-select behavior entirely for the closed-today case. Decide during
     implementation which reads better against the actual mockup; don't silently
     keep auto-selecting a closed point with no date attached.
   - Drop the `disabled` prop (line 246) so closed-today cards become clickable,
     per the report.
   - **Date picker + defaulting**: selecting a closed-today point reveals a date
     input scoped to that point's `openDays` (disable weekdays not in
     `openDays`; if `closedOverride`, there's no valid future date — show that
     state explicitly, don't render an empty/broken picker).
     `PickupAvailability.nextAvailableDay` (`pickup-availability.ts:12-18`) is a
     **bare weekday index (0–6), not a calendar date** — confirmed via review
     this is the actual type/shape. Defaulting a date-input's value directly
     from it would set the field to a meaningless `"0"`–`"6"` string. Add a
     small pure `nextDateForWeekday(weekday: number, today: Date): Date` helper
     (next `lib/pickup-availability.ts` addition, unit-test it same as the
     existing 6 cases) that converts the weekday index into the next real
     calendar date, and default the picker to _that_.
   - `pickupDate` becomes a new `Controller`-wrapped RHF field, only required
     when the selected point isn't open today (`buildCheckoutFormSchema` in
     `checkout.schema.ts` needs a conditional `.refine`, matching the existing
     conditional pattern for `pickupPointId`/`paymentMethod`).
   - Submit payload (`onSubmit` at `checkout-form.tsx:158-177`,
     `use-submit-checkout.ts`, `checkout.api.ts`) forwards `pickupDate` when
     set, as a plain `YYYY-MM-DD` date-only string (no time-of-day component —
     see the timezone note in step 2 above for why the format matters here, not
     just server-side).
5. **Copy**: change "No disponible hoy" from a passive subtitle to a CTA-style
   string ("Próximo día disponible: {día} — elegir fecha") per the report —
   new/updated i18n keys in `packages/i18n/{es,en}` for
   `storefront.checkoutPage` (`notAvailableToday`/`nextAvailable` already exist
   per `checkout-form.tsx:249-256`, reword rather than duplicate keys).
6. **Order summary + confirmation — scope this as new UI, not a field addition,
   confirmed via review**: the plan's original framing ("show the chosen
   `pickupDate` in `checkout-summary.tsx` and the confirmation view") assumed an
   existing delivery-details display to extend. There isn't one:
   `checkout-summary.tsx` (39 lines) renders only cart line items + total, never
   delivery/pickup info, before or after this plan; the post-submit confirmation
   view
   (`app/[locale]/(storefront)/store/[slug]/checkout/
   checkout-page-client.tsx:22-38`)
   renders only the order ID + an email notice, no delivery details either. And
   for any store with a `whatsappNumber` configured — the common case — the
   buyer is redirected away immediately via
   `globalThis.location.href = result.whatsappUrl` (`checkout-form.tsx:174-176`)
   before ever seeing that confirmation screen, so it's a fallback most buyers
   won't hit. **The WhatsApp message (step 3 above) is the only surface most
   buyers will actually see the pickup date on.** Given that, treat building a
   from-scratch pickup-details section in `checkout-summary.tsx`/the
   confirmation screen as an optional fast-follow within this same feature
   rather than a blocking requirement — decide during implementation whether
   it's worth the net-new UI work given step 3 already closes the loop for the
   primary funnel, and check with the user before skipping it outright if it
   does get cut.
7. **Tests**:
   - Extend `pickup-availability.test.ts` if any date-validation logic moves
     into a shared pure function (e.g. "is this date valid for this point's
     openDays").
   - `checkout-form.test.tsx`: new case — selecting a closed-today point reveals
     the date picker instead of blocking selection; submit payload includes
     `pickupDate` when the picker was used.
   - `checkout.schema.test.ts`: new conditional-required case for `pickupDate`.
   - `create-order.usecase.spec.ts` (or equivalent): reject a submitted
     `pickupDate` whose weekday isn't in the point's `openDays`; reject any
     `pickupDate` against a `closedOverride`'d point; accept a valid future
     date; confirm a same-day-open point still works with no `pickupDate` at all
     (regression coverage for the existing golden path).
   - `whatsapp/index.test.ts`: new case for the `pickupDate` line, and a
     confirm-unchanged case for orders without one (same pattern the 2026-08-07
     PR used for `paymentMethod`).

### Non-goals

- Not building a calendar/date-range picker library integration — a native
  `<input type="date">` (or the simplest component already available in this
  repo — check `components/ui/` before reaching for a new dependency)
  constrained to the point's open weekdays is enough; the report's own mockup
  shows a simple day-list picker, not a calendar widget.
- Not changing `closedOverride` semantics (a manually closed point still offers
  no future date — matches current `getPickupAvailability()` behavior).
- Not touching courier delivery — pickup-only.

---

## 3. "Ingresos verificados" stuck at PEN 0.00 after a verified payment

### Current state (confirmed via investigation)

**Root cause is a missing cache invalidation, not backend math.** Verified via
reading the full chain:

- Backend computes revenue correctly and live, no caching:
  `StatsService.getOverview`
  (`apps/api/src/modules/stats/stats.service.ts:74-77,127`) does
  `orderPayment.aggregate({ where: { storeId, order: { paymentStatus: "VERIFIED" } }, _sum: { amount: true } })`
  — a real-time DB aggregate over all `OrderPayment` rows on orders currently
  `VERIFIED`, re-run on every request. Nothing wrong here.
- The "approve with zero payment" bug that used to make `VERIFIED` reachable
  with no `OrderPayment` row at all (which would have produced exactly this
  symptom) is **already fixed** — confirmed both guards are live:
  `review-payment.usecase.ts:72-76` (`paidAmount <= 0` throws
  `BadRequestException`) and the frontend disables "Aprobar" until
  `paidAmount > 0` (`order-detail-sheet.tsx:218-226`,
  `orders-table.tsx:131-139`, both showing `t("approveDisabledNoPayment")`).
  This landed via
  `2026-08-06-order-status-buyer-login-pickup-checkout-fixes-plan.md`'s issue #1
  — so a fresh repro (register a payment, then approve) should already produce a
  nonzero `OrderPayment` before `VERIFIED` is reachable at all.
- **The actual bug**: neither order mutation that changes what "Ingresos
  verificados" depends on invalidates the stats query.
  `apps/web/features/orders/mutations/use-register-payment.ts:26` and
  `use-review-payment.ts:32` both only call
  `queryClient.invalidateQueries({ queryKey: ordersKeys.byStore(storeId) })` —
  never `statsKeys.overview(storeId)` (exported from
  `apps/web/features/stats/index.ts`, backing `useStatsOverview` at
  `apps/web/features/stats/queries/use-stats-overview.ts:12`). A seller who
  registers a payment and approves it _without a full page reload_ keeps seeing
  whatever "Resumen" cached on last visit — which for a brand-new order/seller
  session is 0.00, matching the report exactly. This reproduces reliably in an
  SPA navigation (dashboard → order → back to Resumen) and is masked by a hard
  refresh, which is presumably why the report describes it as persistent rather
  than transient. `use-advance-fulfillment.ts:23` and
  `use-cancel-order.ts:40-41` have the same gap for
  `lowStockCount`/`fulfillmentStatusCounts`/`totalOrders`, which aren't in the
  original report but are the same class of bug on the same page.

### Fix

1. Add
   `queryClient.invalidateQueries({ queryKey: statsKeys.overview(storeId) })`
   alongside the existing `ordersKeys.byStore(storeId)` invalidation in all four
   mutations: `use-register-payment.ts`, `use-review-payment.ts`,
   `use-advance-fulfillment.ts`, `use-cancel-order.ts`. Import `statsKeys` from
   `@/features/stats`.
2. **Reproduce on current `main` before writing any fix** — given both backend
   guards already landed, confirm this is really the cache-staleness bug
   described above and not something else specific to the reporter's environment
   (e.g. a stale deployed build predating the 2026-08-06 fix). If the
   SPA-navigation repro above doesn't reproduce it, stop and re-investigate
   rather than shipping a speculative fix.
3. **Tests — these are 4 new test files, not extensions, confirmed via review**:
   none of `use-register-payment.ts`, `use-review-payment.ts`,
   `use-advance-fulfillment.ts`, `use-cancel-order.ts` has an existing test file
   today (`apps/web/features/orders/mutations/*.test.ts` currently has zero
   matches for any of the four). Write new test files for each, asserting
   `statsKeys.overview(storeId)` is among the invalidated query keys alongside
   `ordersKeys.byStore(storeId)`.

### Non-goals

- Not changing `StatsService.getOverview`'s aggregation logic — confirmed
  correct (single DB-level `_sum` aggregate, one terminal `Number()` conversion,
  no compounding JS float arithmetic).
- Not re-adding a payment-approval guard — already shipped.
- Not adding polling/websocket-based live updates to "Resumen" — the report's
  own acceptance criterion is "actualizándose en tiempo real (o al menos al
  recargar)" — cache invalidation on the mutations that change the number
  satisfies the "recargar" bar; real-time push is a bigger, separate feature if
  wanted later.

### Adjacent bug found during review, worth folding into the same PR

**`StatsService.getAnalytics`'s per-bucket revenue sum has the same
float-precision bug class this codebase already found and fixed once**, in a
different method of the same file. `stats.service.ts:191-197` computes each
bucket's revenue via
`sum + order.payments.reduce((s, p) => s + Number(p.amount), 0), 0)` — plain
JS-float summation across potentially many `OrderPayment.amount` `Decimal` rows.
This is exactly the category of bug `apps/web/AGENTS.md` documents as found and
fixed in `OrderRepository.withPaymentSummary`/ `payment-summary.ts` during the
Orval Batch 4 rollout (a seller-facing "exceeds pending balance" guard using
imprecise float math). `getOverview` (this section's actual subject) is
confirmed safe — see the non-goal above — and `getPaymentMethodsBreakdown` in
this same file already does the correct thing via `Prisma.Decimal` accumulation
(`stats.service.ts:261-264`); only `getAnalytics`'s bucket revenue needs to
follow that existing in-file pattern. Low urgency (analytics chart display, not
a balance/payment-blocking guard like the original bug), but cheap to fix while
already touching this file for the invalidation work above, and it compounds
silently the longer it's left — worth a small follow-up commit in the same PR
rather than a separate plan.

---

## 4. Notification bell unread-count badge missing (header + sidebar)

### Current state (confirmed via investigation)

**Header bell already has this**, fully implemented and wired:
`NotificationsBell`
(`apps/web/features/notifications/components/notifications-bell.tsx:22,28,41-47`)
already renders a red circular badge sourced from `useUnreadCount(storeId)`
(`apps/web/features/notifications/queries/use-notifications.ts:29-35`, backed by
a real `apiClient.notifications.unreadCount` endpoint), hides at count 0, and
truncates to "9+" — exactly the report's spec. It's mounted in
`apps/web/components/dashboard/store-theme-frame.tsx:58`, present on every
dashboard page. **Re-verify this in a live session before assuming it's fully
resolved** (the report may predate this landing, or there may be a real
data-refresh gap — see Fix step 1), but the component-level implementation
matches the ask.

**Sidebar bell has no badge at all.** `StoreSidebar`
(`apps/web/components/dashboard/store-sidebar.tsx`)'s `growthItems` array
(`:49-53`) renders `{ key: "notifications", icon: Bell, href: "notifications" }`
through the generic `NavItem`/`SidebarSection` renderer (`:60-137`), which has
no concept of a badge — just an icon + label, active-state styling only. No
`useUnreadCount` call anywhere in this file. This is the real gap.

### Fix

1. **Verify the header bell live** (dev server, seeded seller account with
   unread `LOW_STOCK`/`OUT_OF_STOCK` notifications) before treating it as done —
   if it's genuinely already correct, this report's header half may just be
   stale; note that finding rather than re-implementing working code.
2. **Sidebar bell**: `StoreSidebar` doesn't currently receive `storeId` (only
   `store: DashboardStore | null`, which likely has `.id` — confirm) or call
   `useUnreadCount`. Add the same `useUnreadCount(store?.id)` call
   `NotificationsBell` already uses (same query key, same cache — both bells
   read the same TanStack Query cache entry, so they update in lockstep for free
   once wired, satisfying the report's "must stay synchronized" requirement
   without any extra plumbing). Render a small badge on the `Bell` icon
   specifically for the `key === "notifications"` nav item in `SidebarSection`'s
   render loop (`store-sidebar.tsx:83-133`) — needs a `collapsed`-aware
   placement (the icon-only collapsed rail still needs the badge visible, likely
   as a small dot or corner badge on the icon itself, matching how
   `NotificationsBell`'s badge sits on its `Bell` icon). `MobileSidebar`
   (`mobile-sidebar.tsx:36`) renders `StoreSidebar` directly with no separate
   nav duplication, confirmed via review — fixing this one component covers
   desktop and the mobile sheet both, no second call site.
3. **Read-state sync ("baja sin recargar") — already works, confirmed via
   review, no fix needed**: `use-mark-read.ts`, `use-mark-all-read.ts`, and
   `use-archive-notification.ts` all invalidate `notificationKeys.all(storeId)`
   (`["notifications", storeId]`), and `notificationKeys.unreadCount(storeId)`
   is that same array with `"unread-count"` appended
   (`use-notifications.ts:6-11`). TanStack Query's default `invalidateQueries`
   prefix-matches, so invalidating `all(storeId)` already invalidates
   `unreadCount(storeId)` too — verified this is live today, not just in theory.
   Nothing to change here; both bells will update in lockstep for free once step
   2 wires the sidebar to the same hook.
4. **Tests**: no existing test file for `store-sidebar.tsx` — add one covering
   badge render/hide/9+ truncation once the badge lands, mirroring whatever
   `notifications-bell.tsx` already has covered (check for an existing
   `notifications-bell.test.tsx`; if none exists, this is "add" for both, not
   just the sidebar).

### Non-goals

- Not building a new polling/push mechanism for unread count — reuses
  `useUnreadCount`'s existing TanStack Query caching as-is.
- Not changing the notifications list page's own per-item unread indicator (the
  "●", already correct per the report).

---

## Suggested sequencing for the execution agent

1. **#3 (stats invalidation)** — smallest, most self-contained, a one-line
   addition ×4 files plus tests. Do first. Includes the "reproduce before
   fixing" step called out above — if it doesn't reproduce as described, flag
   back before spending more time on it.
2. **#4 (notification badges)** — small; header is likely already done (verify),
   sidebar is a contained addition reusing an existing query hook. No schema/API
   changes.
3. **#1 (sold-out sorting)** — small-to-medium depending on whether the
   dedicated "Agotados" section (fix item 2) is greenlit; the minimum sort-only
   fix is independent of #2 and #4.
4. **#2 (pickup-point date selection)** — largest, schema-sized (new migration,
   DTO/response-DTO changes across the same set of files `paymentMethod` touched
   on 2026-08-07, Orval regen, WhatsApp message, frontend date picker +
   conditional validation, plus the wider `selectablePoints` rework found in
   review). Do last, and treat it as its own PR given the size — don't fold into
   the same PR as #1/#3/#4. Within #2 itself: land the
   schema/API/`CreateOrderUseCase` validation (with the UTC-safe date parsing)
   and the frontend redesign together — they're one observable fix, same
   reasoning the 2026-08-07 `paymentMethod` PR used — but the buyer-facing
   summary/confirmation UI (fix item 6) can be cut to a fast-follow without
   blocking the rest, since the WhatsApp message alone already closes the loop
   for the primary funnel.

Every numbered issue above should land as its own PR/branch, matching this
repo's existing convention of one fix per plan doc / one concern per PR.
