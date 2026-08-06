# Fix: Order payment-summary float-precision bug

Found and confirmed live during the Orval rollout's Batch 4 (`Order`/ `Checkout`
— see `docs/plans/2026-08-05-orval-rollout-batch-4-order-checkout-plan.md`'s
execution notes), not fixed there on purpose (out of scope for a DTO-authoring
migration). This doc is the dedicated fix. Independent of the Orval rollout — do
this on its own branch/PR, not bundled with Batch 5/6.

## The bug

`OrderRepository.withPaymentSummary`
(`apps/api/src/modules/orders/infrastructure/order.repository.ts`, private
method) computes three fields — `paidAmount`, `pendingAmount`, `paidPercentage`
— using plain JS `Number` arithmetic on money:

```ts
const paid = (order.payments ?? []).reduce(
  (sum, payment) => sum + Number(payment.amount),
  0,
);
const required = Number(order.requiredAmount);
return {
  ...order,
  paidAmount: paid,
  pendingAmount: Math.max(required - paid, 0),
  paidPercentage: required > 0 ? Math.min((paid / required) * 100, 100) : 0,
};
```

`order.requiredAmount`/`payment.amount` are real `Prisma.Decimal` values
(`@db.Decimal(10, 2)` columns) — converting to `Number` and subtracting hits
ordinary IEEE-754 float error. Confirmed live via a standalone dev-server script
(not part of the committed test suite — see "What's missing" below): a `99.99`
order with a `40.00` payment produces `pendingAmount: 59.989999999999995`, not
`59.99`.

This isn't just a cosmetic display bug. `OrderController.addPayment`
(`apps/api/src/modules/orders/infrastructure/order.controller.ts`) guards
against overpayment using that same imprecise value:

```ts
if (numericAmount > order.pendingAmount) {
  throw new BadRequestException("El abono excede el saldo pendiente");
}
```

Confirmed live: `POST /stores/:storeId/orders/:orderId/payments` with
`amount: 59.99` against that exact order returns `400` — **a seller who types in
exactly the amount the UI shows as owed gets rejected**, for an order that is
not actually overpaid. This can block a real order from ever reaching `VERIFIED`
via the normal partial-payment flow (the seller has to either overpay slightly,
which then risks the opposite problem — check
`nextPaid >= Number(order.requiredAmount)` a few lines down, same imprecision,
different direction — or fall back to the `review` endpoint's manual approve,
bypassing the amount check entirely).

## Root cause, precisely

