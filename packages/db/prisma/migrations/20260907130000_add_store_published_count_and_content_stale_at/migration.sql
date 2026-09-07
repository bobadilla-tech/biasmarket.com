-- Denormalised publishedProductCount + storefront-content freshness timestamp
-- — Track C / PR D4 of
-- docs/plans/2026-09-07-store-rich-content-and-thin-content-indexing-plan.md.
-- Additive: publishedProductCount is NOT NULL DEFAULT 0, contentStaleAt is
-- nullable (readers fall back to createdAt). One-time backfill of
-- publishedProductCount from the current Product rows.

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "publishedProductCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contentStaleAt" TIMESTAMP(3);

-- Backfill: count PUBLISHED, non-discontinued, non-soft-deleted products per store.
UPDATE "Store" AS s
SET "publishedProductCount" = sub.count
FROM (
  SELECT "storeId", COUNT(*)::int AS count
  FROM "Product"
  WHERE "status" = 'PUBLISHED'
    AND "discontinued" = false
    AND "deletedAt" IS NULL
  GROUP BY "storeId"
) AS sub
WHERE s.id = sub."storeId";
