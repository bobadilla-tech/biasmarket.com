/* tsqllint-disable — this migration targets PostgreSQL, not SQL Server. */
ALTER TABLE "Category" ADD COLUMN "slug" TEXT;

WITH normalized AS (
  SELECT
    "id",
    "storeId",
    COALESCE(NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(TRANSLATE("name", 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', '-', 'g')), ''), 'categoria') AS base
  FROM "Category"
), ranked AS (
  SELECT "id", "storeId", base, ROW_NUMBER() OVER (PARTITION BY "storeId", base ORDER BY "id") AS ordinal
  FROM normalized
)
UPDATE "Category" AS category
SET "slug" = CASE
  WHEN ranked.ordinal = 1 THEN ranked.base
  ELSE ranked.base || '-' || RIGHT(category."id", 6)
END
FROM ranked
WHERE category."id" = ranked."id";

ALTER TABLE "Category" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Category_storeId_slug_key" ON "Category"("storeId", "slug");
