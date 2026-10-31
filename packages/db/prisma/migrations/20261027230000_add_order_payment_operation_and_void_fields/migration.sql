-- Expand-only payment metadata used by the assisted-order payment flows.
ALTER TABLE "OrderPayment"
  ADD COLUMN "operationCode" TEXT,
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "recordedBy" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedBy" TEXT,
  ADD COLUMN "voidReason" TEXT;

CREATE INDEX "OrderPayment_storeId_operationCode_idx"
  ON "OrderPayment"("storeId", "operationCode");
