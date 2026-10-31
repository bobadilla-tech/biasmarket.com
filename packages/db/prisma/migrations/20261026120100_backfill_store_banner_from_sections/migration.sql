/* tsqllint-disable set-quoted-identifier */
-- One-time backfill from each store's first visible banner section.
WITH first_banner AS (
  SELECT DISTINCT ON ("storeId")
    "storeId",
    COALESCE("content"->>'imageUrl', "content"->>'image', "content"->>'url') AS image_url
  FROM "StoreSection"
  WHERE "type" = 'BANNER'
    AND "hidden" = false
    AND COALESCE("content"->>'imageUrl', "content"->>'image', "content"->>'url') IS NOT NULL
  ORDER BY "storeId", "position" ASC, "createdAt" ASC
)
UPDATE "Store"
SET "bannerUrl" = first_banner.image_url
FROM first_banner
WHERE "Store"."id" = first_banner."storeId"
  AND "Store"."bannerUrl" IS NULL;
