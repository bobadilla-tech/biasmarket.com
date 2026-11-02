ALTER TABLE "Order" ADD COLUMN "checkoutIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "Order_storeId_checkoutIdempotencyKey_key"
ON "Order"("storeId", "checkoutIdempotencyKey");
