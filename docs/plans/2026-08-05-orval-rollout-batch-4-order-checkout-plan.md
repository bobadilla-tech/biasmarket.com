# Orval client rollout — Batch 4 (`Order` + `Checkout`)

Batches 1–3 are done and landed (`Products`; `Categories`/`Notifications`/
`Contact`/`Suggestions`/`StoreSections`;
`DeliveryConfig`/`PublicDeliveryConfig`/
`PaymentConfig`/`PublicPaymentConfig`/`PickupPoints`/`PublicPickupPoints`/
`Stores`/`MyStores`). This doc is the focused handoff for Batch 4 specifically —
`docs/plans/2026-08-05-orval-rollout-batches-3-6-plan.md` still owns the overall
"what's left" list (Batches 5–6) and the per-module recipe; this doc distills
what's already known about `Order`/`Checkout` plus the real gotchas the last
three batches hit, so the next session doesn't rediscover them.

## Read these first, in order — same requirement every batch has had

1. [`2026-08-04-nestjs-openapi-client-generation-plan.md`](2026-08-04-nestjs-openapi-client-generation-plan.md)
   — backend plumbing, money/Decimal-as-string rule, `PluginMetadataGenerator`
   failure modes, the e2e contract-test pattern.
2. [`2026-08-04-typed-sdk-client-followups.md`](2026-08-04-typed-sdk-client-followups.md)
   — why Orval, the `operationName`/reserved-word remap, the `api.schemas.ts`
   collision, the `.js`-extension postprocess step.
3. [`2026-08-04-orval-client-rollout-plan.md`](2026-08-04-orval-client-rollout-plan.md)
   — per-module recipe (steps 1–9), original batch list. Read "Batch 1" and
   "Batch 2 execution notes" at the bottom.
