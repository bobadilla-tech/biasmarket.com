# Orders module hardening

**Status:** Implemented 2026-08-08. See "Implementation notes" at the bottom for
what shipped, the one deviation from this plan's suggested fix, and why.

**Original status (pre-implementation):** written ahead of the work, per audit
follow-up request — deviates from this directory's usual "record after it lands"
convention.

**Source:** `docs/audits/audit-2026-08-08.md` §6, §12 (critical finding #1), §16
(#1).

## Context

The 2026-08-08 audit found the order state machine well-built and already
tested, but flagged one unresolved concurrency bug and two smaller correctness
gaps in the same module, all worth fixing together since they touch the same
files and should go through one coherent review rather than three separate diffs
racing each other.

## Severity Classification

- **Problem 1 (stock-hold race condition) — HIGH.** Verified still live at
  `create-order.usecase.ts:243-253`: the read (`tx.productVariant.findUnique`),
  the compare, and the write (`tx.productVariant.update`) are three separate
  steps with no `FOR UPDATE`/atomic guard, and no code anywhere in
  `apps/api/src` overrides Prisma's default Postgres transaction isolation
  (`READ COMMITTED`), so nothing at the DB level closes the gap either. This is
  a real, currently-exploitable overselling path on exactly the "limited drop"
  scenario the product is built for, it's uncovered by any existing test (see
  the corrected note in Problem 1 below on why the unit suite specifically can't
  catch it), and it has direct revenue/trust impact — ships wrong when a drop
  actually gets contested traffic.
- **Problem 2 (AuditLog coverage gaps) — MEDIUM.** Confirmed
  `advance-fulfillment.usecase.ts` writes no `AuditLog` row at all. For
  `addPayment` the gap is narrower than the plan originally stated (see the
  correction below): the branch that reaches full payment already gets an audit
  row for free via the delegated `ReviewPaymentUseCase.execute()` call; only the
  partial-payment branch is actually silent. Real gap, worth closing (a seller
  dispute over "who advanced this to IN_TRANSIT" or "was this partial payment
  ever recorded" has no paper trail), but low blast radius — these aren't the
  disputed money-decision actions (approve/reject/ cancel already are covered)
  and nothing downstream depends on the log existing.
- **Problem 3 (response DTO drift) — RESOLVED, no longer a real problem.**
  Spot-check against the current code shows both `OrderResponseDto` and
  `OrderStatusResponseDto`
  (`apps/api/src/modules/orders/dto/order-response.dto.ts`) already declare
  `retainedAmount`, `releasedAmount`, and `releasedResolution`, matching the
  `Order` Prisma model field-for-field. This was fixed in commit `e23314f`
  ("fix(customers): display all customers with registered orders", 2026-08-07) —
  one day before this audit and this plan were written, so both were working
  from stale information. Rated LOW/RESOLVED rather than dropped entirely
  because it's still worth a verification step (see corrected Problem 3 below)
  rather than silently removing it — no code change is needed.

## Problem 1 — stock-hold race condition (the important one)

`apps/api/src/modules/orders/application/create-order.usecase.ts:243-253` checks
variant availability (`variant.stock - variant.reserved >=
item.quantity`) with
a plain `findUnique` + `update` inside the transaction — no row lock.
**Correction:** the `PickupPoint` availability check that _does_ use
`FOR UPDATE` is not "a few lines later" — it's earlier in the same transaction,
at line 128 (`SELECT * FROM "PickupPoint" ... FOR UPDATE`), about 115 lines
before the unlocked variant check. Same file, same missing-pattern point stands,
just correcting the direction so whoever implements this doesn't go looking
downward from line 253 for the reference implementation. Under concurrent
checkout requests for the same limited-stock variant, two buyers can both pass
the availability check before either write commits — real overselling risk on
exactly the "limited drop" scenario this product exists for.

**Fix:** apply the same locking pattern already used for `PickupPoint` in this
file to the variant-availability check — either a `SELECT ... FOR
UPDATE` read
before the compare, or restructure the check+decrement into a single conditional
`UPDATE ... WHERE reserved + quantity <= stock RETURNING
*` so the database
enforces atomicity instead of the application. Prefer whichever pattern is more
consistent with how `PickupPoint` already does it in this same file — don't
introduce a second locking idiom if one already exists here.

Write a test that simulates two concurrent `CreateOrderUseCase.execute()` calls
against a variant with `stock=1, reserved=0` and asserts exactly one succeeds
and one gets a clean "out of stock" rejection (not a DB constraint crash, not a
silent oversell). **This must be an e2e test
(`apps/api/test/orders.e2e-spec.ts`), not a unit spec.** Per CLAUDE.md, unit
tests (`*.spec.ts`) inject a fake `PrismaService` via `useValue` and never touch
a real database — that stub has no real transaction/row-locking semantics, so
"two concurrent calls" against it would race against an in-memory object, not
prove anything about actual Postgres serialization. Only the e2e suite (real
`AppModule`, real Postgres) can actually exercise the lock and catch a
regression if it's ever removed.

## Problem 2 — AuditLog coverage gaps

`AuditLog` rows are written on payment approve/reject
(`review-payment.usecase.ts:143-154`) and cancellation
(`cancel-order.usecase.ts:135-151`), but not on fulfillment advances
(`advance-fulfillment.usecase.ts`). **Correction on `addPayment`
(`order.controller.ts:315-437`): the gap is narrower than originally stated, not
a blanket miss.** When a recorded payment reaches the full `requiredAmount`, the
controller calls `this.reviewPayment.execute(...)` (line ~427) to drive the
`VERIFIED` transition — and that delegated call already writes an `AuditLog` row
(`action: "payment.approved"`) via the existing
`review-payment.usecase.ts:143-154` code path. The actual silent case is
narrower: a **partial** payment (`nextStatus === "PARTIALLY_PAID"`, lines
412-418) writes the `OrderPayment` row and updates `paymentStatus` inside its
own `$transaction`, with no audit entry at all. Scope the fix to that branch
specifically — don't add a second, redundant `AuditLog` write to the
full-payment branch, it's already covered.

Two implementation details the original plan missed:

- `AdvanceFulfillmentUseCase` currently only injects `OrderRepository`, not
  `PrismaService` — it never opens a transaction (`saveStatus` is called
  directly, un-transacted). Adding an `AuditLog` write here means either
  injecting `PrismaService` and wrapping the status update + audit write in a
  `$transaction` (matching how `review-payment`/`cancel-order` keep their status
  mutation and audit row atomic), or adding a small `OrderRepository` helper
  that does both. Don't just bolt an un-transacted `auditLog.create()` after the
  existing `saveStatus()` call — that reintroduces the exact "write succeeded,
  audit didn't" gap this problem is trying to close.
- Match `cancel-order.usecase.ts`'s metadata convention, not
  `review-payment.usecase.ts`'s — `review-payment.usecase.ts:152` writes an
  empty `metadata: {}`, which is technically "the existing shape" but carries no
  information. `cancel-order.usecase.ts:141-149` populates `metadata` with the
  actual fields relevant to the decision (`resolution`, `retainedAmount`, etc.)
  — that's the more useful precedent to follow here. For fulfillment advances,
  record at least `{ fromStatus, toStatus }`; for the partial-payment
  `addPayment` branch, record at least
  `{ amount, method, resultingPaymentStatus }`.

## Problem 3 — response DTO drift (already fixed — verify only)

**Correction: this is already resolved in the current codebase, no DTO change is
needed.** The original finding
(`docs/plans/2026-08-06-order-approval-without-payment-guard.md`, "found, not
fixed") was accurate on 2026-08-06, but commit `e23314f` ("fix(customers):
display all customers with registered orders", 2026-08-07) already added
`retainedAmount`/`releasedAmount` to both DTO classes, and both also already
declare `releasedResolution`. Checked
`apps/api/src/modules/orders/dto/order-response.dto.ts` directly against the
`Order` model in `packages/db/prisma/schema.prisma`: `OrderResponseDto` and
`OrderStatusResponseDto` now declare every scalar field the model has,
field-for-field. This audit and this plan were both written 2026-08-08, one day
after the fix landed, so both were working from a stale snapshot.

**Revised scope:** don't touch the DTO files. Instead, as part of this plan's
verification pass, confirm `orders.e2e-spec.ts`'s `assertMatchesSchema` checks
(the ones that caught this the first time) are green, and treat that as closing
this item — no application code change required for Problem 3.

## Files likely touched

- `apps/api/src/modules/orders/application/create-order.usecase.ts` (Problem 1)
- `apps/api/test/orders.e2e-spec.ts` (Problem 1 — new concurrency test; must be
  e2e, not `create-order.usecase.spec.ts`, per the correction above about the
  fake `PrismaService` stub)
- `apps/api/src/modules/orders/application/advance-fulfillment.usecase.ts`
  (Problem 2 — also needs a `PrismaService` injection added to its constructor,
  it doesn't have one today)
- `apps/api/src/modules/orders/orders.module.ts` (Problem 2 — only if
  `AdvanceFulfillmentUseCase`'s new `PrismaService` dependency needs a provider
  wiring change, check before assuming it does)
- `apps/api/src/modules/orders/infrastructure/order.controller.ts` (Problem 2 —
  `addPayment`'s partial-payment branch only, lines ~412-418)
- `apps/api/src/modules/orders/dto/*.ts` — **not touched.** Problem 3 is already
  fixed (see above); left here only so the "files likely touched" list doesn't
  silently imply a DTO edit is still expected.

**Note for whoever executes this:** other concurrent plans also touch
`apps/api/src/modules/orders/infrastructure/order.controller.ts` (the
payment-proof-image-access-control plan touches the payment/image endpoints in
this same file). Re-read the file immediately before editing if you haven't
touched it in a while this session — don't assume your last read is still
current.

## Verification

- `pnpm --filter api test` (unit) — existing `orders` specs pass; no unit spec
  is expected to change for Problem 1 (its test lives in e2e — see above).
- `pnpm --filter api test:e2e` locally (requires a real Postgres per CLAUDE.md —
  CI doesn't run this, so it must be run by hand) — confirm the
  `orders.e2e-spec.ts` flow still passes, the new Problem 1 concurrency test
  passes, and the pre-existing `assertMatchesSchema` checks (Problem 3) are
  still green with no code change needed to keep them that way.
- `pnpm typecheck`.

## Definition of done

No known path to oversell a limited-stock variant under concurrent checkout,
proven by a real-Postgres e2e test (not a unit-level simulation); every
payment-decision-adjacent action that wasn't already covered (fulfillment
advance, partial seller-recorded payment via `addPayment`) writes an `AuditLog`
row — approve/reject/cancel and full-payment `addPayment` were already covered
before this plan; declared response DTOs match actual response shape (already
true — Problem 3 needs verification, not a code change).

## Implementation notes (2026-08-08)

- **Problem 1 — shipped with the second fix option, not `FOR UPDATE`.** The plan
  offered two equivalent options: a `SELECT ... FOR UPDATE` read (matching
  `PickupPoint`) or a single conditional
  `UPDATE ... WHERE reserved + quantity
  <= stock RETURNING *`. Went with the
  atomic `UPDATE` instead of copying the `FOR UPDATE` pattern verbatim:
  `FOR UPDATE` here would mean `SELECT * FROM
  "ProductVariant" ... FOR UPDATE`
  via `$queryRaw`, and Prisma's raw-query path doesn't rehydrate `Decimal`
  columns into `Prisma.Decimal` instances — it returns them as plain
  strings/numbers. `ProductVariant.priceOverride` is a `Decimal` column the
  surrounding code calls `.times()` on; a raw-query read would have silently
  handed back a non-Decimal value for that field. The conditional
  `UPDATE ... RETURNING *` has the same theoretical issue but never exercises it
  in practice, since the code keeps using the original typed `findUnique` result
  for `priceOverride`/`name` and only reads `stock`/`reserved`/`id` off the
  raw-returned row (all plain ints/strings, no Decimal fields touched). Net
  effect matches the plan's intent — DB-enforced atomicity, no app-level race —
  just via the option that didn't require introducing a raw-query Decimal
  footgun. See `create-order.usecase.ts:243-266`.
- **Problem 2 — shipped exactly as scoped.** `AdvanceFulfillmentUseCase` now
  injects `PrismaService` and wraps `saveStatus` + `auditLog.create` in one
  `$transaction` (`fromStatus`/`toStatus` in metadata); no `orders.module.ts`
  change was needed (`PrismaService` is `@Global()`). The `addPayment`
  partial-payment branch writes `payment.partial` with
  `{ amount, method, resultingPaymentStatus }`, inside the same transaction as
  the existing `OrderPayment` create — the full-payment branch was left alone,
  per the plan.
- **Problem 3 — verified, not touched**, as the plan expected: both DTOs still
  declare `retainedAmount`/`releasedAmount`/`releasedResolution`, and the e2e
  suite's `assertMatchesSchema` checks are green.
- **Concurrency with other in-flight plans, confirmed harmless.** The
  payment-proof-image-access-control plan landed its `getPaymentImage` endpoint
  in `order.controller.ts`/`order.repository.ts` while this work was in
  progress, as this plan's own note anticipated. Re-read both files after that
  landed; the two changes touch disjoint code (their new endpoint vs. this
  plan's edit inside the existing `addPayment` partial-payment branch) and both
  unit and e2e suites pass with both changes present.
- **Verification actually run:** `pnpm --filter api test` (379 passed),
  `pnpm --filter api test:e2e` against a real local Postgres — all 7
  `orders.e2e-spec.ts` tests pass including the new stock=1 concurrent-checkout
  test (one 201, one clean 400 "Stock insuficiente", `reserved` ends at 1, no DB
  constraint crash), and `pnpm typecheck` clean.
