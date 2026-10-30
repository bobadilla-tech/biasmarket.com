-- Track the end of order activity separately from payment expiry. Identity
-- retention begins only after cancellation or completed fulfilment.
ALTER TABLE "Order"
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "buyerIdentityErasedAt" TIMESTAMP(3);

ALTER TABLE "Customer"
  ADD COLUMN "identityErasedAt" TIMESTAMP(3);


-- Backfill terminal timestamps from the existing, non-PII event history. Do
-- not infer a close date for legacy terminal rows without a corresponding
-- event; the cleanup intentionally leaves those rows for manual review.
WITH terminal_events AS (
  SELECT
    "orderId",
    MIN("createdAt") AS "closedAt"
  FROM "OrderEvent"
  WHERE "type" = 'ORDER_CANCELLED'
     OR ("type" = 'FULFILLMENT_ADVANCED'
         AND "payload" ->> 'toStatus' = 'COMPLETED')
  GROUP BY "orderId"
)
UPDATE "Order" AS orders
SET "closedAt" = terminal_events."closedAt"
FROM terminal_events
WHERE orders."id" = terminal_events."orderId"
  AND (orders."status" = 'CANCELLED'
       OR orders."fulfillmentStatus" = 'COMPLETED');
