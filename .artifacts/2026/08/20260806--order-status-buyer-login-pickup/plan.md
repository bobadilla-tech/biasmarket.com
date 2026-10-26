# Plan: order-status-without-payment bug, buyer login bug, pickup-point availability, checkout redesign

Written before execution (deviates from this directory's normal "record after
the work lands" convention, at the user's explicit request, to allow a review
pass before any code is written). Rename/fold into a normal changelog entry
after the work ships, or split per feature if that's cleaner at that point.

## Context

Four GitHub issues reported against the seller dashboard / storefront, batched
into one plan because two of them share root-cause territory in `orders` and two
share territory in `pickup-points`/checkout. Investigated via three parallel
Explore passes (order-status display, customer-auth login, pickup points +
checkout form) before writing this — see "Investigation notes" under each
section for what was ruled out.

---

## 1. Order shows "pagado" with zero payment registered

### Root cause

Not a display bug — the status badges
(`apps/web/features/orders/lib/order-status.ts`, `order-status-badge.tsx`)
correctly render whatever `paymentStatus` the API returns. The actual gap is
that **nothing blocks transitioning an order to `VERIFIED` without any money
registered against it**:

- `apps/api/src/modules/orders/domain/order-status.vo.ts:10-21` —
  `PAYMENT_TRANSITIONS.PENDING_PAYMENT` allows `VERIFIED` directly (by design,
  per the comment there: MVP checkout hands off to WhatsApp, no guaranteed
  `PAYMENT_SUBMITTED` step).
- `apps/api/src/modules/orders/domain/order.entity.ts:24-27` `approvePayment()`
  and `apps/api/src/modules/orders/application/review-payment.usecase.ts:44-60`
  — neither checks `paidAmount > 0` (or that any `OrderPayment` row exists)
  before writing `VERIFIED`.
- Frontend surfaces the same unconditioned "Aprobar" action in three places, all
  with no check on `paidAmount`/`payments.length`:
  `apps/web/features/orders/components/order-detail-sheet.tsx:206-229`,
  `apps/web/features/orders/components/orders-table.tsx:121-142`,
  `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/payments/payments-page-client.tsx:153-155,198-224`.
- `paymentsLocked` (`apps/web/features/orders/lib/order-status.ts:74-86`) hides
  the "Registrar pago" form once `fulfillmentStatus === "COMPLETED"` — matches
  the reporter's "voy a registrar el abono [y ya no puedo / ya dice pagado]".

**Independently confirmed as a live footgun, not just theoretical**: 5 seed
fixtures ship with `paymentStatus: "VERIFIED"` and no `payments` array at all —
`apps/api/scripts/seed/fixtures.ts:338-348, 381-393, 394-407, 541-552,
668-682`.
`apps/api/scripts/seed/apply.ts:272-286` iterates `order.payments ?? []`, so
these seed as `paidAmount: 0`, `paidPercentage: 0`, `paymentStatus: VERIFIED` —
literally the reported bug, in dev data.

### Fix

