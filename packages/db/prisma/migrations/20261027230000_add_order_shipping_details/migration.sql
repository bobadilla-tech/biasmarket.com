-- Expand-only: nullable fields are compatible with the previous release.
ALTER TABLE "Order"
ADD COLUMN "trackingNumber" TEXT,
ADD COLUMN "trackingUrl" TEXT,
ADD COLUMN "packedPhotoUrl" TEXT;
