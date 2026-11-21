-- One-time data-only backfill for OrderPayment.operationCode.
-- See docs/core/order-payment-operation-code-nfkc-backfill.md before running.
-- Requires PostgreSQL 13+ with UTF8 server encoding.

BEGIN;

-- Keep the preflight and update consistent, and prevent concurrent payment
-- writes from introducing a collision after the report is evaluated.
LOCK TABLE "OrderPayment" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE operation_code_nfkc_preflight ON COMMIT DROP AS
SELECT p."id",
       p."storeId",
       p."orderId",
       p."reviewStatus",
       p."voidedAt",
       p."operationCode" AS old_code,
       normalize(p."operationCode", NFKC) AS new_code,
       upper(regexp_replace(p."operationCode", '[^A-Za-z0-9]', '', 'g')) AS old_key,
       upper(regexp_replace(
         normalize(p."operationCode", NFKC), '[^A-Za-z0-9]', '', 'g'
       )) AS new_key
FROM "OrderPayment" AS p
WHERE p."operationCode" IS NOT NULL;

-- Report only collisions newly introduced by NFKC, using the same store scope,
-- active-row filters, and ASCII comparison key as duplicate detection.
WITH collision_groups AS (
  SELECT "storeId", new_key
  FROM operation_code_nfkc_preflight
  WHERE "voidedAt" IS NULL
    AND "reviewStatus" <> 'REJECTED'
    AND new_key <> ''
  GROUP BY "storeId", new_key
  HAVING count(DISTINCT "orderId") > 1
     AND bool_or(old_key <> new_key)
)
SELECT p."storeId",
       p.new_key AS normalized_comparison_key,
       p."id" AS payment_id,
       p."orderId" AS order_id,
       p."reviewStatus",
       p."voidedAt",
       p.old_code,
       p.new_code,
       p.old_key AS comparison_key_before
FROM operation_code_nfkc_preflight AS p
JOIN collision_groups AS c USING ("storeId", new_key)
WHERE p."voidedAt" IS NULL
  AND p."reviewStatus" <> 'REJECTED'
ORDER BY p."storeId", p.new_key, p."orderId", p."id";

-- Empty comparison keys are not duplicate candidates: the application rejects
-- empty input keys and skips this lookup. Report any such legacy values for
-- operator visibility; they do not block the NFKC-only update.
SELECT "id" AS payment_id,
       "storeId" AS store_id,
       "orderId" AS order_id,
       old_code,
       new_code
FROM operation_code_nfkc_preflight
WHERE new_key = ''
ORDER BY "storeId", "orderId", "id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM operation_code_nfkc_preflight
    WHERE "voidedAt" IS NULL
      AND "reviewStatus" <> 'REJECTED'
      AND new_key <> ''
    GROUP BY "storeId", new_key
    HAVING count(DISTINCT "orderId") > 1
       AND bool_or(old_key <> new_key)
  ) THEN
    RAISE EXCEPTION
      'NFKC backfill stopped: newly colliding active operation codes were reported above';
  END IF;
END $$;

UPDATE "OrderPayment"
SET "operationCode" = normalize("operationCode", NFKC)
WHERE "operationCode" IS NOT NULL
  AND "operationCode" IS DISTINCT FROM normalize("operationCode", NFKC);

-- Must return zero before COMMIT. Any unexpected remaining value aborts.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "OrderPayment"
    WHERE "operationCode" IS NOT NULL
      AND "operationCode" IS DISTINCT FROM normalize("operationCode", NFKC)
  ) THEN
    RAISE EXCEPTION 'NFKC backfill verification failed';
  END IF;
END $$;

SELECT count(*) AS rows_still_needing_nfkc
FROM "OrderPayment"
WHERE "operationCode" IS NOT NULL
  AND "operationCode" IS DISTINCT FROM normalize("operationCode", NFKC);

COMMIT;
