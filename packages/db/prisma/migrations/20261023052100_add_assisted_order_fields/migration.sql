-- Expand-only (docs/core/blue-green-migrations.md). Every new column is
-- nullable or NOT NULL with a constant default, so the previous release's
-- INSERT into "Order" still succeeds. Existing rows become MARKETPLACE
-- with no token. No DROP, no type change.

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('MARKETPLACE', 'VENDOR_ASSISTED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'MARKETPLACE',
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "accessTokenHash" TEXT,
ADD COLUMN     "accessTokenRevokedAt" TIMESTAMP(3),
ADD COLUMN     "linkFirstOpenedAt" TIMESTAMP(3),
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Order_accessTokenHash_key" ON "Order"("accessTokenHash");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
