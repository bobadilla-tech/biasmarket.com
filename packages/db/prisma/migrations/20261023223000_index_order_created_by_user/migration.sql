-- Expand-only: ON DELETE SET NULL on Order.createdByUserId otherwise
-- sequentially scans Order when a user row is deleted.

-- CreateIndex
CREATE INDEX "Order_createdByUserId_idx" ON "Order"("createdByUserId");
