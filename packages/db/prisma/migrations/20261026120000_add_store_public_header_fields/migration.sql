/* tsqllint-disable set-quoted-identifier */
-- Expand-only: nullable fields keep the previous application version
-- compatible during the blue/green rollback window.
ALTER TABLE "Store"
  ADD COLUMN "bannerUrl" TEXT,
  ADD COLUMN "locationLabel" TEXT,
  ADD COLUMN "publicOwnerName" TEXT,
  ADD COLUMN "publicOwnerAvatarUrl" TEXT;
