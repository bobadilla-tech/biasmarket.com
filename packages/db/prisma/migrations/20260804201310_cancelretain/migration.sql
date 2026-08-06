-- CreateEnum
CREATE TYPE "ReleaseResolution" AS ENUM ('REFUNDED', 'STORE_CREDIT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "releasedAmount" DECIMAL(10,2),
ADD COLUMN     "releasedResolution" "CancellationResolution",
ADD COLUMN     "retainedAmount" DECIMAL(10,2);