`Number(decimal) - Number(decimal)` discards `Prisma.Decimal`'s exact base-10
representation before subtracting. `Prisma.Decimal` (re-exported from
`@biasmarket/db`) already carries the real
[decimal.js](https://mikemcl.github.io/decimal.js/) arithmetic API — `.plus()`,
`.minus()`, `.times()`, `.dividedBy()`, `.toNumber()`, and the static
`Decimal.max()` — this repo just isn't using it here. **Verify the exact method
names against the installed version before writing code** (`packages/db`'s
`node_modules/.pnpm/decimal.js*` or wherever the Prisma 7 + `@prisma/adapter-pg`
combination vendors it — CLAUDE.md notes this repo is on Prisma v7 with the
driver-adapter setup, confirm `Prisma.Decimal`'s exact export surface hasn't
changed shape there).

## This bug is duplicated three times, not once

The exact same `withPaymentSummary` logic — same bug, same shape — is
copy-pasted into three places, confirmed by reading each:

1. `OrderRepository.withPaymentSummary`
   (`apps/api/src/modules/orders/infrastructure/order.repository.ts`,
   `Prisma.Decimal`-typed) — feeds `Order.findAll`/`findOne`/`addPayment`. The
   one with real user-facing consequences (the overpayment guard above).
2. `CustomersService.withPaymentSummary`
   (`apps/api/src/modules/orders/application/customers.service.ts`, structurally
   typed `{ toString(): string }` instead of `Prisma.Decimal` directly, but
   identical arithmetic) — feeds `Customers.getOne`'s nested `orders` list and
   (separately, same file) a `lifetimeSpend` reduction at line ~79 that has the
   identical `Number(payment.amount)` pattern.
3. `StatsService.withPaymentSummary`
   (`apps/api/src/modules/stats/stats.service.ts`, `Prisma.Decimal`-typed) —
   feeds `Stats.getOverview`'s recent-orders list. Also worth checking
   `revenueAgg`/other aggregate reads in the same file
   (`Number(revenueAgg._sum.amount ?? 0)` at ~line 128, `Number(p.amount)` sums
   at ~line 198) for the same class of issue — read the whole file, don't assume
   only `withPaymentSummary` itself needs fixing.

Fix all three, from one shared implementation — not three independently patched
copies that can drift again the next time someone edits one and forgets the
others.

## Proposed fix

1. **New shared helper**: `apps/api/src/common/payment-summary.ts` +
   `payment-summary.spec.ts` (matches this app's existing convention for a small
   cross-module helper — see `apps/api/src/common/public-list-query.ts` for the
   shape/precedent). Exports something like:

   ```ts
   import type { Prisma } from "@biasmarket/db";

   export interface PaymentSummary {
     paidAmount: number;
     pendingAmount: number;
     paidPercentage: number;
   }

   export function computePaymentSummary(
     requiredAmount: Prisma.Decimal,
     payments: { amount: Prisma.Decimal }[],
   ): PaymentSummary {
     // Sum and subtract in Decimal space — exact base-10 arithmetic — and
     // only call `.toNumber()` once, at the very end, on each final value.
     // This is the actual fix: it's not that the DTO fields become
     // Decimal-as-string (they stay `number`, per the existing convention —
     // see order-response.dto.ts's module comment on why `paidAmount` etc.
     // are plain numbers, not the usual money-as-string case), it's that the
     // *arithmetic producing that number* stops going through float
     // subtraction.
   }

   // Convenience wrapper matching the three existing call sites' shape.
   export function withPaymentSummary<
     T extends {
       requiredAmount: Prisma.Decimal;
       payments?: { amount: Prisma.Decimal }[];
     },
   >(order: T): T & PaymentSummary {
     return {
       ...order,
       ...computePaymentSummary(order.requiredAmount, order.payments ?? []),
     };
   }
   ```

   Confirm the exact `Prisma.Decimal` method names compile before assuming the
   sketch above is correct — this is pseudocode, not verified code.

2. **Replace all three private `withPaymentSummary` methods**
   (`order.
   repository.ts`, `customers.service.ts`, `stats.service.ts`) with
   calls into the shared helper. `customers.service.ts`'s structurally-typed
   version needs to actually import `Prisma.Decimal` as the real type now (it
   was avoiding that import before, for no fixable reason once this is
   centralized). Also fix `customers.service.ts`'s separate `lifetimeSpend`
   reduction (~line 79) and any of `stats.service.ts`'s other
   `Number(...amount)` aggregate reads that have the same bug, once you've read
   the full file and confirmed which ones are real money computations vs.
   display-only.

3. **Harden `OrderController.addPayment`'s overpayment guard specifically** (the
   one with real user-facing consequences) with a belt-and-suspenders
   round-to-cents comparison, on top of the root-cause fix in step 1 — money
   guards deserve defense in depth, not just "the upstream value should be
   correct now":

   ```ts
   const toCents = (n: number) => Math.round(n * 100);
   if (toCents(numericAmount) > toCents(order.pendingAmount)) {
     throw new BadRequestException("El abono excede el saldo pendiente");
   }
   ```

   Apply the same treatment to the `nextStatus` computation a few lines down
   (`nextPaid >= Number(order.requiredAmount)`) — same class of boundary
   comparison, same fix shape (compare in cents, not raw floats).

