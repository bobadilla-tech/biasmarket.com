-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "buyerAccountId" TEXT;

-- CreateTable
CREATE TABLE "BuyerAccount" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT,
    "passwordVersion" INTEGER NOT NULL DEFAULT 0,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "pendingEmail" TEXT,
    "pendingPhone" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerStoreLink" (
    "id" TEXT NOT NULL,
    "buyerAccountId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerStoreLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuyerAccount_phone_key" ON "BuyerAccount"("phone");

-- CreateIndex
CREATE INDEX "CustomerStoreLink_storeId_idx" ON "CustomerStoreLink"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerStoreLink_buyerAccountId_storeId_key" ON "CustomerStoreLink"("buyerAccountId", "storeId");

-- CreateIndex
CREATE INDEX "Order_buyerAccountId_idx" ON "Order"("buyerAccountId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerAccountId_fkey" FOREIGN KEY ("buyerAccountId") REFERENCES "BuyerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStoreLink" ADD CONSTRAINT "CustomerStoreLink_buyerAccountId_fkey" FOREIGN KEY ("buyerAccountId") REFERENCES "BuyerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStoreLink" ADD CONSTRAINT "CustomerStoreLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