1. **Backend guard belongs in `ReviewPaymentUseCase.execute`
   (`apps/api/src/modules/orders/application/review-payment.usecase.ts`), not in
   `Order.approvePayment()`** — confirmed via review: the usecase already loads
   the row through `OrderRepository.findRowByIdForStore`, which returns
   `withPaymentSummary(order)` (`order.repository.ts:56`,
   `payment-summary.ts:32-42`), so `row.paidAmount` is already a plain number in
   scope right before `entity.approvePayment()` is called — no extra query
   needed. Putting the check in the entity instead would require adding a
   `paidAmount` constructor param, which cascades into
   `AdvanceFulfillmentUseCase`'s unrelated `new Order(...)` call
   (`advance-fulfillment.usecase.ts:19-24`) and all 7 `new Order(...)` calls in
   `order.entity.spec.ts:8,19,30,35,46,58,64` — avoid that blast radius, guard
   in the usecase. A plain `paidAmount <= 0` check is enough here (no cents
   conversion needed — `paidAmount` is a `.toNumber()`'d Decimal, not a
   float-subtraction result, unlike the comparisons `toCents` exists for in
   `order.controller.ts`). Decide during implementation whether "verified with
   partial payment" (e.g. 30% deposit, per issue #4's mention of a
   minimum-for-pickup threshold) should also be blocked, or only the
   zero-payment case — re-read `docs/core/security-payments.md` §9 before
   deciding, this plan doesn't have enough context on intended partial-verify
   semantics to decide unilaterally.
   - **Guard placement must not disturb the existing terminal-state rejection
     path**: `review-payment.usecase.spec.ts` has a passing test,
     `"rejects approving an already-VERIFIED order"`, expecting
     `execute(..., "approve")` to throw `InvalidOrderTransitionError`. Its mock
     order also has no `payments`, so if the new `paidAmount <= 0` guard runs
     _before_ the existing transition-validity check, this test breaks for the
     wrong reason (new guard's error instead of the transition error). Place the
     guard _after_ the transition check succeeds, so terminal-state orders still
     get `InvalidOrderTransitionError`. Also: several other currently-passing
     tests in this same file (stock-decrement, approval-email) mock an order
     with `paymentStatus: "PENDING_PAYMENT"` and no `payments`, then assert
     `approve` succeeds — once the guard lands these existing mocks need a
     `payments` array added (covering `requiredAmount`), not just new test cases
     appended alongside them.
2. **Frontend guard** — in the three call sites above, disable/hide "Aprobar"
   (or show a confirm dialog surfacing `paidAmount`/`pendingAmount`, consistent
   with how reject already confirms) when `paidAmount <= 0`. Same file set as
   above.
3. **Seed data fix** — give each of the 5 `VERIFIED`-with-no-payments fixtures a
   matching `payments: [...]` entry covering `requiredAmount`, so dev/seeded
   data doesn't itself reproduce the bug and mislead whoever's testing.
4. **Dedupe while touching this code**: `getOrderStatus` is duplicated verbatim
   in `apps/web/features/stats/components/recent-orders-list.tsx:37-82` instead
   of importing from `features/orders/lib/order-status.ts` — fold it into one
   shared implementation. Low-risk, low-priority, but touching adjacent code
   anyway.
5. **Tests**:
   - `order.entity.spec.ts:7-16`
     (`"approvePayment() moves PENDING_PAYMENT to
     VERIFIED"`) constructs an
     `Order` with no payment info and expects `approvePayment()` to succeed
     unconditionally — confirm it stays unaffected once the guard lands in the
     usecase (it should, since the entity itself isn't changing), and add a note
     in the test file if that invariant is worth documenting.
   - New unit test(s) in `review-payment.usecase.spec.ts` for the guard (reject
     `approve` when `paidAmount === 0`, and — if step 1 decides to gate on it —
     a sub-required partial too).
   - New test coverage for `paymentsLocked`
     (`apps/web/features/orders/lib/order-status.ts:74-86`) in the existing
     `apps/web/features/orders/lib/order-status.test.ts` — that file currently
     only tests `getOrderStatus`/`matchesTab`, not this function, despite it
     being the piece that matches the reporter's "went to register the abono and
     couldn't" symptom.
   - New component tests for the three touched call sites — none currently exist
     for `order-detail-sheet.tsx`, `orders-table.tsx`, or
     `payments-page-client.tsx`, so this is "add," not "update."
   - e2e regression in `orders.e2e-spec.ts` mirroring the
     `2026-08-06-order-payment-precision-bug-fix-plan.md` regression-test style
     (confirm it 400s against the _current_ code before the fix lands, confirm
     it passes after).

### Non-goals

- Not redesigning the payment-status state machine beyond adding this one guard
  — `order-status.vo.ts`'s existing transition table stays as-is.
- Not touching `ReviewPaymentUseCase`'s reject path — only the approve path is
  under-guarded.

---

## 2. Buyer login fails with correct credentials; forgot-password sends nothing

### Root cause

Phone-number format mismatch between checkout (where the `Customer` row is
created) and customer-auth (where it's looked up), both hitting an
**exact-string** Prisma `storeId_phone` unique lookup with zero normalization
anywhere in the codebase:

- Checkout: `apps/web/components/ui/phone-input.tsx:43,60` produces
  `"+51987654321"` (dial code glued directly to national number, default country
  Peru per `packages/utils/src/phone-country/index.ts:9,24`), passed verbatim
  through `CreateOrderDto.customerPhone` (no `@Transform`, just
  `@IsString() @MinLength(6)`) into
  `CustomerAccountService.findOrCreateCustomer`
  (`apps/api/src/modules/orders/application/customer-account.service.ts:107-134`),
  stored as-is.
- Login/forgot-password:
  `apps/web/features/customer-auth/components/customer-login-form.tsx` and
  `forgot-password-form.tsx` use a **bare `<input>`** (no country-code selector,
  no `+` default) — a buyer naturally types `"987654321"` or `"51987654321"`,
  not `"+51987654321"`.
- Backend does an exact match on both ends:
  `apps/api/src/modules/customer-auth/customer-auth.service.ts:126-129` (login)
  and `:114-121` (forgotPassword) —
  `prisma.customer.findUnique({ where: {
  storeId_phone: { storeId, phone } } })`,
  no normalization.
- **A third, fourth exact-match `storeId_phone` site exists that the original
  bug report doesn't mention but must be covered to actually close this gap**:
  `CustomerAuthService.updateProfile` (`customer-auth.service.ts:263`, the
  duplicate-phone check) — fed by
  `apps/web/features/customer-auth/components/edit-contact-form.tsx:86-89`'s
  same bare `{...register("phone")}` `<input>`. If left un-normalized, a buyer
  who changes their phone from account settings _after_ this fix ships can
  silently reintroduce the exact bug being fixed. Confirmed reachable path: the
  changed phone lands in `Customer.phone` via
  `customer-account.service.ts:281-284`'s
  `data: { phone:
  customer.pendingPhone, pendingPhone: null }`.
- Login's generic error ("Teléfono o contraseña inválidos" — deliberately the
  same message for "not found" and "wrong password", to avoid enumeration) masks
  that the row is never even found.
- forgotPassword's `if (!customer?.passwordHash || !customer.email) return;` is
  a deliberate no-op for accounts that don't exist (enumeration protection) —
  but here it silently eats the real case of an existing account under a
  differently-formatted phone string, so no email ever sends, by
  design-that-backfires rather than a mailer/Resend config issue (ruled out:
  `sendPasswordResetEmail` is never reached).
- Password hashing itself is consistent (`better-auth/crypto`'s
  `hashPassword`/`verifyPassword` used uniformly) — not implicated.

### Fix

1. **Normalize at write time and read time, in the backend** (defense in depth —
   don't rely solely on frontend formatting, per the investigation's own
   recommendation): add a small `normalizePhone()` helper. Location:
   `packages/utils/src/phone-country/` — that module already exports
   `parsePhoneValue()`/`PHONE_COUNTRIES` (`index.ts:26-46`) with dial-code
   detection logic; build `normalizePhone()` on top of what's already there
   instead of reimplementing dial-code parsing from scratch. Apply it at all
   **four** exact-match sites (not two):
   - `CustomerAccountService.findOrCreateCustomer`
     (`customer-account.service.ts:106`) before the `phone` lookup/create.
   - `CustomerAuthService.login` (`customer-auth.service.ts:129`).
   - `CustomerAuthService.forgotPassword` (`customer-auth.service.ts:116`).
   - `CustomerAuthService.updateProfile`'s duplicate-phone check
     (`customer-auth.service.ts:263`) and the phone-change write path
     (`customer-account.service.ts:281-284`). Verify what happens to phone
     numbers already stored inconsistently in prod (see migration note below)
     before assuming a code-only fix is sufficient.
2. **Frontend**: reuse the existing `PhoneInput` component (with country-code
   selector, same default-country behavior as checkout) on
   `customer-login-form.tsx`, `forgot-password-form.tsx`, **and
   `edit-contact-form.tsx`** (the third site found in review, currently also a
   bare `{...register("phone")}` input at lines 86-89) instead of the bare
   `<input>`, so buyers produce the same string shape they set at checkout by
   construction, not just by luck of normalization.
3. **Data migration concern**: any `Customer` rows already created in prod under
   the old un-normalized flow may have inconsistent `phone` values.
   Before/alongside deploying the normalization fix, write a one-off script (or
   a Prisma migration `README` note, matching this repo's existing pattern of
   hand-run scripts — see `apps/api/scripts/seed/`) to backfill existing
   `Customer.phone` values through the same `normalizePhone()`. **Collisions are
   not auto-mergeable** — two `Customer` rows that normalize to the same phone
   within a store each carry their own `Order`s, `passwordHash`/session state,
   and `pendingEmail`/`pendingPhone` fields; silently merging them is a
   real-identity judgment call a script must not make. The backfill script
   should skip colliding rows, log them for manual review, and apply cleanly to
   everything else (partial completion is the intended outcome, not
   all-or-nothing). **Flag this to the user explicitly before running anything
   against prod data** — this is the one part of this plan that touches real
   customer records outside a normal code review, don't autonomously execute it.
4. **Tests**:
   - Unit tests for `normalizePhone()` covering the exact shapes above
     (`+51987654321` vs `987654321` vs `51987654321` vs `"+51 987 654 321"` all
     normalizing identically).
   - Update/add `customer-auth.service.spec.ts` cases for
     login/forgotPassword/updateProfile with a
     differently-formatted-but-equivalent phone.
   - Extend the **existing** e2e test
     `apps/api/test/customer-account-auth.e2e-spec.ts:144-274` — it already runs
     the full checkout → confirm → register → login → me → updateMe →
     changePassword → logout → forgotPassword loop against one `customerPhone`
     constant (used at lines 154, 163, 208, 270); add a step that logs in (and
     requests a password reset) using a differently _formatted but equivalent_
     phone string, not just the original.
   - **Three existing frontend component tests hardcode the current bare- input
     interaction and will break on the `PhoneInput` swap unless updated**:
     `customer-login-form.test.tsx:42-45,63-66` and
     `forgot-password-form.test.tsx:33-36` both do
     `user.type(screen.getByPlaceholderText(...), "+51988888888")` and assert
     the mutation was called with that exact string — `PhoneInput` splits
     country-code and national-number into separate controls
     (`phone-input.tsx:54-63`), so typing a full `"+51988888888"` string into
     the national-number field would double the dial code
     (`${country.dialCode}${event.target.value}` at `phone-input.tsx:60` →
     `"+51+51988888888"`). Rewrite these tests to interact with `PhoneInput` the
     way `checkout-form`'s existing tests already do (find that pattern and
     mirror it), and check `edit-contact-form.test.tsx` for the same issue given
     the new third call site.

### Non-goals

- Not changing the generic "Teléfono o contraseña inválidos" error message or
  the enumeration-protection no-op in `forgotPassword` — both are intentional
  security choices, orthogonal to this bug.
- Not adding SMS-based password reset or any new auth channel — scope is fixing
  the lookup, not adding a feature.

---

## 3. Pickup-point weekday availability + manual override

### Current state (confirmed via investigation)

`PickupPoint` model (`packages/db/prisma/schema.prisma:378-391`) has only
`label`, `enabled` (permanent on/off), `sortOrder` — no day-of-week data, no
temporary/manual override. The dashboard UI
(`apps/web/features/store-settings/components/delivery-section.tsx:104-160`,
inside the Delivery section of Store Settings, not a separate page as the issue
assumed) is a bare list: `Switch` (enabled) + `Input` (label) + remove button
per row, no per-point detail/edit panel to hang a weekday picker off of. The
storefront checkout
(`apps/web/features/checkout/components/checkout-form.tsx:100-140`) renders
pickup points as flat `<option>`s with no availability info at all — whatever
`findEnabledForSlug`
(`apps/api/src/modules/pickup-points/pickup-points.service.ts:78-85`) returns
(currently just `enabled: true` points) shows unconditionally.

### Fix

1. **Schema**: add to `PickupPoint` —
   - `openDays Int[]` — use JS's native `Date.getDay()` convention (0=Sunday ..
     6=Saturday) rather than inventing one: confirmed via review there is no
     existing stored day/schedule precedent anywhere in this codebase
     (`orders-cron.service.ts` only has a cron string; the one day-of-week usage
     in the repo, `apps/web/features/stats/lib/payment-date-ranges.ts:54`, is a
     runtime `today.getDay()` call using this exact convention) — don't spend
     implementation time hunting for a precedent that isn't there. Empty array
     meaning "no restriction/every day."
   - **Pick `closedOverride Boolean @default(false)` for v1** (not
     `unavailableUntil DateTime?`) — simpler for the seller to operate (one
     toggle to remember to turn back off, vs. picking a date range), and every
     other mention of this field in this plan (API validation,
     `findEnabledForSlug`, `CreateOrderUseCase`'s new check, dashboard UI,
     `checkout-form.tsx`'s fallback, Orval regen, tests) is written in terms of
     this boolean shape — treat `unavailableUntil` as a rejected alternative,
     not an open decision, so the rest of this section doesn't need re-deriving.
     If a dated range genuinely turns out to be required once implementation
     starts, that's a scope change worth flagging back, not a silent
     substitution. New Prisma migration required
     (`packages/db/prisma/migrations/`, `pnpm db:generate` after). No FK/cascade
     concerns — confirmed `PickupPoint.orders` is `onDelete: SetNull` against a
     nullable `Order.pickupPointId`, unaffected by adding new scalar columns.
2. **API**: extend `create-pickup-point.dto.ts`, `update-pickup-point.dto.ts`,
   `pickup-point-response.dto.ts` (all in
   `apps/api/src/modules/pickup-points/dto/`) with the new fields
   (`@IsOptional() @IsArray() @IsInt({each:true}) @Min(0) @Max(6) openDays`,
   `@IsOptional() @IsBoolean() closedOverride`). Update
   `pickup-points.service.ts`'s `create`/`update` to persist them.
   `findEnabledForSlug` needs a decision: filter out closed-today points
   server-side, or return the raw availability data and let the storefront
   decide what to gray out (the mockup's "Estación Central no tiene retiro hoy,
   próximo día disponible: Jue" messaging needs the _next_ available day too,
   which argues for returning full `openDays`/`closedOverride` to the frontend
   rather than filtering server-side — filtering would hide the info needed to
   compute "next available day").
   - **Backend defense-in-depth, matching how issue #2 is handled**: add an
     explicit check in `CreateOrderUseCase.execute`
     (`apps/api/src/modules/orders/application/create-order.usecase.ts:38-54`)
     rejecting a submitted `pickupPointId` that's `closedOverride`'d or outside
     `openDays` for the current day — today that block only checks
     `!point || point.storeId !== store.id || !point.enabled`. Without this, a
     stale client cache or a direct API call can create an order against a point
     that's closed, bypassing whatever the frontend shows. Don't leave this as
     frontend-only the way the initial draft of this plan did.
3. **Dashboard UI**: extend `delivery-section.tsx`'s pickup-point rows with a
   weekday multi-select (checkboxes Lun–Dom) and a "no disponible hoy/esta
   semana" toggle. Given the row is currently a single flat `flex` div with no
   expand/detail state, this likely needs either an inline expanding panel per
   row or a small edit dialog/sheet (check if `Sheet` — already used for
   `order-detail-sheet.tsx` — fits, for UI consistency) rather than cramming 7
   checkboxes into the existing row.
   - **Two hand-maintained frontend files will silently drop the new fields if
     not updated explicitly** (confirmed via review — regenerating the Orval
     client in step 5 does not touch either): the local, hand-written
     `PickupPoint` interface in
     `apps/web/features/store-settings/schemas/delivery.schema.ts` (mirrors
     `PickupPointResponseDto` by hand, per its own comment) must gain
     `openDays`/`closedOverride`; and
     `apps/web/features/store-settings/api/settings.api.ts`'s
     `saveDeliverySettings` (~lines 48-65) explicitly whitelists only
     `label`/`enabled`/`sortOrder` when calling
     `apiClient.pickupPoints.create`/`.update` — extend that whitelist or the
     new UI fields get silently stripped before ever reaching the API.
4. **Storefront checkout**: once Feature 4 (card redesign, below) replaces the
   pickup-point dropdown with cards, each card shows day-availability badges and
   the "not available today, next: Thu" alert per the mockup. If Feature 4 ships
   later than this, `checkout-form.tsx`'s dropdown at minimum should stop
   offering `closedOverride`-blocked points as selectable — don't ship Feature
   3's data model without any storefront consumer of it.
5. **Regenerate OpenAPI + Orval client**:
   `pnpm --filter api generate:openapi
   && pnpm --filter @biasmarket/types generate`,
   commit the diff (per CLAUDE.md's committed-generated-client convention).
6. **i18n**: new copy (weekday checkbox labels, "no disponible hoy/esta semana",
   the "próximo día disponible: Jue" alert text) needs new keys in
   `packages/i18n/es/` and its English counterpart, per this repo's shared i18n
   convention — easy to forget since it's not a "logic" change.
7. **Tests**: `pickup-points.service.spec.ts` new cases for the new fields (file
   already exists, currently covers ownership/CRUD/`findEnabledForSlug`
   only-enabled/sortOrder — no day/override coverage yet); e2e coverage for
   create/update round-tripping `openDays`/`closedOverride` and for
   `CreateOrderUseCase`'s new rejection case; frontend test for the "next
   available day" computation if it's non-trivial (e.g. a pure function, easy to
   unit test in isolation).

### Non-goals

- Not building a full booking/calendar system — weekly-recurring days plus one
  manual override flag/window is the entire scope, per the issue.
- Not changing `enabled` semantics (still the permanent kill switch, independent
  of the new day-scoped fields).

---

## 4. "Confirmar pedido" redesign — cards instead of dropdowns

### Current state (confirmed via investigation)

`apps/web/features/checkout/components/checkout-form.tsx` — all three choices
(delivery type, pickup point, payment method) are native `<select>`s via the
shared `Select` wrapper (`apps/web/components/ui/select.tsx`), stacked in one
plain card, no breadcrumb, no thumbnails beyond what `checkout-summary.tsx`
already shows. No `radio-group`/`toggle-group`/`label`/ `form` primitives exist
in `apps/web/components/ui/` — this redesign introduces the first true
card-selector pattern in the repo. Closest existing precedent:
`apps/web/features/products/components/product-sheet.tsx`'s tab toggle (lines
651-678) and pill/chip multi-select (680-708), both hand-built `Button` +
conditional className, no formal component — model the new card selector on that
same active/inactive className branching and the `store-theme-*` tenant-theming
class convention, for visual consistency with the rest of the storefront.

