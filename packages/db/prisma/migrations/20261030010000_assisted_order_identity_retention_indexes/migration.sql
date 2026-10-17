-- prisma-migrate-disable-next-transaction
-- Keep the previous API color writable while the retention indexes are built.
CREATE INDEX CONCURRENTLY "Order_source_closedAt_buyerIdentityErasedAt_idx"
  ON "Order"("source", "closedAt", "buyerIdentityErasedAt");

CREATE INDEX CONCURRENTLY "Customer_storeId_identityErasedAt_idx"
  ON "Customer"("storeId", "identityErasedAt");
