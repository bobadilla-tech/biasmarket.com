# Assisted-order retention operations

This runbook covers the scheduled identity-retention sweep, buyer-requested
erasure, retryable deletion of private order media, and legacy terminal orders
whose close date is unknown. The policy is 90 days after a verified close date.
Never infer a legacy close date from `createdAt` or `expiresAt` alone.

## Run the scheduled sweep on the VPS

Run as `deploy` from `/home/deploy/biasmarket`. Read the active color and image
tag immediately before invoking the command; blue/green deploys can change
which API container is active.

```bash
cd /home/deploy/biasmarket
color=$(cat state/current_color)
tag=$(cat state/current_sha)
IMAGE_TAG="$tag" docker compose --env-file env/shared.env exec -T "api-$color" \
  node --input-type=module -e '
    const response = await fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/internal/orders/assisted-identity-retention-sweep`, {
      method: "POST",
      headers: { "x-internal-jobs-secret": process.env.INTERNAL_JOBS_SECRET },
    });
    const result = await response.text();
    process.stdout.write(`${response.status} ${result}\n`);
    if (!response.ok) process.exitCode = 1;
  '
```

This executes inside the active API container, where the internal route is
reachable. Do not call the public hostname: Caddy intentionally returns 404
for `/internal/*`. A successful response includes the number of identities
erased. A failed object deletion leaves a durable retry row and is retried by
the next sweep; API logs include only the retry row ID.

## Process a verified buyer request

Verify the requester out of band first. Record the operator's stable account ID
and the support ticket reference; both are written to the `AuditLog` entry.
Do not put the buyer phone in shell history or the ticket reference in logs.

From the same deploy checkout, run this prompt-driven command. The phone is
read without echo, the request body is piped over stdin, and the shared secret
stays inside the API container:

```bash
cd /home/deploy/biasmarket
color=$(cat state/current_color)
tag=$(cat state/current_sha)
read -r -p 'Store ID: ' store_id
read -r -s -p 'Buyer phone: ' buyer_phone; printf '\n'
read -r -p 'Operator account ID: ' operator_id
read -r -p 'Support ticket reference: ' request_reference
printf '%s\n%s\n%s\n%s\n' "$store_id" "$buyer_phone" "$operator_id" "$request_reference" |
  IMAGE_TAG="$tag" docker compose --env-file env/shared.env exec -T "api-$color" \
    node --input-type=module -e '
      let input = "";
      for await (const chunk of process.stdin) input += chunk;
      const [storeId, customerPhone, operatorId, requestReference] = input.trimEnd().split("\n");
      const body = JSON.stringify({storeId, customerPhone, operatorId, requestReference});
      const response = await fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/internal/orders/assisted-identity-erasure-request`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-jobs-secret": process.env.INTERNAL_JOBS_SECRET },
        body,
      });
      const result = await response.text();
      process.stdout.write(`${response.status} ${result}\n`);
      if (!response.ok) process.exitCode = 1;
    '
unset buyer_phone
```

If the response reports deferred orders, retain the ticket reference and repeat
the request after those orders close. The API erases terminal matches and
returns active matches as deferred. Do not copy the phone into an issue or
audit metadata.

## Review legacy terminal orders

Older cancelled or completed assisted orders may have no trustworthy
`closedAt`. List only the stable IDs and non-identifying dates/statuses for
review; the query intentionally omits buyer names, phones, delivery details,
payment notes, and media URLs:

```sql
SELECT "id", "storeId", "createdAt", "expiresAt", "status",
       "fulfillmentStatus", "closedAt"
FROM "Order"
WHERE "source" = 'VENDOR_ASSISTED'
  AND "buyerIdentityErasedAt" IS NULL
  AND "closedAt" IS NULL
  AND ("status" = 'CANCELLED' OR "fulfillmentStatus" = 'COMPLETED')
ORDER BY "createdAt", "id";
```

Use authoritative operational records to establish when each order actually
closed. If that date cannot be established, leave `closedAt` null; the routine
sweep will continue to exclude it. For a verified date, update only the
reviewed order IDs in a transaction and record the operator and ticket in
`AuditLog` before committing. Replace the example values with confirmed dates,
stable order IDs, the operator account ID, and the incident/ticket reference:

```sql
BEGIN;

CREATE TEMP TABLE reviewed_assisted_closures (
  "id" TEXT PRIMARY KEY,
  "closedAt" TIMESTAMP(3) NOT NULL
) ON COMMIT DROP;

INSERT INTO reviewed_assisted_closures ("id", "closedAt") VALUES
  ('ORDER_ID_CONFIRMED_FROM_SOURCE_RECORDS', TIMESTAMP '2026-01-15 12:00:00');

CREATE TEMP TABLE backfilled_assisted_closures ON COMMIT DROP AS
WITH changed AS (
  UPDATE "Order" AS orders
  SET "closedAt" = reviewed."closedAt"
  FROM reviewed_assisted_closures AS reviewed
  WHERE orders."id" = reviewed."id"
    AND orders."source" = 'VENDOR_ASSISTED'
    AND orders."buyerIdentityErasedAt" IS NULL
    AND orders."closedAt" IS NULL
    AND (orders."status" = 'CANCELLED'
         OR orders."fulfillmentStatus" = 'COMPLETED')
  RETURNING orders."id", orders."storeId"
)
SELECT * FROM changed;

INSERT INTO "AuditLog" ("id", "actorId", "storeId", "action", "entityType", "entityId", "metadata")
SELECT gen_random_uuid()::text,
       'OPERATOR_ACCOUNT_ID',
       backfilled."storeId",
       'order.assisted_closed_at_backfilled',
       'Order',
       backfilled."id",
       jsonb_build_object(
         'requestReference', 'SUPPORT_OR_CHANGE_TICKET',
         'fields', jsonb_build_array('closedAt')
       )
FROM backfilled_assisted_closures AS backfilled;

COMMIT;
```

Confirm each update and audit row in the transaction before committing. Then
run the scheduled sweep above. Never backfill all candidates with a guessed
date.

## Retained records

Erasure keeps the order, item, payment amount/status, and event history needed
for financial integrity. It clears buyer free-text fields and payment proof
notes, removes proof-image references in the same database transaction, and
queues the corresponding private objects for deletion. S3 deletion is retried
until successful. Verify that the retry table is empty after a successful
sweep; a non-empty queue means storage deletion still needs attention.