**Bug found during investigation, not in the original issue, must fix as part of
this redesign — and it's bigger than a frontend wiring fix**: the payment-method
selector is **not wired into the form at all**. It's local `useState`
(`checkout-form.tsx:41-47`, `paymentMethodId`), not a
`register()`ed/`Controller`-wrapped RHF field, and `onSubmit` (lines 77-95)
**never reads `paymentMethodId`** — the buyer's payment-method choice is
silently dropped from the submitted order today. Confirmed via review this is
not just a frontend gap: **there is nowhere for a payment method to go even if
the frontend wired it in.**

- `CreateOrderDto` (`apps/api/src/modules/orders/dto/create-order.dto.ts`, full
  52-line file checked) has no `paymentMethod` field.
- `Order` model (`packages/db/prisma/schema.prisma:209-244`) has no column to
  persist a selected payment method — `deliveryDetails` is delivery-only JSON,
  nothing else fits.
- `WhatsAppOrderInput` (`packages/utils/src/whatsapp/index.ts:7-17`) has no
  payment-method field either, so a chosen method wouldn't even reach the seller
  via the WhatsApp handoff message.
- `checkout.api.ts:14-42`'s `submit`, `use-submit-checkout.ts`, and
  `checkout.schema.ts`'s `buildCheckoutFormSchema` all have hand-typed payload
  shapes with no `paymentMethod` key.

