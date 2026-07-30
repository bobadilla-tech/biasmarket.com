/*
  Warnings:

  - Changed the type of `method` on the `PaymentMethodConfig` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('YAPE', 'PLIN', 'TRANSFER', 'CASH');

-- AlterTable
ALTER TABLE "OrderPayment" ADD COLUMN     "method" "PaymentMethodType";

-- AlterTable
ALTER TABLE "PaymentMethodConfig" DROP COLUMN "method",
ADD COLUMN     "method" "PaymentMethodType" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethodConfig_storeId_method_key" ON "PaymentMethodConfig"("storeId", "method");
