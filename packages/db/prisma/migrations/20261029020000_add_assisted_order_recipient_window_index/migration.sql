-- Expand-only: the previous release's read/write contract is unchanged.
-- Prisma builds this index transactionally, taking a brief SHARE lock on "Order".
CREATE INDEX "Order_seller_store_source_createdAt_phone_idx"
ON "Order"("createdByUserId", "storeId", "source", "createdAt", "customerPhoneNormalized");
