# Order approval without payment guard

## Context

Reported bug: an order could show "pagado" (VERIFIED) in the seller dashboard
with zero payment ever registered against it. Root cause:
`PAYMENT_TRANSITIONS.PENDING_PAYMENT` in
`apps/api/src/modules/orders/domain/order-status.vo.ts` intentionally allows a
direct `PENDING_PAYMENT -> VERIFIED` transition — MVP checkout hands the buyer
off to WhatsApp instead of collecting an in-app payment proof, so there's no
guaranteed `PAYMENT_SUBMITTED` step, and sellers may approve directly based on
the WhatsApp conversation. But nothing checked `paidAmount > 0` before writing
`VERIFIED`, so a seller mis-click (or a stale/buggy client) could confirm a sale
with no money behind it. 5 seed fixtures independently reproduced the exact bug
in dev data (`VERIFIED` with no `payments` array).

This was issue 1 of a four-issue batch plan
(`2026-08-06-order-status-buyer-login-pickup-checkout-fixes-plan.md`, written
and reviewed before execution); this doc records issue 1 specifically per this
directory's normal after-the-fact convention.

## Approach

- **Backend guard in `ReviewPaymentUseCase.execute`, not `Order.entity`** — the
  usecase already loads the row through `OrderRepository.findRowByIdForStore`
  (which returns `withPaymentSummary(order)`), so `row.paidAmount` is in scope
  right before `entity.approvePayment()` with no extra query. Putting the check
  in the entity would need a new `paidAmount` constructor param, cascading into
  `AdvanceFulfillmentUseCase` and all 7 `new Order(...)` calls in
  `order.entity.spec.ts` for no benefit.
- **Guard placed after the transition check**, not before — a terminal-state
  order (already `VERIFIED`/`REJECTED`) must still fail with
  `InvalidOrderTransitionError`, not the new zero-payment error.
- **Only blocks the zero-payment case, not partial payments.** Re-read
  `docs/core/security-payments.md` §9 as the plan asked: "Approve -> VERIFIED"
  is described purely as a seller review decision against whatever deposit rule
  the store configured (§9.2 step 3) — there's no stated minimum percentage of
  `requiredAmount` gating approval. A store's deposit rule might legitimately be
  30%, and blocking approval below `requiredAmount` would break that flow. So
  the guard is `paidAmount <= 0`, full stop.
- **Frontend**: "Aprobar" stays visible but `disabled` (with a tooltip) at all
  three call sites once `paidAmount <= 0`, rather than hidden — the seller can
  still see the action exists and why it's blocked, consistent with how the
  reject flow already surfaces state via a confirm dialog.
- **Seed data**: gave each of the 5 already-`VERIFIED` fixtures a matching
  `payments` entry covering `requiredAmount`, computed by hand from each
  fixture's product price + delivery cost (seed fixtures have no
  `requiredAmount` field directly — `apply.ts` derives it from
  `subtotal + deliveryCost` at seed-apply time).
- **Dedupe**: `features/stats/components/recent-orders-list.tsx` had a verbatim
  copy of `getOrderStatus` instead of importing the one in
  `features/orders/lib/order-status.ts` — folded into one implementation while
  touching adjacent code.

## What else came up

- The plan's e2e regression test needed to add its own inline checkout call
  rather than reuse the file's shared `checkout()` helper, because two
  pre-existing, unrelated problems blocked every test in `orders.e2e-spec.ts`
  locally: two pending Prisma migrations in the dev DB (applied via
  `prisma migrate deploy`, unrelated schema catch-up), and the shared
  `checkout()` helper never passing a `variantId` even though
  `ProductsService.create` auto-creates a "Default" `ProductVariant` whenever a
  top-level `stock` field is given — `CreateOrderUseCase` then correctly rejects
  a variant-less item with "Debes seleccionar una variante". Fixed the helper to
  pass the variant id captured from product creation, since otherwise this e2e
  file couldn't be used to verify anything.
- **Found, not fixed (flagged for a separate PR)**: `OrderResponseDto` /
  `OrderStatusResponseDto` don't declare `Order.retainedAmount` /
  `releasedAmount` (added by the `20260804201310_cancelretain` migration), but
  the actual JSON response includes them anyway since the controllers return the
  raw Prisma row rather than an explicitly-mapped DTO instance — a real
  response/schema drift on every order-returning endpoint. Caught because it
  400s `orders.e2e-spec.ts`'s `assertMatchesSchema` check on 4 pre-existing
  tests unrelated to this bug; regenerating `openapi.json` produced no diff,
  confirming this isn't stale-spec drift but an actual DTO/response mismatch.

## Tests

- `review-payment.usecase.spec.ts`: new cases for zero-payment rejection and
  partial-payment approval, existing approve-path mocks updated with a
  `payments` array so they still exercise the intended path post-guard.
- `order-status.test.ts`: new `paymentsLocked` coverage (previously untested).
- New component tests for `order-detail-sheet.tsx`, `orders-table.tsx`,
  `payments-page-client.tsx` (none existed before) covering the disabled
  "Aprobar" state.
- `orders.e2e-spec.ts`: new regression test, confirmed 200 pre-fix / 400
  post-fix via a temporary stash of the usecase change.
