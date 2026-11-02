ALTER TABLE "user"
ADD COLUMN "countryCode" TEXT,
ADD COLUMN "uiRegister" TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE "Store"
ADD COLUMN "countryCode" TEXT,
ADD COLUMN "buyerRegister" TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE "BuyerAccount"
ADD COLUMN "countryCode" TEXT;