So this is a **schema-sized fix, not a "wrap it in a Controller field" fix**:
new `Order.paymentMethod` column + Prisma migration, `CreateOrderDto` field,
`CreateOrderUseCase` wiring, `WhatsAppOrderInput`/`buildWhatsAppOrderMessage`
update so the seller actually sees the buyer's chosen method, an OpenAPI + Orval
regen, and updates to `checkout.api.ts`/`use-submit-checkout.ts`/
`checkout.schema.ts`. Comparable in size to Feature 3's own schema change — plan
and PR for it as such, don't fold it silently into the card-UI visual work. (The
card-selector UI work and this schema fix are still one PR/change together,
since the UI change is what surfaces the bug and both need to land atomically
for the fix to be observable — just don't underestimate the size going in.)

### Fix

1. Add `deliveryMethodType`/`pickupPointId`/`paymentMethod` as proper
   `Controller`-wrapped RHF fields (matching the existing `customerPhone`
   `Controller` pattern at lines 148-160) — enables click-driven card selection.
   Combined with the schema/DTO/usecase work described above, this closes the
   payment-method-not-submitted bug.
2. Build a shared card-selector primitive (new file, e.g.
   `apps/web/features/checkout/components/selectable-card.tsx`, promote to
   `components/ui/` later only if `store-settings`'s delivery editor — Feature 3
   — ends up wanting the identical visual, per the investigation's note; don't
   promote prematurely).