4. [`2026-08-05-orval-rollout-batches-3-6-plan.md`](2026-08-05-orval-rollout-batches-3-6-plan.md)
   — read the whole thing, but **"Batch 3 execution notes" at the bottom is the
   one section from this list most likely to save real time this batch**: it
   documents a genuine `FindAllParams` naming collision (fixed once, in
   `orval.config.ts`'s `operationName`, already fixed — nothing to redo), a
   `nullable`-class-typed-field gap in `test/schema-assert.ts`'s `resolveSchema`
   (also already fixed), and a repo-wide test-isolation gap in
   `apps/web/vitest.config.ts` (also already fixed). None of these need
   re-fixing; they're mentioned so this session doesn't waste time thinking
   they're new.
5. `apps/web/AGENTS.md`'s OpenAPI note — current migrated-tags list and the
   `[methodName, typeName]` `operationName` convention.

`apps/web/features/products/` (money + upload, multi-shape DTOs) and
`apps/web/features/stores/` (money-adjacent aggregates, deeply-nested public
joins, a real pre-existing bug found and documented rather than fixed) are the
two closest reference points for this batch — `Order` is money + upload again,
_and_ has the sensitive optimistic-update UX `Products` never needed.

## Why this batch is risky — read before writing any DTO

`Order` is the **second and last money-bearing module with real financial
consequences** after `Products` (per the original plan's gate) — but it's a
strictly harder case than `Products` was:

- **Every `Order` read is server-computed, not a flat row.**
  `OrderRepository.findRowByIdForStore`/`findManyForStore`
  (`apps/api/src/modules/orders/infrastructure/order.repository.ts`) both run
  every row through `withPaymentSummary()`, which adds three **plain `number`**
  fields — `paidAmount`, `pendingAmount`, `paidPercentage` — computed from
  summing `OrderPayment.amount` (a `Decimal`) via `Number(...)`. These are
  **not** the usual Decimal-as-string case: like `Stores.findFeatured`'s
  `revenue` field (Batch 3), they're already lossy JS numbers by the time the
  service returns them, so the DTO fields should be `number`, not `string` —
  typing them `string` here would be the type lie, not the fix. `totalAmount`/
  `requiredAmount`/`OrderItem.unitPriceAtPurchase`/`OrderPayment.amount`, by
  contrast, **are** real `Prisma.Decimal` fields straight off the row and need
  the normal string convention.
- **`findRowByIdForStore` has a live try/catch fallback with a different
  `include` shape on each branch**, and the whole method is currently typed
  `let order: any`. Read the comment context: if the `payments` relation query
  fails (looks like defensive code for an environment where the `OrderPayment`
  table/migration might not exist yet), it retries without `payments` and
  manually sets `order.payments = []`. Giving this an honest
  `Promise<OrderResponseDto>` return type on the controller means either (a)
  normalizing both branches to the same shape before returning (already true
  functionally — `payments` is always an array either way) so one DTO covers
  both, or (b) leaving a narrow, well-commented gap. Don't skip reading this
  method fully before drafting the DTO; it's the least straightforward `any` in
  the codebase seen so far in this rollout.
- **`Checkout.create` returns a structurally different, less-enriched Order
  shape than every `Order` module endpoint.** `CreateOrderUseCase.execute`
  (`apps/api/src/modules/orders/application/create-order.usecase.ts`) returns
  `{ order, whatsappUrl }` where `order` comes from
  `tx.order.create({ ..., include: { items: true } })` — no `product`/`variant`
  join on items, no `payments`, and **no
  `paidAmount`/`pendingAmount`/`paidPercentage`** (never passed through
  `withPaymentSummary`). Do not reuse `OrderResponseDto` for this endpoint's
  response — it needs its own, smaller DTO (e.g.
  `CheckoutOrderResponseDto`/`CheckoutResultResponseDto`), and the existing
  frontend `checkoutResultSchema`
  (`features/checkout/schemas/checkout.schema.ts`) already only reads
  `order.id` + `whatsappUrl`, so there's no pressure to over-model this one —
  keep it narrow and honest to what `CreateOrderUseCase` actually returns, don't
  retrofit the full `Order` shape onto it.
- **`OrderController.addPayment` is the money-critical endpoint**: validates the
  abono amount against `pendingAmount`, branches into either a plain status
  write or a full `ReviewPaymentUseCase.execute()` call (which decrements real
  `stock`, not just `reserved`, and sends an email) depending on whether the
  payment reaches `requiredAmount`, and is a multipart upload
  (`FileInterceptor`, same magic-byte JPEG/PNG sniffing as `Products`/
  `Stores.uploadLogo`) on top of all that. Read this method's full branching
  before writing its DTO — it's the most consequential single endpoint this
  rollout has touched, more than `Products.uploadImage` was, because a wrong
  type here (e.g. a Decimal field lying as `number`) risks real financial data
  being computed wrong client-side, not just displayed wrong. Multipart
  carve-out still applies: DTO the JSON response, leave the request/upload side
  alone, frontend upload stays on `apiFetch`/`FormData`
  (`ordersApi.registerPayment` already does this).
- **`review`/`advance`/`cancel` all go through domain-entity transition guards**
  (`Order` domain entity in `orders/domain/order.entity.ts`,
  `OrderStatus`/`PaymentStatus`/`FulfillmentStatus` value objects in
  `order-status.vo.ts`) and each does its own optimistic-locking `updateMany`
  guard against concurrent reviews — read `review-payment.usecase.ts`,
  `advance-fulfillment.usecase.ts`, `cancel-order.usecase.ts` in full before
  touching their controller methods; giving them real return types is a
  correctness check on what they actually return (`review`/`cancel` return the
  raw `tx.order.findUniqueOrThrow(...)` row — **not** run through
  `withPaymentSummary`, unlike
  `findRowByIdForStore`/`findManyForStore** — so
  those two responses are missing`paidAmount`/`pendingAmount`/`paidPercentage`/`items`/`payments`entirely, a real, pre-existing
  shape inconsistency across the`Order`tag's own endpoints, same class of
  thing Batch 1 found in`ProductsService.findAllForStore`'s empty-array
  branch. Confirm this by reading the code, not by assuming — if true, model
  it honestly (a narrower`OrderStatusResponseDto`for`review`/`cancel`,
  the full`OrderResponseDto`for`findAll`/`findOne`/`advance`— check`advance`too,`AdvanceFulfillmentUseCase.execute`calls`this.orders.saveStatus(...)`which is`tx.order.update(...)`, likely the
  same narrower shape as`review`/`cancel`),
  don't force one DTO onto all four just for consistency's sake.
- **`features/orders/mutations/use-optimistic-status-change.ts`'s
  delayed-commit/undo-toast logic must not change** (per `apps/web/AGENTS.md`'s
  existing note) — only its mutations' calls into `apiClient` do. It manipulates
  the TanStack Query cache directly via
  `queryClient.setQueryData<Order[]>(...)`, keyed on the current frontend
  `Order` zod type's field names (`paymentStatus`, `fulfillmentStatus`) — as
  long as the generated `OrderResponseDto` keeps the same field names (it will,
  they're 1:1 with the Prisma columns), this hook's logic is untouched, only
  `use-review-payment.ts`/`use-advance-fulfillment.ts`/ `use-cancel-order.ts`'s
  mutation functions change what they call.

## Suggested order of work within the batch

1. `Order` first, not `Checkout` — it's the bigger, riskier half, and
   `CreateOrderUseCase`'s response DTO is small once `Order`'s own DTOs exist
   (it can borrow `OrderItem`-shaped pieces if useful, though per the note above
   it likely needs its own top-level shape regardless).
2. Read `apps/api/src/modules/orders/domain/order.entity.ts` and
   `order-status.vo.ts` alongside the DDD-lite layering note in root `CLAUDE.md`
   (`orders` is the one module using `domain/application/infrastructure` — don't
   flatten it, don't retrofit that layering onto anything else as a side effect
   of this batch).
3. Response DTOs likely needed (confirm every field against the real
   service/repository code, don't guess from this list):
   - `OrderItemResponseDto` (id, quantity, product: nested
     `{id,name,images}`-shaped subset — **note the current frontend zod schema
     doesn't expose `unitPriceAtPurchase` at all**, confirm whether that's
     deliberate before deciding whether the DTO should either; if the DTO
     includes it — the honest/complete choice — that's a superset the frontend
     can simply not read yet, not a behavior change), variant: nullable
     `{id,name}` subset.
   - `OrderPaymentResponseDto` (id, amount: string, method: nullable literal
     union, note, imageUrl, createdAt: string).
   - `OrderResponseDto` (the `findAll`/`findOne`/enriched shape — id, customer
     fields, `totalAmount`/`requiredAmount`: string,
     `paidAmount`/`pendingAmount`/`paidPercentage`: number, currency,
     `paymentRejectionReason`, `status`/`paymentStatus`/`fulfillmentStatus`
     literal unions, `deliveryMethodType` literal union, `deliveryDetails`: open
     JSON, createdAt: string, `items: OrderItemResponseDto[]`,
     `payments: OrderPaymentResponseDto[]`).
   - Whatever narrower shape `review`/`cancel`/`advance` actually return (see
     the bullet above — verify first).
   - `CheckoutOrderResponseDto`/checkout's own result DTO, separate from
     `OrderResponseDto` (see above).
4. `@ApiQuery` check: `OrderController.findAll` reads `paymentStatus`/
   `fulfillmentStatus` off `@Query()` with no visible `@ApiQuery` decorator in
   the current code — confirm and add if missing, same silent-drop risk
   `Notifications`/`PaymentConfig`/`Stores.findFeatured`/`findDirectory` all
   needed in Batches 2–3.
5. e2e contract test(s): at minimum one exercising the full lifecycle (checkout
   create → seller findAll/findOne → addPayment with a real multipart file →
   review approve → advance through fulfillment → a separate order for cancel),
   matching `products.e2e-spec.ts`'s and `stores.e2e-spec.ts`'s depth given the
   stakes here. Use the shared `test/schema-assert.ts` helper (don't duplicate
   it inline). Watch for Order's extra FK-dependent cleanup in `afterAll` —
   `OrderItem`, `OrderPayment`, `PaymentProof`, `Customer` (if `customerEmail`
   was set) all need cleanup before `Order`, before `Store`, matching the
   established per-module cleanup-order pattern.
6. `orval.config.ts`: add `Order` and `Checkout` tags once their DTOs are real.
   Check generated method/type names for the same class of collision Batch 3 hit
   — should already be handled by the `[methodName,
   operation.operationId]`
   fix, but verify the generated output once rather than assuming.
7. Frontend: `features/orders/api/orders.api.ts` (keep `registerPayment` on
   `apiFetch`/`FormData`, migrate the other four),
   `features/checkout/api/checkout.api.ts`'s `submit` function (the one function
   Batch 3 explicitly left alone — the delivery/payment/pickup-point reads in
   that same file are already migrated). Drop response-shape zod for
   pass-through reads (`features/orders/schemas/order.schema.ts`'s
   `orderSchema`/ `orderItemRowSchema`/`orderPaymentRowSchema` become type
   aliases; keep `checkout.schema.ts`'s `buildCheckoutFormSchema` and any real
   request-side validation). `use-optimistic-status-change.ts` stays logically
   unchanged per the note above — only the mutation hooks under it change their
   `apiClient` calls.
8. Verify per the standing rule:
   `pnpm --filter api test && pnpm --filter
   api test:e2e`,
   `pnpm --filter @biasmarket/types typecheck && build`,
   `pnpm --filter web typecheck && test && build`, plus a real dev-server smoke
   test (signup → verify → sign-in → create-store → checkout as a fresh
   "customer" call with no auth → seller review/advance/cancel flow) — this
   batch touches real money math, so the smoke test should assert
   `paidAmount`/`pendingAmount` arithmetic is actually correct at runtime, not
   just schema-shaped.

## Remember, every time, before `generate:openapi`/`test:e2e`/dev server

```bash
set -a && source apps/api/.env && set +a
export S3_ENDPOINT=http://localhost:9000 S3_PUBLIC_URL=http://localhost:9000 \
  S3_ACCESS_KEY=admin S3_SECRET_KEY=password123 S3_BUCKET=products S3_LOGO_BUCKET=logos
```

Multipart e2e tests additionally need
`docker compose -f infra/docker/docker-compose.dev.yml up -d minio minio-init`
running standalone first (not the full dev stack).

## Non-goals

- Not touching `CustomerAuth`/`CustomerAccount`/`Customers` (Batch 5 — blocked
  on a spec-bug fix the user must approve first) or
  `ProductSearch`/`Stats`/`Users` (Batch 6), even though `CreateOrderUseCase`
  calls into `CustomerAccountService` — that dependency's own tag stays
  untouched, only `Order`/`Checkout`'s own response DTOs are in scope here.
- Not applying the DDD-lite layering anywhere else, and not flattening it out of
  `orders` either — it's already there, keep it.
- Not fixing the `review`/`cancel` vs. `findAll`/`findOne` response-shape
  inconsistency if confirmed real (see above) — model it honestly with two DTOs,
  same as Batch 1 modeled `Products`' multiple response shapes as a DTO
  extension chain. If it turns out fixing it is trivial and clearly desired, ask
  first rather than silently changing what a live endpoint returns.

## Execution notes

Append here once Batch 4 lands — what matched this plan, what diverged, and
update `docs/plans/2026-08-05-orval-rollout-batches-3-6-plan.md`'s "What's left"
and `apps/web/AGENTS.md`'s migrated-tags list at the same time, same convention
every prior batch used.
