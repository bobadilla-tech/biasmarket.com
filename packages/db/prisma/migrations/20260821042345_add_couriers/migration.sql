-- CreateEnum
CREATE TYPE "CourierModalityType" AS ENUM ('AGENCY', 'HOME');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "courierModality" "CourierModalityType",
ADD COLUMN     "courierName" TEXT;

-- CreateTable
CREATE TABLE "Courier" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Courier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierConfig" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "modality" "CourierModalityType" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CourierConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Courier_storeId_idx" ON "Courier"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Courier_storeId_name_key" ON "Courier"("storeId", "name");

-- CreateIndex
CREATE INDEX "CourierConfig_courierId_idx" ON "CourierConfig"("courierId");

-- CreateIndex
CREATE UNIQUE INDEX "CourierConfig_courierId_modality_key" ON "CourierConfig"("courierId", "modality");

-- AddForeignKey
ALTER TABLE "Courier" ADD CONSTRAINT "Courier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierConfig" ADD CONSTRAINT "CourierConfig_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Courier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
