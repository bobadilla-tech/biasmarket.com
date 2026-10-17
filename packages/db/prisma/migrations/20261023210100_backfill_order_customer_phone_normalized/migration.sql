-- Data backfill, kept out of the schema-change migration per
-- docs/core/blue-green-migrations.md ("backfill in a separate
-- migration/step"). Safe to run while the previous release is still serving:
-- it only writes the new column, which that release never reads.
--
-- Mirrors packages/utils/src/phone-country/index.ts's
-- normalizePhone/parsePhoneValue: strip every non-digit, keep a leading known
-- dial code, otherwise default to Peru. The WHEN order reproduces
-- COUNTRIES_BY_DIAL_CODE_LENGTH_DESC (longest dial code first), so e.g.
-- "51987654321" resolves to +51 + 987654321 exactly like the util does rather
-- than matching a shorter prefix. Keep this list in sync with PHONE_COUNTRIES.

UPDATE "Order" AS o
SET "customerPhoneNormalized" = CASE
    WHEN n.digits LIKE '593%' THEN '+593' || substr(n.digits, 4)
    WHEN n.digits LIKE '591%' THEN '+591' || substr(n.digits, 4)
    WHEN n.digits LIKE '595%' THEN '+595' || substr(n.digits, 4)
    WHEN n.digits LIKE '598%' THEN '+598' || substr(n.digits, 4)
    WHEN n.digits LIKE '54%'  THEN '+54'  || substr(n.digits, 3)
    WHEN n.digits LIKE '51%'  THEN '+51'  || substr(n.digits, 3)
    WHEN n.digits LIKE '52%'  THEN '+52'  || substr(n.digits, 3)
    WHEN n.digits LIKE '57%'  THEN '+57'  || substr(n.digits, 3)
    WHEN n.digits LIKE '56%'  THEN '+56'  || substr(n.digits, 3)
    WHEN n.digits LIKE '55%'  THEN '+55'  || substr(n.digits, 3)
    WHEN n.digits LIKE '58%'  THEN '+58'  || substr(n.digits, 3)
    WHEN n.digits LIKE '34%'  THEN '+34'  || substr(n.digits, 3)
    WHEN n.digits LIKE '1%'   THEN '+1'   || substr(n.digits, 2)
    ELSE '+51' || n.digits
  END
FROM (
  SELECT "id", regexp_replace("customerPhone", '[^0-9]', '', 'g') AS digits
  FROM "Order"
  WHERE "customerPhoneNormalized" IS NULL
) AS n
WHERE o."id" = n."id";
