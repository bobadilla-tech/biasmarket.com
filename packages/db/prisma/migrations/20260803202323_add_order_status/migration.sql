-- CreateEnum
CREATE TYPE "CancellationResolution" AS ENUM ('REFUNDED', 'RETAINED', 'STORE_CREDIT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancellationResolution" "CancellationResolution",
ADD COLUMN     "cancelledAt" TIMESTAMP(3);
