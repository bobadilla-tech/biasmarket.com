# Assisted-order identity erasure and retention

**Scope:** GitHub issues [#279](https://github.com/bobadilla-tech/biasmarket.com/issues/279) and [#460](https://github.com/bobadilla-tech/biasmarket.com/issues/460).

## Policy

- A buyer identity-erasure request is verified by the support operator through the existing support channel before processing. The repository does not send messages to buyers or collect requests through an external service.
- Requests are processed per store and phone number. Only `VENDOR_ASSISTED` orders in that store are considered; marketplace orders and other stores are not selected.
- Closed assisted orders may be anonymized when the request is verified. An active order is deferred until it is cancelled or fulfilment is complete, so the store can still deliver it. Repeating the operation after closure completes the request.
- Unclaimed assisted orders are anonymized 90 days after closure. Closure is recorded when an order is cancelled (including expiry) or fulfilment reaches `COMPLETED`. A daily worker runs the bounded retention sweep.
- Automated retention excludes claimed orders. A verified buyer request can anonymize a closed claimed assisted order and remove only that order's `buyerAccountId` link. The buyer account and its other orders remain intact.

## Data handling

The authorized operation preserves the `Order`, `OrderItem`, `OrderPayment`, `OrderEvent`, and `AuditLog` rows and financial and operational fields. It does not delete an order or alter payment amounts, payment status, cancellation resolution, stock, or item references.

For each eligible assisted order, it:

- clears `Order.customerPhone`, `customerPhoneNormalized`, `customerName`, and `customerEmail`;
- clears `deliveryDetails`, removes the `buyerAccountId` association, revokes the public access token, and sets `buyerIdentityErasedAt`;
- leaves event history intact. Event payloads are already allow-listed to non-identity fields, so event rows continue to document the order timeline without the buyer's phone or alias;
- anonymizes the related store-scoped `Customer` row in place, clears its contact and legacy credential fields, and marks `identityErasedAt`. The stable row ID keeps historical order references valid. The global `BuyerAccount` is never deleted or modified.
- writes an `AuditLog` entry with the order/customer ID, cause, and field names only. It records the stable operator ID and support request reference for buyer-request erasure; it does not put the submitted phone, alias, address, or token in audit metadata.

The cleanup is repeatable: erased rows are excluded by their erasure timestamp, and the phone lookup stops matching after the first successful run. Concurrent requests are guarded by conditional updates. Each order's financial and event records remain queryable for the store's accounting and audit history. A shared `Customer` row is anonymized only after no un-erased order in that store references it; this protects active orders and other order types that share the store+phone projection.

## Retained fields requiring separate review

This operation does not clear `OrderPayment.imageUrl` or `OrderPayment.note`, `Order.cancellationReason` or `Order.paymentRejectionReason`, or private S3 proof/photo objects referenced by stored URLs. Payment notes and seller-entered reason fields can contain personal information, and proof images can show identifying details. They remain available with the preserved order/payment history; this policy does not classify them as non-identifying. Their retention period, access controls, and any later deletion process are tracked separately in [issue #479](https://github.com/bobadilla-tech/biasmarket.com/issues/479).

## Operational procedure

1. Verify the requester controls the submitted phone number through the support process already in use. Record the request in the support system without copying the full number into application logs.
2. From the VPS, call the endpoint inside the active API container because Caddy blocks `/internal/*`. First identify the active color (`api-blue` or `api-green`) from the Caddy configuration, then run the following, replacing the service and values. `OPERATOR_ID` is the stable support-operator identifier and `REQUEST_REFERENCE` is the support ticket ID; neither may contain buyer details.

   ```sh
   read -r -s -p "Verified buyer phone: " CUSTOMER_PHONE
   printf '\n'
   export CUSTOMER_PHONE
   SERVICE=api-blue
   API_CONTAINER="$(docker ps -q --filter "label=com.docker.compose.service=$SERVICE" | head -n 1)"
   docker exec -e CUSTOMER_PHONE -i "$API_CONTAINER" node -e '(async () => { const body = { storeId: "STORE_ID", customerPhone: process.env.CUSTOMER_PHONE, operatorId: "OPERATOR_ID", requestReference: "PRIV-123" }; const response = await fetch("http://127.0.0.1:3000/internal/orders/assisted-identity-erasure-request", { method: "POST", headers: { "content-type": "application/json", "x-internal-jobs-secret": process.env.INTERNAL_JOBS_SECRET }, body: JSON.stringify(body) }); console.log(response.status, await response.text()); if (!response.ok) process.exit(1); })().catch((error) => { console.error(error); process.exit(1); })'
   unset CUSTOMER_PHONE
   ```

   The phone is read without echoing it and is not written into shell history or the Node command text. The secret is read from the API container environment and is not placed in the host command or history. The endpoint requires `INTERNAL_JOBS_SECRET` and is excluded from public Swagger.
3. Review only the returned `anonymized` and `deferred` counts. The raw phone is neither logged nor returned. If `deferred` is non-zero, retry after the affected orders close.
4. The scheduled retention sweep runs daily without buyer input. It processes only terminal, unclaimed assisted orders closed at least 90 days earlier, up to 500 per run; subsequent runs continue the backlog.

The 90-day period is measured from `closedAt`, not order creation or payment expiry. Existing terminal records with no cancellation/completion event are not assigned a synthetic close time by migration and therefore remain for manual review rather than being erased based on an inferred date.
