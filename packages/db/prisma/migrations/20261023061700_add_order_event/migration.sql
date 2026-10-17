-- Expand-only: a new table the previous release never reads or writes.

-- CreateEnum
CREATE TYPE "OrderEventActor" AS ENUM ('SELLER', 'BUYER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('CREATED', 'LINK_OPENED', 'LINK_REGENERATED', 'PHONE_CORRECTED', 'PAYMENT_SUBMITTED', 'PAYMENT_VALIDATED', 'PAYMENT_REJECTED', 'PAYMENT_VOIDED', 'FULFILLMENT_ADVANCED', 'PACKED_PHOTO_ADDED', 'TRACKING_ADDED', 'BUYER_NOTIFIED', 'RECEIPT_CONFIRMED', 'CLAIMED', 'INVITE_SHOWN', 'INVITE_CLICKED', 'INVITE_DISMISSED', 'ORDER_CANCELLED');

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "actor" "OrderEventActor" NOT NULL,
    "visibleToBuyer" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderEvent_storeId_type_createdAt_idx" ON "OrderEvent"("storeId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
