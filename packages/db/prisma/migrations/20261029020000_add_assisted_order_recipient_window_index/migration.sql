-- Supports the bounded per-seller assisted-order recipient count.
CREATE INDEX "Order_seller_store_source_createdAt_phone_idx"
ON "Order"("createdByUserId", "storeId", "source", "createdAt", "customerPhoneNormalized");
