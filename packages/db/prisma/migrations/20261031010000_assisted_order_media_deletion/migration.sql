-- Keep external object deletion retryable after its reference is erased from
-- the order/payment rows in the same database transaction.
CREATE TABLE "AssistedOrderMediaDeletion" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistedOrderMediaDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssistedOrderMediaDeletion_url_key"
ON "AssistedOrderMediaDeletion"("url");

CREATE INDEX "AssistedOrderMediaDeletion_createdAt_idx"
ON "AssistedOrderMediaDeletion"("createdAt");
