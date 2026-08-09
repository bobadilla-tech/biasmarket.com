-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('SELLER_RECORDED', 'BUYER_SUBMITTED');

-- CreateEnum
CREATE TYPE "PaymentReviewStatus" AS ENUM ('N_A', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_PROOF_SUBMITTED';

-- AlterTable
-- Note: this migration intentionally does NOT touch Address_buyerAccountId_fkey.
-- `prisma migrate dev`'s diff engine flagged a drop/re-add of that constraint
-- (CASCADE -> RESTRICT) because schema.prisma's Address.buyerAccount relation
-- has no explicit onDelete while the already-applied
-- 20260809230000_add_buyer_shipping_addresses migration set ON DELETE CASCADE
-- — real pre-existing drift between schema.prisma and the DB, unrelated to
-- this plan. Left as-is rather than silently changing FK delete behavior as a
-- side effect of an unrelated migration; flagged in this plan's execution
-- notes for a follow-up to fix deliberately.
ALTER TABLE "OrderPayment" ADD COLUMN     "reviewStatus" "PaymentReviewStatus" NOT NULL DEFAULT 'N_A',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "source" "PaymentSource" NOT NULL DEFAULT 'SELLER_RECORDED';