4. **Tests**:
   - Unit tests for the new `computePaymentSummary`/`withPaymentSummary` helper
     (`payment-summary.spec.ts`) — the actual regression case:
     `requiredAmount: 99.99`, one payment of `40.00`, assert
     `pendingAmount === 59.99` (not `59.989999999999995`). Cover a few more
     float-trap amounts while you're there (the classic `0.1 + 0.2` family —
     e.g. required `100.00`, payments `[33.33, 33.33, 33.34]`, assert exact zero
     pending, exact 100 `paidPercentage`).
   - Update `order.controller.spec.ts`'s two `addPayment` unit tests if their
     mocked `pendingAmount`/`requiredAmount` fixture values need adjusting for
     the new cents-based comparison (check, don't assume they still pass
     unmodified).
   - **New e2e regression case** in `apps/api/test/orders.e2e-spec.ts` (the
     existing spec's "full payment" test pays the entire `requiredAmount` in one
     shot, which never exercised the subtraction bug at all — a gap worth
     closing): create an order whose `requiredAmount` has a real float-trap
     shape (e.g. 3× a price with cents, like the `33.33` line amount above), pay
     it in two partial installments, and assert the second payment — for
     **exactly** the displayed `pendingAmount` — is accepted and reaches
     `VERIFIED`. This is the regression test that would have caught the bug
     before it shipped; write it to fail against the old code first (temporarily
     revert the fix locally, confirm the new test fails with the same 400 the
     live smoke test hit, then re-apply the fix) if you want real confidence
     it's testing the right thing.
   - Re-run `customers.e2e-spec.ts`/`stats`-related tests if they exist and
     assert on `lifetimeSpend`/revenue numbers — grep for existing coverage
     before assuming there's a gap there too, `Customers`/`Stats` aren't
     migrated to the generated client yet (Batch 5/6) so any existing tests for
     them are still on the old pattern.

5. **Verify**: `pnpm --filter api test && pnpm --filter api test:e2e`,
   `pnpm --filter api typecheck`. This is a backend-only fix — no DTO shape
   changes (the response fields are still `number`, same as before,
   `packages/types`/`apps/web` need no regeneration or changes at all, confirm
   nothing in `apps/web` needed touching once done). A dev-server smoke test
   repeating the exact scenario that found this bug (checkout a `99.99` order,
   pay `40.00`, then pay exactly the displayed `pendingAmount`) is worth doing
   once more, live, to double-check the fix holds outside the test suite too —
   see `2026-08-05-orval-rollout-batch-4-order-checkout-plan.md`'s "Batch 4
   execution notes" for the shape of that script (it's what found this bug in
   the first place).

## Non-goals

- Not touching the Orval/DTO rollout (Batches 5/6) — this is a pure backend bug
  fix, unrelated tags, do it as its own change.
- Not introducing a new npm dependency (`decimal.js` standalone, `dinero.js`,
  etc.) — `Prisma.Decimal` already gives exact decimal arithmetic for free,
  already a transitive dependency via `@biasmarket/db`. Only reach for a new
  dependency if `Prisma.Decimal`'s API surface turns out not to cover what's
  needed here (unlikely — sum/subtract/multiply/divide/compare is exactly what
  decimal.js is for).
- Not changing the response DTO shapes (`OrderResponseDto` etc. from Batch 4) —
  `paidAmount`/`pendingAmount`/`paidPercentage` stay `number` fields, per the
  existing, correct convention (they're computed aggregates, not stored Decimals
  — same reasoning as `Stores.findFeatured`'s `revenue` field). Only the
  _arithmetic_ producing those numbers changes.
- Not auditing every `Number(...)` call in the codebase for float-precision risk
  as a general sweep — scoped to the three confirmed `withPaymentSummary`
  duplicates plus the two `OrderController.addPayment` comparisons this doc
  names explicitly. If you notice another instance while in there, note it,
  don't silently expand scope without flagging it.

## What's missing from this write-up

The live confirmation of this bug happened via a throwaway Node script against a
running dev server during the Batch 4 session, not a committed test — there is
no automated regression test for this bug yet. Writing one (step 4 above) is
part of this fix, not optional cleanup.