3. Layout per the issue's mockup: breadcrumb (Tienda → Carrito ✓ → Confirmar),
   2-button toggle for delivery type, pickup-point cards (with the day-badges
   from Feature 3 once that data exists — sequence these two features so this
   one lands after or alongside 3, not before, otherwise the cards have nothing
   to badge), courier cards with coverage text + "shipping cost coordinated via
   WhatsApp" note, 2×2 payment-method grid with icons, product thumbnails in the
   summary, WhatsApp-icon CTA with clarifying subtext. **Product thumbnails are
   new work, not reuse** — confirmed via review that neither
   `checkout-summary.tsx` (39-line file, plain text lines only, no image) nor
   the cart's structurally-equivalent summary sidebar (`CartSummary` in
   `cart-page-client.tsx:23-107`) render an image anywhere. Thumbnails only
   exist in the cart's main _item list_ (`cart-page-client.tsx:206-217`,
   `item.image` + `next/image`) — adapt that pattern into the checkout summary
   rather than looking for something to import from `checkout-summary.tsx`
   itself.
4. **Sequencing note**: since Feature 3's schema/API changes are a prerequisite
   for the pickup-point cards to show real day-availability (rather than
   placeholder/no data), do Feature 3's backend+schema work before or alongside
   this one. The generic card-toggle UI (delivery type, payment method) has no
   such dependency and can go first if sequencing independently is preferred.
