-- Expand-only (docs/core/blue-green-migrations.md). Nullable, so the previous
-- release's INSERT into "Order" still succeeds; the backfill and the code that
-- starts writing the value ship in their own steps. No DROP, no type change.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerPhoneNormalized" TEXT;

-- CreateIndex
CREATE INDEX "Order_storeId_customerPhoneNormalized_createdAt_idx" ON "Order"("storeId", "customerPhoneNormalized", "createdAt");
