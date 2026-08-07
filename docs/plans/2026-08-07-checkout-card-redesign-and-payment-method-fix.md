# Checkout card redesign + Order.paymentMethod fix

## Context

Issue 4, the last of the four-issue batch plan
(`2026-08-06-order-status-buyer-login-pickup-checkout-fixes-plan.md`): the
storefront's "Confirmar pedido" step used native `<select>` dropdowns for
delivery type, pickup point, and payment method, and the issue asked for a
card-based redesign instead. Depends on 3a's pickup-point availability data
(`2026-08-06-pickup-point-availability-schema-and-api.md`) to have
something real to show on the pickup-point cards.

**The real bug, found during investigation, not in the original report**:
the payment-method selector was local `useState`, never
`register()`ed/`Controller`-wrapped into the form, and `onSubmit` never
read it — a buyer's chosen payment method was silently dropped from every
order placed through this form. Confirmed via review this wasn't just a
frontend wiring gap: there was nowhere for a payment method to go even if
the frontend sent one — no `Order.paymentMethod` column, no
`CreateOrderDto` field, no `WhatsAppOrderInput` field, so the seller could
never see the buyer's choice either, even reading the WhatsApp handoff
message by hand.

## Approach

- **Scope kept together deliberately.** The plan's one explicit exception
  to "one concern per PR" in this whole batch: the card-selector UI rewrite
  and the `Order.paymentMethod` schema fix landed in the same PR, because
  the UI change is what surfaces the bug (wiring the card selector as a
  real form field is what makes the value exist to persist) and both need
  to land together for the fix to be observably fixed.
- **Schema**: `Order.paymentMethod`, nullable, reusing the
  `PaymentMethodType` enum `PaymentMethodConfig` already defines rather
  than inventing a new one. Wired through `CreateOrderDto` →
  `CreateOrderUseCase` → the `Order` row.
- **WhatsApp message**: `WhatsAppOrderInput`/`buildWhatsAppOrderMessage`
  gained a `paymentMethod` field, rendering `Método de pago: Transferencia
  bancaria` (or the raw value as a fallback for an unrecognized method) —
  the seller now actually sees the buyer's choice in the handoff message
  they already read for every order, not a separate new surface.
- **Response DTOs updated explicitly, not just spread-and-hope**:
  `OrderResponseDto`/`OrderStatusResponseDto`/`CheckoutOrderResponseDto`
  and their hand-maintained `*Row` shadow-type interfaces (which the
  mapper functions spread the raw Prisma row into) all needed the field
  added by hand. Confirmed via the TypeScript compiler error this produced
  (an object-literal-with-spread doesn't get excess-property-checked
  against the declared return type) that this is exactly the mechanism
  behind the `retainedAmount`/`releasedAmount` schema-leak this session
  already flagged as pre-existing and out of scope in the issue-1 PR —
  `paymentMethod` is a deliberate, typed addition here, not another
  instance of that leak.
- **Card selector**: new shared `SelectableCard` primitive — this repo's
  first formal card-selector component, modeled on `product-sheet.tsx`'s
  existing tab-toggle/pill active-className branching pattern rather than
  introducing a new visual language. All three selects (delivery type,
  pickup point, payment method) became `Controller`-wrapped RHF fields
  driving `SelectableCard`s, matching the existing `customerPhone`
  `Controller` pattern already in this form.
- **Pickup-point day-availability** shown via a new pure
  `getPickupAvailability()` helper (`features/checkout/lib/`) — kept as an
  isolated, unit-tested function per the plan's suggestion, rather than
  inlined into the component, specifically because the "next available
  day" wrap-around-the-week computation is exactly the kind of logic worth
  testing without a DOM. Closed-today points still render in the list
  (disabled, with a "No disponible hoy — Próximo día disponible: {day}"
  badge) instead of being hidden, so the buyer can see the full set of
  pickup points and when a closed one reopens.
- **Thumbnails**: adapted from `cart-page-client.tsx`'s existing item-list
  image pattern — confirmed via review that `checkout-summary.tsx` had
  never rendered an image at all before this (39 lines, plain text lines
  only), so this was new work, not a reuse of something already there.

## What else came up

- Same headless-Chrome verification flakiness as the 3b PR (an
  intermittent client-side stall, environment-specific, not caused by this
  change) interrupted the automated click-through partway through.
  Screenshot evidence already confirmed the full redesigned layout
  (breadcrumb, delivery toggle, pickup cards with real day-availability
  data, all 4 payment-method cards) rendering correctly against a real
  seeded cart and store. The remaining unconfirmed step — does clicking
  Submit actually produce the right order — was confirmed by POSTing the
  identical checkout payload directly against the running dev API instead:
  `paymentMethod` persisted on the created `Order`, and the returned
  `whatsappUrl`'s decoded text included `Método de pago: Transferencia
  bancaria`. Test order and a pickup point temporarily toggled
  `closedOverride` for the edge-case screenshot were both cleaned up
  afterward.

## Tests

- `pickup-availability.test.ts` (new): 6 cases, including both
  wrap-around-the-week directions for "next available day" and confirming
  `closedOverride` wins regardless of `openDays`.
- `checkout-form.test.tsx` (new — none existed before): golden-path submit
  payload (delivery type + pickup point + payment method all reach
  `checkout.create`), a closed-today pickup-point card rendering disabled
  and non-selectable, and the delivery-type toggle swapping pickup cards
  for the courier note.
- `checkout.schema.test.ts`/`checkout.api.test.ts`: extended for the new
  `paymentMethod`-required refine and the field forwarding through
  `checkoutApi.submit`.
- `whatsapp/index.test.ts`: new cases for the payment-method line
  (present with a known label, present with an unrecognized method
  falling back to the raw value, and omitted entirely when absent — so
  the existing no-`paymentMethod` test cases keep asserting the exact
  same message shape as before this change).
- Five existing frontend test fixtures shaped like `OrderResponseDto`
  needed a `paymentMethod: null` addition once the generated type gained
  the field (a mechanical fixture update, not a behavior change).
