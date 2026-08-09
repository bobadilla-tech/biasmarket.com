-- CreateEnum
CREATE TYPE "WhatsAppMessageType" AS ENUM ('NEW_ORDER', 'PAYMENT_REMINDER');

-- CreateTable
CREATE TABLE "WhatsAppMessageTemplate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "WhatsAppMessageType" NOT NULL,
    "template" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppMessageTemplate_storeId_idx" ON "WhatsAppMessageTemplate"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessageTemplate_storeId_type_key" ON "WhatsAppMessageTemplate"("storeId", "type");

-- AddForeignKey
ALTER TABLE "WhatsAppMessageTemplate" ADD CONSTRAINT "WhatsAppMessageTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
