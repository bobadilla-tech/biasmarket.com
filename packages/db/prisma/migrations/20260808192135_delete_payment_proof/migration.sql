/*
  Warnings:

  - You are about to drop the `PaymentProof` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PaymentProof" DROP CONSTRAINT "PaymentProof_orderId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentProof" DROP CONSTRAINT "PaymentProof_reviewedBy_fkey";

-- DropTable
DROP TABLE "PaymentProof";

-- DropEnum
DROP TYPE "ProofStatus";
