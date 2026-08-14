-- prisma-migrate-disable-next-transaction
-- CreateIndex
CREATE INDEX CONCURRENTLY "Store_isPublic_createdAt_id_idx"
ON "Store"("isPublic", "createdAt", "id");
