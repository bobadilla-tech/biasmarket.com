-- Additive nullable column (no table rewrite).
ALTER TABLE "Order" ADD COLUMN "buyerConfirmedReceivedAt" TIMESTAMP(3);