5. **Tests**: update/add `checkout-form` component tests (check
   `apps/web/features/checkout/` for an existing test file) for the new card
   interactions; a Playwright/manual smoke pass through the full checkout flow
   in a browser is warranted here per CLAUDE.md's UI-change guidance (golden
   path: pickup with available point, pickup with a closed-today point, courier,
   each of the 4 payment methods) — this is a visual/UX change, type-checking
   alone won't catch a broken submit path.

### Non-goals

- Not changing the WhatsApp handoff mechanism itself (`buildWhatsAppUrl`/
  `buildWhatsAppOrderMessage`) — only the selection UI leading up to it.
- Not redesigning `checkout-summary.tsx`'s cart-line rendering beyond adding
  thumbnails (confirmed via review: it currently renders plain text lines, no
  image at all — see Fix item 3 above) and not touching the cart page's own
  item-list thumbnail rendering, which already works and is only being used here
  as a pattern to adapt, not code to change.

---

## Suggested sequencing for the execution agent

1. **#1 (order status guard)** — smallest, most self-contained, fixes a real
   data-integrity gap. Do first.
2. **#2 (phone normalization)** — backend-first (normalize fn + login/forgot
   fixes), frontend `PhoneInput` reuse second, prod backfill script last and
   only after explicit user sign-off on running it.
