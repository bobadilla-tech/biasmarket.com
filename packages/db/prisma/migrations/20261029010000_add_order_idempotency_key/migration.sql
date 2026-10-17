-- Expand-only (docs/core/blue-green-migrations.md). The new column is
-- nullable, so the previous release's INSERT into "Order" (which does not
-- know it) still succeeds. NULLs are distinct in a unique index, so existing
-- rows and orders created without a key never collide. The index build takes
-- a brief SHARE lock on "Order" in the candidate phase, like
-- "Order_accessTokenHash_key" before it (mostly NULL column, no CONCURRENTLY
-- because Prisma runs this file in a transaction).

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_createdByUserId_idempotencyKey_key" ON "Order"("storeId", "createdByUserId", "idempotencyKey");
