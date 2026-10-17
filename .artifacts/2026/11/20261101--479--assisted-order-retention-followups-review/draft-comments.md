# Draft Comments

## #572: Complete assisted-order retention follow-ups

**Review body (REQUEST_CHANGES):**

> Thanks for tackling the follow-ups in #479! The data scrubbing (clearing tracking details, cancellation/payment rejection reasons, payment notes, and unlinking proof images), the durable retry queue for media deletion, and the operator runbook are solid additions that closely match the retention policy.
>
> However, two blockers broke the CI `E2E (API)` test suite on GitHub Actions:
> 1. `StorageService.deleteImage` omitted `this.logoBucket` from allowed buckets, causing `stores.e2e-spec.ts` to throw `Error: Unsupported storage object URL` during cleanup.
> 2. The new test in `test/assisted-orders.e2e-spec.ts` created an `OrderPayment` row without cleaning it up in `afterAll`, causing `prisma.order.deleteMany` to fail on `OrderPayment_orderId_fkey` due to the RESTRICT foreign key constraint.
>
> In addition, there are two important fixes:
> - Enforcing `storeId` tenant isolation on `OrderPayment` queries in `assisted-order-identity-retention.usecase.ts` per `CLAUDE.md`.
> - Fixing the table alias in the operator runbook's audit `INSERT` (`backfilled` instead of `orders`), which currently fails in PostgreSQL.
>
> Details and suggested fixes are inline below.

### 572-1 · blocker · `apps/api/src/storage/storage.service.ts:98`

> Include `this.logoBucket` in the allowed bucket check.
>
> `uploadLogo` stores objects in `this.logoBucket` (`upload(this.logoBucket, "logos", buffer, mimeType)`). Because `deleteImage` only checks `[this.bucket, this.paymentBucket]`, attempting to delete a store logo throws `Error: Unsupported storage object URL`.
>
> This broke `test/stores.e2e-spec.ts:128` (`await storage.deleteImage(uploadedLogoUrl)`) in the CI API E2E run (`job 124756839389`).
>
> ```diff
> -      ![this.bucket, this.paymentBucket].includes(bucket ?? "") ||
> +      ![this.bucket, this.logoBucket, this.paymentBucket].includes(
> +        bucket ?? "",
> +      ) ||
> ```

### 572-2 · blocker · `apps/api/test/assisted-orders.e2e-spec.ts:888`

> Clean up the created `OrderPayment` row before suite teardown.
>
> The new test creates an `OrderPayment` row for `oldOrderId`. In `afterAll` (lines 127-141), the cleanup deletes `orderItem` and calls `deleteOrders(prisma, { storeId: id })`. Because `OrderPayment` has a RESTRICT foreign key on `orderId` and no CASCADE rule in `packages/db/prisma/schema.prisma`, `prisma.order.deleteMany` fails:
>
> ```
> Foreign key constraint violated on the constraint: OrderPayment_orderId_fkey
> ```
>
> Add `await prisma.orderPayment.deleteMany({ where: { storeId: id } });` before `deleteOrders` in `afterAll` (or delete the payment in a `finally` block / at the end of the test).

### 572-3 · should fix · `apps/api/src/modules/orders/application/assisted-order-identity-retention.usecase.ts:260`

> Filter tenant queries by `storeId` to follow `CLAUDE.md`'s tenant isolation rule.
>
> `CLAUDE.md` states: *"Every query touching tenant data filters by storeId. No exceptions."*
>
> In `eraseOrder`, `tx.orderPayment.findMany` (line 260) and `tx.orderPayment.updateMany` (line 367) query solely by `orderId: order.id`. Adding `storeId: order.storeId` ensures strict tenant scoping:
>
> ```ts
> const payments = await tx.orderPayment.findMany({
>   where: { orderId: order.id, storeId: order.storeId },
>   select: { imageUrl: true },
> });
> ```
>
> Additionally, line 268 executes an extra query for `packedPhotoUrl` via `tx.order.findUnique({ where: { id: order.id } })`. Consider selecting `packedPhotoUrl` directly in the candidate queries (`eraseExpiredUnclaimedIdentities` and `eraseOnBuyerRequest`) so `order.packedPhotoUrl` is already in memory, avoiding both the extra roundtrip and the un-scoped query.

### 572-4 · should fix · `docs/core/assisted-order-retention-operations.md:132`

> Fix the relation alias in the audit `INSERT` query.
>
> The `INSERT INTO "AuditLog"` query reads `orders."storeId"` and `orders."id"`, but its `FROM` clause defines only `backfilled_assisted_closures AS backfilled`. Running this block in PostgreSQL throws:
>
> ```sql
> ERROR: missing FROM-clause entry for table "orders"
> ```
>
> Changing the column references to `backfilled."storeId"` and `backfilled."id"` allows the transaction to commit successfully:
>
> ```diff
>  INSERT INTO "AuditLog" ("id", "actorId", "storeId", "action", "entityType", "entityId", "metadata")
>  SELECT gen_random_uuid()::text,
>         'OPERATOR_ACCOUNT_ID',
> -       orders."storeId",
> +       backfilled."storeId",
>         'order.assisted_closed_at_backfilled',
>         'Order',
> -       orders."id",
> +       backfilled."id",
>         jsonb_build_object(
> ```

### 572-5 · nit · `apps/api/src/modules/orders/application/assisted-order-identity-retention.usecase.ts:368`

> Consider clearing `OrderPayment.voidReason` alongside `note`.
>
> When voiding a payment, sellers are required to provide a reason string (`voidReason`), which can occasionally contain sensitive payment or contact references.
>
> Since `imageUrl` and `note` are already scrubbed in `tx.orderPayment.updateMany`, adding `voidReason: null` provides comprehensive payment text erasure:
>
> ```ts
> await tx.orderPayment.updateMany({
>   where: { orderId: order.id, storeId: order.storeId },
>   data: { imageUrl: null, note: null, voidReason: null },
> });
> ```

### 572-6 · nit · `apps/api/src/modules/orders/application/assisted-order-identity-retention.usecase.ts:221`

> Consider cursor progression or retry bounding in `processPendingMediaDeletions`.
>
> `processPendingMediaDeletions` queries the oldest `take: RETENTION_BATCH_SIZE` (500) items ordered by `createdAt asc`. While S3 `DeleteObject` is idempotent, if an unresolvable item ever enters the queue, it remains in the table with no retry counter or cursor progression.
>
> In a future iteration, consider tracking an attempt count or cursor progression so failing rows do not consume the initial batch window on every sweep.

### 572-7 · nit · `apps/api/src/modules/orders/application/assisted-order-identity-retention.usecase.ts:87`

> Avoid running the global media deletion queue synchronously in `eraseOnBuyerRequest`.
>
> `eraseOnBuyerRequest` is an interactive HTTP request handler called by a support operator. Calling `await this.processPendingMediaDeletions()` causes sequential S3 deletion requests over the network inside the HTTP request loop.
>
> Since `eraseOrder` already durably enqueues media URLs into `AssistedOrderMediaDeletion`, media cleanup can be left to the scheduled background sweep, or restricted to only the media URLs belonging to the specific erased order.

### 572-8 · nit · `packages/db/prisma/schema.prisma:530`

> Index both `createdAt` and `id` to match `processPendingMediaDeletions`'s sort order.
>
> `processPendingMediaDeletions` orders by `[{ createdAt: "asc" }, { id: "asc" }]`. Because items created in the same transaction share identical `createdAt` timestamps, `@@index([createdAt, id])` avoids in-memory sorts during queue sweeps.