3. **#3 (pickup-point schema + API + dashboard UI)** — prerequisite for #4's
   pickup-point cards to be meaningful. Given #3's scope grew during review
   (schema migration, new `CreateOrderUseCase` rejection check, dashboard UI
   with its own Sheet/dialog decision, storefront consumer, i18n, Orval regen),
   split it into **two PRs, not one**: (3a) schema + API +
   `CreateOrderUseCase`'s defense-in-depth check — independently valuable and
   safely shippable even before any UI reads `openDays`/`closedOverride`; (3b)
   the dashboard weekday-editor UI, which depends on 3a's API surface. #4's
   storefront card consumer then depends on 3a (data) but not necessarily 3b
   (seller UI can lag the storefront read path).
4. **#4 (checkout redesign)** — last, depends on #3a's data being available.
   Keep the card-selector UI rewrite and the `Order.paymentMethod` schema fix in
   the **same** PR despite its own size, per the reasoning above (the UI change
   is what surfaces the bug; both need to land together for the fix to be
   observably fixed) — this is the one deliberate exception to "one concern per
   PR" in this plan, called out explicitly so it isn't mistaken for scope creep
   during review.

Every other numbered issue/sub-part above should land as its own PR/branch
(matches this repo's existing convention of one fix per plan doc / one concern
per PR — see how `2026-08-06-order-payment-precision-bug-fix-plan.md` was
deliberately kept separate from the Orval rollout it was found during).
