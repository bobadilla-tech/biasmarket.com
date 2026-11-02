# Review Notes: PR #572

## Scope

| PR                                                                | Title                                        | Head SHA                                   | Base SHA                                            | Review Status                                     | CI Status                                   |
| ----------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| [#572](https://github.com/bobadilla-tech/biasmarket.com/pull/572) | Complete assisted-order retention follow-ups | `2365761770345be8e8032ee8f14f04ad547d22c5` | `0671974567aef0a97751d771ee784bbee0207b8e` (`main`) | CodeRabbit commented (4 threads); no human review | 2 failing (`CI/CI Success`, `CI/E2E (API)`) |

## What Ran & Results

1. **GitHub Actions CI Diagnostic Inspection**:
   - Downloaded run diagnostics for run ID `41275520770`
     (`api-e2e-diagnostics-41275520770`).
   - Inspected `e2e-suite.log`:
     - Failure A: `stores.e2e-spec.ts:128` failed on
       `storage.deleteImage(uploadedLogoUrl)` with
       `Error: Unsupported storage object URL`.
     - Failure B: `assisted-orders.e2e-spec.ts:131` failed on
       `deleteOrders(prisma, { storeId: id })` with
       `PrismaClientKnownRequestError: Foreign key constraint violated on the constraint: OrderPayment_orderId_fkey`.
2. **Typecheck**:
   - `DATABASE_URL=... pnpm --filter api typecheck` — passed with 0 errors.
   - `pnpm --filter @biasmarket/db typecheck` — passed with 0 errors.
3. **Unit Tests**:
   - `pnpm --filter api exec vitest run src/modules/orders/application/assisted-order-identity-retention.usecase.spec.ts`
     — 8 tests passed in 570ms.
4. **OpenAPI Drift**:
   - `scripts/ci/check-openapi-drift.sh` ran in CI (`.ci/e2e-openapi.log`) with
     0 drift.
5. **Prisma Validation**:
   - `prisma validate` — schema is valid.
   - `CI/DB (Prisma)` and `CI/Migration Safety` checks succeeded in GitHub
     Actions.

## Permission & Security Validation

1. **Endpoint Authorization & Secret Guarding**:
   - Verified that `/internal/orders/assisted-identity-retention-sweep` and
     `/internal/orders/assisted-identity-erasure-request` are guarded by
     `InternalJobsSecretGuard` and `ThrottlerGuard`.
   - Verified that `InternalJobsSecretGuard` performs timing-safe SHA-256
     comparison against `INTERNAL_JOBS_SECRET`.
   - Verified that endpoints are excluded from public Swagger and Caddy blocks
     `/internal/*` externally.
2. **Operator & Audit Log Tracking**:
   - Verified `operatorId` and `requestReference` validation in
     `AssistedOrderIdentityErasureDto`.
   - Verified that `AuditLog` captures `actorId: operatorId` and
     `metadata.requestReference` without persisting or logging buyer phone
     numbers, raw tokens, or payment proof URLs.
   - Identified a gap: `customer.assisted_identity_erased` is not logged when a
     customer is anonymized alongside their last order in `eraseOrder`, despite
     being documented in `docs/core/assisted-orders.md`.
3. **Tenant Data Isolation (`storeId`)**:
   - Audited all Prisma queries against CLAUDE.md hard rule: _"Every query
     touching tenant data filters by storeId. No exceptions."_
   - Found that `tx.orderPayment.findMany` (line 260), `tx.order.findUnique`
     (line 268), and `tx.orderPayment.updateMany` (line 367) query without
     filtering by `storeId: order.storeId`.
4. **Storage Access Control & Media Deletion**:
   - Verified private payment bucket (`S3_PAYMENT_BUCKET`) versus public buckets
     (`S3_BUCKET`, `S3_LOGO_BUCKET`).
   - Found that `StorageService.deleteImage` only allows `this.bucket` and
     `this.paymentBucket`, omitting `this.logoBucket` and breaking logo
     deletion.
   - Verified that payment proof images and packed photos are erased from
     database columns and queued for durable S3 deletion.
5. **Claimed vs Unclaimed Retention Boundary**:
   - Verified that the automated 90-day sweep strictly excludes claimed orders
     (`claimedAt: null, buyerAccountId: null`).
   - Verified that verified buyer requests only unlink `buyerAccountId: null`
     from the specific store order without deleting or modifying the global
     `BuyerAccount`.

## Findings Grouped by PR

### PR #572

- **572-1 · blocker · `apps/api/src/storage/storage.service.ts:98`**:
  `StorageService.deleteImage` omits `this.logoBucket` from the allowed bucket
  check `![this.bucket, this.paymentBucket].includes(bucket ?? "")`. When
  storefront/store tests or operations attempt to delete an uploaded store logo,
  it throws `Error: Unsupported storage object URL`. This caused
  `test/stores.e2e-spec.ts:128` to fail in CI.
- **572-2 · blocker · `apps/api/test/assisted-orders.e2e-spec.ts:888`**: The new
  e2e test `erases terminal data only after 90 days and deletes proof media`
  inserts an `OrderPayment` row (`await prisma.orderPayment.create(...)`).
  However, the suite's `afterAll` hook only deletes `orderItem` before calling
  `deleteOrders(prisma, { storeId: id })`. Because `OrderPayment` has a RESTRICT
  foreign key constraint to `Order`, `prisma.order.deleteMany` throws
  `P2003: Foreign key constraint violated on the constraint: OrderPayment_orderId_fkey`.
- **572-3 · should fix ·
  `apps/api/src/modules/orders/application/assisted-order-identity-retention.usecase.ts:260`**:
  Multi-tenant isolation violation: `tx.orderPayment.findMany` (line 260),
  `tx.order.findUnique` (line 268), and `tx.orderPayment.updateMany` (line 367)
  omit `storeId: order.storeId`. CLAUDE.md hard rule mandates that every query
  touching tenant data must filter by `storeId`. In addition, `packedPhotoUrl`
  can be included in the initial candidate query to eliminate the redundant
  roundtrip on line 268.
- **572-4 · should fix ·
  `docs/core/assisted-order-retention-operations.md:132`**: PostgreSQL syntax
  error in the runbook's legacy backfill script: `INSERT INTO "AuditLog"`
  references `orders."storeId"` and `orders."id"`, but the `FROM` clause aliases
  the relation as `backfilled_assisted_closures AS backfilled`. Running this
  query fails with `ERROR: missing FROM-clause entry for table "orders"`,
  preventing operators from completing legacy reviews.
- **572-5 · should fix ·
  `apps/api/src/modules/orders/application/assisted-order-identity-retention.usecase.ts:368`**:
  Free-text erasure gap: `OrderPayment.voidReason` is omitted from erasure in
  `tx.orderPayment.updateMany` and from `AuditLog.metadata.fields`. Sellers
  frequently enter sensitive payment/contact details when voiding a payment.
- **572-6 · should fix ·
  `apps/api/src/modules/orders/application/assisted-order-identity-retention.usecase.ts:221`**:
  Head-of-line blocking in `processPendingMediaDeletions`: `findMany` queries
  the oldest `take: RETENTION_BATCH_SIZE` items sorted by `createdAt asc`. When
  an S3 object fails to delete, the row remains in the queue with no retry count
  or cursor. If a batch fails, all subsequent sweeps repeatedly fetch the same
  failing batch, starving newer queued media deletions.
- **572-7 · nit ·
  `apps/api/src/modules/orders/application/assisted-order-identity-retention.usecase.ts:87`**:
  `eraseOnBuyerRequest` executes `await this.processPendingMediaDeletions()`,
  performing up to 500 sequential network requests to S3 within an interactive
  HTTP request handler. Media deletion should be handled asynchronously or
  restricted to the specific media URLs of the erased order.
- **572-8 · nit · `packages/db/prisma/schema.prisma:530`**: Index mismatch:
  `AssistedOrderMediaDeletion` indexes `@@index([createdAt])`, but the consumer
  queries `orderBy: [{ createdAt: "asc" }, { id: "asc" }]`. Since batch
  insertions share identical `createdAt` timestamps, `@@index([createdAt, id])`
  avoids in-memory sorts.

## Candidates Investigated and Dropped

- **AssistedOrderMediaDeletion cuid default on createMany**: Investigated
  whether `createMany({ data: [{ url }] })` fails due to `id` lacking a
  SQL-level default in PostgreSQL. Confirmed that Prisma Client generates cuid
  values client-side for `createMany` inputs when `id` is omitted.
- **OrderEvent payload identity leak**: Checked if `OrderEvent` records contain
  buyer phone numbers or private media URLs after erasure. Confirmed that event
  payloads use a strict allowlist of non-identity fields.
- **Customer AuditLog in eraseOrder**: Identified that `tx.customer.updateMany`
  inside `eraseOrder` does not emit `customer.assisted_identity_erased` audit
  logs. Since the `customer.updateMany` block was not introduced in this PR's
  diff (pre-existing code), raised as an observation/follow-up rather than a PR
  blocker.

## Not Verified

- Running the full live PostgreSQL + Redis + MinIO container environment locally
  (validated against GitHub Actions CI logs and diagnostic artifacts).
