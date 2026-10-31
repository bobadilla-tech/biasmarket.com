-- Repairs rows written by 20261023210100_backfill_order_customer_phone_normalized
-- for phones typed with a "00" international trunk prefix. normalizePhone
-- treats "0051987654321" as "+51987654321" when what follows "00" is a
-- supported dial code with at least one more digit; the original backfill had
-- no 00 handling and produced "+510051987654321". That backfill is already
-- merged (and may be applied), so it is left untouched and corrected here.
-- The earlier backfill only fills NULLs, so these wrong non-NULL values would
-- never be repaired otherwise.
--
-- After stripping "00", the CASE is the same longest-dial-code-first split as
-- the original backfill. Digits that do not start with a supported dial code
-- are left alone: normalizePhone keeps the "00" there too and defaults to
-- Peru, which is what the original backfill already stored.

UPDATE "Order" AS o
SET "customerPhoneNormalized" = CASE
    WHEN n.rest LIKE '593_%' THEN '+593' || substr(n.rest, 4)
    WHEN n.rest LIKE '591_%' THEN '+591' || substr(n.rest, 4)
    WHEN n.rest LIKE '595_%' THEN '+595' || substr(n.rest, 4)
    WHEN n.rest LIKE '598_%' THEN '+598' || substr(n.rest, 4)
    WHEN n.rest LIKE '54_%'  THEN '+54'  || substr(n.rest, 3)
    WHEN n.rest LIKE '51_%'  THEN '+51'  || substr(n.rest, 3)
    WHEN n.rest LIKE '52_%'  THEN '+52'  || substr(n.rest, 3)
    WHEN n.rest LIKE '57_%'  THEN '+57'  || substr(n.rest, 3)
    WHEN n.rest LIKE '56_%'  THEN '+56'  || substr(n.rest, 3)
    WHEN n.rest LIKE '55_%'  THEN '+55'  || substr(n.rest, 3)
    WHEN n.rest LIKE '58_%'  THEN '+58'  || substr(n.rest, 3)
    WHEN n.rest LIKE '34_%'  THEN '+34'  || substr(n.rest, 3)
    WHEN n.rest LIKE '1_%'   THEN '+1'   || substr(n.rest, 2)
  END
FROM (
  SELECT "id", substr(regexp_replace("customerPhone", '[^0-9]', '', 'g'), 3) AS rest
  FROM "Order"
  WHERE regexp_replace("customerPhone", '[^0-9]', '', 'g') LIKE '00%'
) AS n
WHERE o."id" = n."id"
  AND n.rest ~ '^(593|591|595|598|54|51|52|57|56|55|58|34|1).';
