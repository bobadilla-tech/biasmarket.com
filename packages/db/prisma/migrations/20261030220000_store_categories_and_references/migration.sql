ALTER TABLE "Category" ADD COLUMN "imageUrl" TEXT;

CREATE TYPE "StoreReferenceSource" AS ENUM ('STORE', 'BUYER');

CREATE TABLE "StoreReference" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "source" "StoreReferenceSource" NOT NULL DEFAULT 'STORE',
    "caption" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreReference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreReference_storeId_takenAt_idx" ON "StoreReference"("storeId", "takenAt");
CREATE INDEX "StoreReference_storeId_hidden_takenAt_idx" ON "StoreReference"("storeId", "hidden", "takenAt");

ALTER TABLE "StoreReference" ADD CONSTRAINT "StoreReference_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
