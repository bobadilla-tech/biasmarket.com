# Assisted orders

How a seller creates an order for a buyer who has no account, and how that buyer
follows, pays for and optionally keeps the order through one private link. This
is the single owner of the assisted-order lifecycle, the audit-log action list
and the identity-retention rules. Payment states are in
[security-payments.md §9](security-payments.md#92-flow-whats-actually-live);
identity and sessions are in
[security-payments.md §7.5](security-payments.md#75-seller-and-buyer-identity);
the product intent is in [product.md](product.md).

Code lives in `apps/api/src/modules/orders` (`application/`, `domain/`,
`infrastructure/`, the one module with the DDD-lite layout described in
[architecture.md](architecture.md)), with shared helpers in
`packages/utils/src/assisted-order` and
`packages/utils/src/assisted-order-payment`. No endpoint paths are listed here
on purpose; the controllers are `assisted-orders.controller.ts` (seller) and
`public-order-events.controller.ts` (private link).

## What an assisted order is

A regular order comes from the storefront checkout. An assisted order
(`Order.source = VENDOR_ASSISTED`) is created by a signed-in seller, usually
after a WhatsApp conversation, for a buyer known only by phone number.
Marketplace checkout is unchanged.

Creating one (`create-assisted-order.usecase.ts`):

- The seller must own the store (`assertOwnership`, like every seller route).
- The buyer phone is required and stored normalized; a display name is an
  optional alias. A `Customer` row is upserted for the store and phone. No
  `BuyerAccount` is created and no email is sent.
- Items, prices, stock reservation, delivery rules and the hold window reuse the
  checkout code (`order-creation.core.ts`), so an assisted order holds stock the
  same way and is swept by the same expiry job.
- The seller picks full or partial payment. A partial payment is only valid for
  pickup, with the deposit share held in `ASSISTED_PICKUP_DEPOSIT_PERCENT`
  (`packages/utils/src/assisted-order-payment`); courier orders require the full
  amount. The order total must be greater than zero.
- A seller can reach only a limited number of distinct new recipients per store
  in a rolling window; repeat orders to a recipient already in the window are
  allowed (`ASSISTED_ORDER_RECIPIENT_LIMIT` and
  `ASSISTED_ORDER_RECIPIENT_WINDOW_MS` in the use case).
- The response includes the private link, an advisory count of the buyer's
  earlier orders at this store, and the order. It carries `no-store` and
  `no-referrer` headers because it holds the only copy of the link.

## The private link

The link is the buyer's only credential until they claim the order.

- **Format.** `createOrderAccessToken` (`packages/utils/src/assisted-order`)
  draws a random token from a cryptographically secure source, with more entropy
  than the usual 128-bit floor, and the URL puts it in the path of the store's
  order page, never in a query string, so referrers built from search params do
  not carry it (`order-access-url.ts`, the single source of the URL shape).
- **Storage.** Only the SHA-256 hash is stored (`Order.accessTokenHash`,
  unique). The clear token exists in the create and regenerate responses and
  nowhere else; a lookup hashes the presented token and finds the order by hash.
- **Unknown or revoked links.** Every public route that takes a token answers an
  unknown, revoked or erased link with the same not-found response, before any
  body is parsed (`OrderEventsService`, `PublicOrderTokenGuard`). A revoked link
  is one with `accessTokenRevokedAt` set.
- **First open.** The first read of the order page by the buyer's browser sets
  `linkFirstOpenedAt` and records a `LINK_OPENED` event. The page fetches from
  the browser, not the server, so link-preview crawlers do not count as an open.
- **Regenerate.** The seller can rotate the link
  (`manage-assisted-order-link.usecase.ts`): a new token replaces the stored
  hash and the old link stops working at once. It is refused for a cancelled,
  expired or non-assisted order.
- **Correct the phone.** The seller can fix a wrong number only before the buyer
  opened or claimed the link. It also rotates the link, since the old one went
  to the wrong person. The wrong number's `Customer` row is left in place.
- **Buyer notices.** The seller's "notify the buyer" WhatsApp message is built
  and opened in the browser; the API only records a `BUYER_NOTIFIED` event with
  the kind of notice, never the number, the message or the link.
- **Logging.** Tokens are scrubbed from logs and error events; see
  [security-payments.md §7.5](security-payments.md#redaction).

## Idempotency key

Creating an assisted order accepts an optional `Idempotency-Key` header
(`application/idempotency-key.ts`; the CORS allow-list in
`common/cors-options.ts` includes it so the dashboard can send it).

- It must be a UUID; a malformed or repeated header is a validation error. An
  absent header leaves behavior unchanged.
- Uniqueness is per store, per seller and per key (a database unique index on
  `Order`). A second request with the same key answers a conflict that names the
  first order, instead of creating another.
- The replay check runs before phone, stock and delivery validation, so a retry
  after the last unit sold still gets the replay and not a stock error. It runs
  again after a failed transaction, so a concurrent request that won the unique
  index or the last unit is reported as a replay.

## Order events and the buyer timeline

`OrderEvent` rows record what happened (`OrderEventType`: created, link opened,
link regenerated, phone corrected, payment submitted, validated, rejected or
voided, fulfillment advanced, packed photo added, tracking added, buyer
notified, receipt confirmed, claimed, invite shown, clicked or dismissed, order
cancelled), who did it (`OrderEventActor`: seller, buyer or system), and whether
the buyer may see it (`visibleToBuyer`).

- Every event is written inside the transaction of the change it describes
  (`OrderEventsService.record`), with the store taken from the order row.
- The payload keeps only an allow-list of keys (`ALLOWED_PAYLOAD_KEYS` in
  `order-events.service.ts`); phones, notes, operation codes, file names, IPs
  and user agents never enter it.
- A second filter decides what the timeline shows (`public-order-timeline.ts`):
  the seller's workflow events (link opened, regenerated, phone corrected, buyer
  notified) and the invite-funnel events are not part of it, and each event type
  exposes only the fields picked for it.
- The timeline is returned inside the same public order read as the order
  itself; there is no separate timeline call. The web page refetches that read
  when the browser window regains focus (`features/public-order/queries`). There
  is no push channel and no server-sent events: a buyer sees a change on the
  next focus or reload.
- The `PAYMENT_SUBMITTED` event is separate from the `PAYMENT_SUBMITTED` payment
  status; see
  [security-payments.md §9.3](security-payments.md#93-state-summary).
- Invite events (shown, clicked, dismissed) feed a funnel count for the "save
  your order" prompt. They are recorded only for orders the buyer could really
  be invited to, and "shown" and "clicked" are written once per order and page
  moment.

## Buyer payment proof

An assisted-order buyer pays from the private link by uploading a proof image.
The rules, guard order and limits are in
[security-payments.md §9.3.1](security-payments.md#931-buyer-proof-upload-by-private-link).
The proof is a `BUYER_SUBMITTED` / `PENDING_REVIEW` payment; the seller
approves, rejects or voids it from the dashboard.

## Receipt confirmation

Once the order is paid and shipping, the buyer can confirm they received it
(`OrderEventsService.confirmReceipt`).

- The order must be `VERIFIED`, not cancelled, and in a fulfillment state listed
  in `RECEIPT_FULFILLMENT_STATES` (`packages/utils/src/order-receipt`); the web
  button reads the same constant. Anything else is a generic conflict that does
  not describe the order.
- It is idempotent. The first confirmation stamps `buyerConfirmedReceivedAt` in
  one guarded update that re-checks the same conditions, records a
  `RECEIPT_CONFIRMED` event and, after the commit and on a best-effort basis,
  creates a seller notification with no buyer data in the text. Later calls
  return the stored date.
- The request must be JSON; a form-encoded body is rejected, which blocks a
  cross-site form post.

## Claiming an order

A buyer can save an assisted order into a global account with Google. The ticket
mechanics (cookie, TTL constant, link fingerprint, `OriginGuard`) are in
[security-payments.md §7.5](security-payments.md#75-seller-and-buyer-identity);
this section is the order side.

- **Ticket request.** An unknown or revoked link is rejected first. Then the
  request fails if Google sign-in is not configured, if the order is already
  claimed (conflict), or if it cannot be claimed (unprocessable): not an
  assisted order, cancelled, or with no payment that counts as paid yet
  (`OrderEventsService.assertClaimable`).
- **Claim.** After the Google redirect, `CustomerAuthService` locks and
  re-checks the order, verifies the ticket's link fingerprint against the
  current hash, and sets `buyerAccountId` and `claimedAt` in one guarded update.
  The same account claiming again is a success; any other account is told it is
  too late. The claim upserts a `CustomerStoreLink`, records a `CLAIMED` event
  and writes an `order.claimed` audit row, and the buyer lands on the order in
  their purchases page.
- **After a claim.** The order is no longer eligible for the scheduled identity
  erasure (below), the phone can no longer be corrected, and the buyer owns it
  through their account.

## Audit log actions

The `AuditLog` table records seller, buyer and system actions on orders. The
list below is generated from `git grep "action:" apps/api/src`; rerun it when
you add one. Entries never carry phones, aliases, tokens, notes or operation
codes.

| Action                                             | Written when                                                                           | Written by                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------- |
| `order.assisted_created`                           | a seller creates an assisted order                                                     | seller                          |
| `order.link_regenerated`                           | the seller rotates the private link                                                    | seller                          |
| `order.phone_corrected`                            | the seller corrects the buyer phone                                                    | seller                          |
| `payment.recorded`                                 | a seller records a payment on an order that is already `VERIFIED` (a residual balance) | seller                          |
| `payment.partial`                                  | a seller-recorded payment moves the order to `PARTIALLY_PAID`                          | seller                          |
| `payment.approved`, `payment.rejected`             | the seller approves or rejects the order's payment                                     | seller                          |
| `payment_proof.approved`, `payment_proof.rejected` | the seller reviews one buyer-submitted proof                                           | seller                          |
| `payment.voided`                                   | the seller voids a payment (reason stored in the metadata)                             | seller                          |
| `fulfillment.advanced`                             | fulfillment moves forward                                                              | seller                          |
| `order.tracking_updated`                           | tracking is set on an assisted order                                                   | seller                          |
| `order.packed_photo_added`                         | a packed photo is uploaded for an assisted order                                       | seller                          |
| `order.cancelled`                                  | the seller cancels the order                                                           | seller                          |
| `order.expired`                                    | the expiry sweep cancels an unpaid order                                               | system                          |
| `order.claimed`                                    | a buyer claims the order                                                               | buyer account                   |
| `order.assisted_identity_erased`                   | an order's buyer identity is erased                                                    | system, or the support operator |
| `customer.assisted_identity_erased`                | a store contact is erased with its last order                                          | system, or the support operator |

## Identity retention and erasure

Assisted orders hold a buyer's phone and, sometimes, a name and delivery
details, for a buyer who never created an account. The retention use case
(`assisted-order-identity-retention.usecase.ts`) limits how long that identity
stays.

An order qualifies for the scheduled sweep when all of these hold:

- it is `VENDOR_ASSISTED`;
- it is closed: cancelled, expired or completed, which stamps `closedAt`;
- it was never claimed (`claimedAt` and `buyerAccountId` are empty);
- its identity is not already erased;
- `closedAt` is older than `ASSISTED_ORDER_IDENTITY_RETENTION_DAYS`.

For a qualifying order the sweep clears the phone, normalized phone, name, email
and delivery details, drops the link hash and marks the link revoked, and stamps
`buyerIdentityErasedAt`, all in one transaction that re-checks the conditions.
If no other live order uses the store contact (`Customer`), the contact is
anonymized too: its phone becomes a non-phone marker so the row and its foreign
keys stay valid. Each erasure writes the audit rows above with the cause
(`RETENTION` or `BUYER_REQUEST`) and the list of erased field names. Money,
items and event history remain; they hold no identity.

Claimed orders are not touched by the sweep: they belong to the buyer's account
and are erased only when the buyer asks. A buyer request is handled by a support
operator, who verifies the person out of band and runs the same erasure through
an authenticated internal operation with an operator id and a request reference.
Orders that are still open are reported as deferred and erased on a later run
once they close. The phone is used to find records and is never copied into an
audit row or a log. Each sweep run takes a bounded batch, oldest first, so a
backlog clears over several daily runs, and a failure on one order logs only its
id.

## Worker involvement

`apps/workers` owns scheduling only; the logic stays in the API, which keeps
ownership and the database in one place.

- The `orders` queue registers two repeatable jobs when the worker boots
  (`apps/workers/src/jobs/orders/expire-orders-scheduler.service.ts`): the
  expiry sweep, on `EXPIRE_ORDERS_CRON_PATTERN`, and the identity retention
  sweep, on `ASSISTED_IDENTITY_RETENTION_CRON_PATTERN`, both in
  `packages/queue/src/jobs/orders.jobs.ts`.
- The processor (`expire-orders.processor.ts`) calls the matching internal API
  operation with the shared secret in the `INTERNAL_JOBS_SECRET_HEADER` header;
  the API's `InternalJobsSecretGuard` checks it and the routes are not exposed
  publicly. The buyer-request erasure uses the same guard but is never
  scheduled.
- Queue names and job options are in `packages/queue`.

## Related

Next: [security-payments.md](security-payments.md) for the payment state machine
the order moves through, and [architecture.md](architecture.md) for the module
map. Seller-facing behavior: [product.md](product.md); operator access:
[admin.md](admin.md).
