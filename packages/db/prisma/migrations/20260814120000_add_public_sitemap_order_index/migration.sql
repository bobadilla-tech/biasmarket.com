-- CreateIndex
CREATE INDEX "Store_isPublic_createdAt_id_idx"
ON "Store"("isPublic", "createdAt", "id");
