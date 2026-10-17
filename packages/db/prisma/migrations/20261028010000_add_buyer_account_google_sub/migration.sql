-- Additive: nullable column + unique index on a small table (short SHARE lock).
ALTER TABLE "BuyerAccount" ADD COLUMN "googleSub" TEXT;

CREATE UNIQUE INDEX "BuyerAccount_googleSub_key" ON "BuyerAccount"("googleSub");
