# Security, API Design & Payments

Validation rules, why REST over tRPC, and the manual payment flow.

## 7. Security & Validation (Critical)

### 7.1 Password Handling (Salt)

Passwords are hashed with better-auth's `hashPassword` (salted). Seller
credentials live in better-auth's `Account` rows; buyer credentials in
`BuyerAccount.passwordHash` (`modules/customer-auth/customer-auth.service.ts`).
Never store or log a raw password.

Never:

- Store raw passwords
- Use unsalted hashes

The rule applies to seller accounts and buyer accounts alike (see
[product.md §5.8](product.md#58-buyer-authentication-public-storefront)); the
two identity systems are described in [§7.5](#75-seller-and-buyer-identity).

---

### 7.2 Input Validation

The API validates request bodies with class-validator DTOs behind a global
`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`
(`apps/api/src/main.ts`), so unknown fields are rejected. Multipart routes
(proof uploads, checkout) cannot use a body DTO for the fields that arrive next
to the file; those fields are validated by hand (for example `buildValidatedDto`
in `checkout.controller.ts`, and the explicit field checks in
`BuyerPaymentProofService`). Zod is used in `apps/web` at the HTTP boundary, not
in the API.

Ownership is enforced in the service layer: every seller mutation calls
`assertOwnership(storeId, userId)` and every tenant query filters by `storeId`.
It is not a DTO or guard concern; there is no tenant middleware. A DTO can prove
that a field is well-formed but not that the seller owns the store it names.

---

### 7.3 File Upload Validation

For payment images (seller-recorded or buyer-submitted via `OrderPayment`, see
§9.2):

- Max size (5MB)
- Allowed types:

  - image/jpeg
  - image/png
  - application/pdf (checkout-time buyer proofs only)

- Virus scan (optional future)
- The image is attached to an `OrderPayment` row that carries `orderId` +
  `storeId`, and reads go through an authenticated, ownership-checked endpoint
  (`GET /stores/:storeId/orders/:orderId/payments/:paymentId/image`) — sellers
  can only view their own store's orders

---

### 7.4 Abuse Prevention

Server actions are endpoints even without a public API, so each route that a
visitor can reach carries its own controls. The numeric limits live next to each
route in the code (the `@Throttle` decorator); this section does not maintain
them, and this table names the controls and where to read them.

| Control                                       | Applies to                                                                                                                                                                                                                                  | Where defined                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ThrottlerGuard`, per IP                      | Buyer checkout. This is the control against spamming `PENDING_PAYMENT` orders to exhaust limited stock (see §9.2); it keys on IP only, not on buyer account                                                                                 | `modules/orders/infrastructure/checkout.controller.ts`                                                                                          |
| `ThrottlerGuard`, per IP                      | Private-link routes: read the order, packed photo, proof upload, proof image, invite beacon, receipt confirmation, claim ticket                                                                                                             | `modules/orders/infrastructure/public-order-events.controller.ts`                                                                               |
| `ThrottlerGuard`, per IP                      | Buyer proof upload from a signed-in buyer session                                                                                                                                                                                           | `modules/orders/infrastructure/customer-order-payments.controller.ts`                                                                           |
| `ThrottlerGuard`, per IP, plus `OriginGuard`  | Buyer login, registration and password-reset requests, per store and global                                                                                                                                                                 | `modules/customer-auth/customer-auth.controller.ts`, `global-account.controller.ts`                                                             |
| `ThrottlerGuard`, per IP                      | Buyer Google sign-in start and callback                                                                                                                                                                                                     | `modules/customer-auth/buyer-google.controller.ts`                                                                                              |
| `ThrottlerGuard`, per IP                      | Contact form, restock requests, public product search, public store routes and sitemap data                                                                                                                                                 | `modules/contact`, `modules/restock`, `modules/products/product-search.controller.ts`, `modules/stores/stores.controller.ts`, `modules/coupons` |
| `ThrottlerGuard`, per IP                      | Seller packed-photo upload, payment recording and coupon redemption (the seller is signed in, the bucket is still the IP)                                                                                                                   | `modules/orders/infrastructure/order.controller.ts`                                                                                             |
| `SellerThrottlerGuard`, per signed-in user id | Seller assisted-order routes (create, link regeneration, phone correction, buyer notices); falls back to the IP when there is no session                                                                                                    | `common/guards/seller-throttler.guard.ts`, `modules/orders/infrastructure/assisted-orders.controller.ts`                                        |
| Per-store recipient window                    | Assisted-order creation: a seller can reach only a limited number of distinct recipients per store in a rolling window                                                                                                                      | `ASSISTED_ORDER_RECIPIENT_LIMIT` and `ASSISTED_ORDER_RECIPIENT_WINDOW_MS` in `modules/orders/application/create-assisted-order.usecase.ts`      |
| better-auth rate limiter                      | Seller sign-in, sign-up and related auth routes. better-auth mounts as raw Express middleware, so a Nest guard cannot reach them                                                                                                            | `rateLimit` in `apps/api/src/auth/auth.config.ts`                                                                                               |
| `OriginGuard`                                 | Buyer routes that change state under a browser cookie (login, registration, password change, profile update, claim ticket). A verified bearer token, or a missing origin on routes marked `@AllowNoOrigin()`, is allowed for native clients | `modules/customer-auth/origin.guard.ts`                                                                                                         |
| Shared-secret guards plus `ThrottlerGuard`    | Internal job routes (order expiry, identity retention, premium expiry), the monitoring webhook, sitemap data                                                                                                                                | `InternalJobsSecretGuard`, `MonitoringWebhookSecretGuard`, `SitemapInternalTokenGuard`                                                          |
| Input sanitization                            | Operation codes and free-text notes on payment proofs (normalization, control and bidi characters rejected)                                                                                                                                 | `apps/api/src/common/text-sanitize.ts`                                                                                                          |

To list every throttled route: `grep -rn "@Throttle" apps/api/src`. Each module
that throttles registers its own `ThrottlerModule`; there is no global
throttler. CSRF protection for the buyer side is the `OriginGuard` row above; a
token-based CSRF scheme is not implemented. Seller routes have no separate CSRF
token either; cross-origin access is limited by CORS (`common/cors-options.ts`,
locked to `WEB_URL`) and by better-auth's `trustedOrigins` in `auth.config.ts`.

Public IP limits follow the visitor, not the proxy. The path is client →
Cloudflare → Caddy → API.

`infra/vps/Caddyfile` trusts only
[Cloudflare's published ranges](https://www.cloudflare.com/ips/) and reads
`CF-Connecting-IP`. Cloudflare sets that header and a direct connection to the
origin is not in the trusted list, so a forged `CF-Connecting-IP` or
`X-Forwarded-For` is ignored. Caddy then sends that one address to the API.

The API sets Express `trust proxy` to `1` (`apps/api/src/main.ts`), so `req.ip`
is the address Caddy added. It is not `true`: that setting uses the leftmost
`X-Forwarded-For` entry, which the visitor can choose. Two different rightmost
addresses are two throttle buckets; a spoofed prefix on the same rightmost
address is still one bucket.

---

### 7.5 Seller and buyer identity

Two separate identity systems exist. They share no session mechanism, tables or
guards: sellers and admins use better-auth (`User`, `Session`, `Account`);
storefront buyers use a stateless signed session over `BuyerAccount`. A route is
one or the other. Buyer routes carry `@Public()` to opt out of the global seller
`AuthGuard` and use `CustomerSessionGuard` instead
(`modules/customer-auth/customer-session.guard.ts`).

#### Sellers and admins (better-auth)

Configuration is in `apps/api/src/auth/auth.config.ts`, mounted through
`@thallesp/nestjs-better-auth` with the Prisma adapter.

- **Email and password** with email verification required. A sign-in attempt
  with an unverified account resends the verification email. Following the
  verification link verifies the address and signs the seller in once; a reused
  link does not create a session.
- **Anti-enumeration.** A sign-up with an address that already exists returns a
  synthetic user, so the response matches a real sign-up. `customSyntheticUser`
  supplies the `role` default so the response does not differ on that field.
- **Google sign-in** is registered only when both `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` are set, so environments without an OAuth client boot
  unchanged. Account linking is enabled for Google only. Because linking skips
  the local-email-verified check, linking Google to an account whose email was
  never verified discards that account's password credentials and sessions
  (`auth/google-link-cleanup.ts`).
- **`bearer` plugin.** Native clients may send the session token as
  `Authorization: Bearer`; browsers keep using the session cookie. Both
  transports work per request.
- **Role.** The `admin` plugin owns `role`; new users get `seller`. The role is
  server-controlled: it is not an input on sign-up or profile update. Admin
  routes carry `@Roles(['admin'])` (contact inquiries, store administration,
  coupons, users, monitoring). Promotion is an operator task, see
  [admin-access.md](admin-access.md); the admin UI is described in
  [admin.md](admin.md).
- **Plan and premium.** `User.plan` and `User.premiumUntil` are exposed on the
  session but are not inputs; coupon redemption writes them, and a scheduled
  expiry job in `apps/workers` (the `premium` queue) resets them. See
  [architecture.md](architecture.md).
- **Origins.** `trustedOrigins` and the CORS policy are both limited to
  `WEB_URL`.

#### Buyers (`BuyerAccount`)

- **Accounts.** One `BuyerAccount` per person across all stores: unique phone,
  optional password hash, optional `googleSub` (Google's stable subject, so a
  later email change cannot redirect a Google login into another account).
  `CustomerStoreLink` records which stores an account has bought from. The
  per-store `Customer` row is a projection for the seller's customer list, not
  the login root.
- **Login.** Phone plus password. Failure is the same generic error whether the
  phone is unknown or the password is wrong. Forgot-password always resolves and
  never says whether an account exists.
- **Session.** A signed token (HMAC with `CUSTOMER_ACCOUNT_TOKEN_SECRET`) in an
  `httpOnly` cookie (`bm_customer_session`, `secure` in production), or as a
  bearer token for the mobile app; the cookie wins when both are present. The
  guard reissues the token on every authenticated request, so activity extends
  the session; the lifetime is `CUSTOMER_SESSION_TTL_MS`.
- **`passwordVersion`.** `BuyerAccount.passwordVersion` is embedded in the token
  and incremented on every password change. The guard rejects a token whose
  version differs from the row, which is the only session revocation this
  stateless design has. Google-only accounts have no password hash and still get
  sessions.
- **Emailed links.** Confirm, reset, change-email and change-phone links are
  signed tokens with a purpose. Sensitive purposes live for a much shorter time
  than confirmation (`packages/utils/src/customer-account-token`). A confirm
  token cannot overwrite a password once one is set.
- **Google for buyers** (`buyer-google.controller.ts`, `buyer-google-oauth.ts`):
  a signed `state` plus a nonce cookie scoped to the OAuth routes. The global
  entry point signs a buyer in without choosing a store; the store link is
  created on the first order there.
- **Claim ticket.** An assisted-order buyer can save the order into an account
  with Google (lifecycle in
  [assisted-orders.md](assisted-orders.md#claiming-an-order)). The browser first
  POSTs to get a signed ticket in an `httpOnly` cookie scoped to the OAuth
  routes, so the order token, the order id and any capability never appear in a
  URL or in the OAuth `state`. The ticket is signed with the same secret under
  its own context prefix (it cannot pass as a session token), lives for
  `CLAIM_TICKET_TTL_MS`, and binds a fingerprint of the current link, so
  regenerating the link invalidates tickets minted from the old one.
- **`OriginGuard`** (`customer-auth/origin.guard.ts`) enforces same-origin on
  buyer routes that mutate state under a cookie. It skips the check only for a
  bearer token that actually verifies, or, on routes marked `@AllowNoOrigin()`,
  when the request has neither `Origin` nor `Referer`. A request with a foreign
  origin is rejected in every case.

#### Security-critical environment variables

Names only; values are set per environment (see [deploy.md](deploy.md)).
`validateEnv` (`apps/api/src/config/env.validation.ts`) refuses to boot when a
required one is missing.

| Variable                                   | Used for                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`    | better-auth session signing and base URL (seller auth)                   |
| `CUSTOMER_ACCOUNT_TOKEN_SECRET`            | buyer session tokens, emailed-link tokens, claim tickets                 |
| `INTERNAL_JOBS_SECRET`                     | shared secret for the internal job routes that `apps/workers` calls      |
| `MONITORING_WEBHOOK_SECRET`                | shared secret for the Uptime Kuma incident webhook                       |
| `SITEMAP_INTERNAL_TOKEN`                   | token for the internal sitemap data routes                               |
| `WEB_URL`                                  | CORS origin, `trustedOrigins` and the `OriginGuard` allowed origin       |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional; enable Google sign-in for sellers and buyers when both are set |

#### Redaction

Private-link tokens and reset tokens must not reach stdout, error bodies or the
error tracker. The API's exception filter and the Sentry event scrubber replace
the token segment of `/public/orders/:token` and `/pedido/:token` URLs and drop
the query string (`apps/api/src/common/scrub-request-url.ts`,
`error-tracking.ts`). The payload of order events is limited to an allow-list of
keys. Details and how to check the scrubbing are in
[incident-response.md](incident-response.md).

---

## 8. Server Actions vs tRPC vs REST

### Recommendation: Stick with NestJS REST

#### Why NOT tRPC here:

- Tight coupling frontend/backend
- Harder scaling across services
- NestJS already structured

#### Server Actions:

- Good for Next.js frontend
- BUT:

  - Still exposed endpoints
  - Must validate input
  - Must enforce auth

### Best Setup:

- NestJS REST API
- Optional Next.js frontend using server actions as a thin layer

---

## 9. Payment Flow Design (Manual)

### 9.1 Why orders exist before payment

An order is created in `PENDING_PAYMENT` as soon as checkout completes — before
any payment evidence exists. This is intentional: group-order/import sellers
need to see demand before placing the bulk purchase in Korea (see
[product.md §5.6](product.md#56-checkout--order-creation-flow)).

But for limited-stock items (photocards, limited drops) that creates a real risk
if left unguarded: an order could sit in `PENDING_PAYMENT` indefinitely while
holding a unit hostage from other buyers. The flow below adds **soft-hold +
expiration** to prevent that, and is explicit about what does and doesn't count
as a confirmed sale at each step.

### 9.2 Flow (what's actually live)

1. **Order created** → `paymentStatus PENDING_PAYMENT`
   - Created as soon as buyer completes checkout (before any payment evidence
     exists) — intentional, see
     [product.md §5.6](product.md#56-checkout--order-creation-flow) for why
     (group-order demand aggregation)
   - Places a **soft hold** on stock (`ProductVariant.reserved` — reserved, not
     decremented from sellable inventory)
   - Required payment amount is computed at creation time from the store's
     configured deposit rule and the selected delivery method (see
     [product.md §5.4](product.md#54-payment-configuration-seller-panel) and
     [§5.5](product.md#55-delivery-methods-seller-panel))
   - `expiresAt` is set from `Store.holdWindowHours` (default 48h,
     store-configurable)
   - Seller-assisted orders use the V1 rule: pickup may require a 30% deposit
     when the seller selects `PARTIAL`; courier orders require the full amount.
     Buyer checkout continues to use the store's configured deposit rule.
2. **Checkout collects proof when the payment method is configured, then offers
   a WhatsApp handoff** — Yape/Plin/transfer checkouts with complete account
   details require an in-app JPEG/PNG/PDF proof (uploaded through
   `CheckoutController`), stored as a `BUYER_SUBMITTED`/`PENDING_REVIEW`
   `OrderPayment` by `create-order.usecase.ts`. A method counts as configured
   when `isPaymentMethodConfigured` (`packages/utils/src/payment-methods`) says
   the store entered real account details. CASH, no selected method, or an
   incompletely configured method skips the upload. In either case,
   `create-order.usecase.ts` may build a pre-filled `wa.me` link from
   `Store.whatsappNumber`; if no number is configured the link is null and the
   buyer sees the payment instructions/result in-app.
3. **Seller records what came in** —
   `POST /stores/:storeId/orders/:orderId/payments` (`order.controller.ts`
   `addPayment`, AuthGuard + `assertOwnership`): the seller enters amount,
   method, optional note, and an **optional image** (max 5MB, JPEG/PNG,
   magic-byte validated — see §7.3) that goes to a private bucket
   (`S3_PAYMENT_BUCKET`) readable only through the authenticated,
   ownership-checked endpoint above. A partial amount → `PARTIALLY_PAID`;
   recording enough to reach `requiredAmount` routes straight through the
   approve path (next step) → `VERIFIED`
   - A seller may void a recorded or approved payment only while fulfillment is
     still `ORDERING` and before the order is `VERIFIED`. Voiding records the
     actor, timestamp and reason, keeps the payment in history, and recalculates
     the payment status from the remaining non-voided payments. The result may
     be `PARTIALLY_PAID`, `PAYMENT_SUBMITTED` when an unreviewed proof remains,
     or `PENDING_PAYMENT`.
4. **Seller approves / rejects** —
   `PATCH /stores/:storeId/orders/:orderId/review`
   (`review-payment.usecase.ts`):
   - **Approve** → `VERIFIED`
     - The only point at which the order becomes a real, confirmed sale: the
       soft hold converts to a real stock decrement, the order counts toward
       sales totals, an `AuditLog` row is written, and the buyer gets a status
       email
     - Requires at least one recorded payment (`paidAmount > 0`); a seller may
       approve on a partial deposit per the store's own deposit rules, and may
       approve/reject straight from `PENDING_PAYMENT` — the comment in
       `order-status.vo.ts` explains why `PAYMENT_SUBMITTED` isn't guaranteed
     - The order proceeds into the fulfillment states from
       [product.md §5.7](product.md#57-order-tracking-states-public-storefront--seller-panel):
       `ORDERING → IN_TRANSIT → READY → COMPLETED`
   - **Reject** → `REJECTED`
     - Soft hold released, stock returns to the available pool, `AuditLog`
       written; rejection is terminal (no re-open/resubmit path in the MVP)
5. **Expiration sweep** —
   `apps/workers/src/jobs/orders/expire-orders-scheduler.service.ts` registers a
   repeatable BullMQ job. Its processor calls the API's
   `POST /internal/orders/expire-sweep` endpoint, protected by the shared
   internal-jobs secret and network isolation. The API expires any reserved-hold
   status (`PENDING_PAYMENT`, `PARTIALLY_PAID`, or `PAYMENT_SUBMITTED`) past
   `expiresAt`, sets it to `CANCELLED`, and releases the soft hold with no
   seller action required.
6. **Seller cancel** — `PATCH /stores/:storeId/orders/:orderId/cancel`
   (`cancel-order.usecase.ts`). Allowed until fulfillment is `COMPLETED`, and
   not on a `REJECTED` or already `CANCELLED` order. The seller records a
   `CancellationResolution` (`REFUNDED`, `RETAINED` or `STORE_CREDIT`) and an
   optional reason, which decide how the paid amount is split into retained and
   released amounts on the order. `Order.status` becomes `CANCELLED`, `closedAt`
   is stamped, the soft hold is released if the order was still holding stock,
   and an `AuditLog` row and an `ORDER_CANCELLED` order event are written. A
   `VERIFIED` order can be cancelled this way (see `order-status.vo.ts`); the
   expiration sweep records `RETAINED` for whatever was paid.

Two axes are tracked next to `paymentStatus` and `fulfillmentStatus`:
`Order.status` (`ACTIVE` or `CANCELLED`) records cancellation, and a shipping
step (`PATCH .../shipping` for tracking, `POST .../shipping/photo` for a packed
photo, stored in the private payment bucket) is independent of both.

Per-proof review and voiding use the payment routes listed in
[§9.3.1](#931-buyer-proof-upload-by-private-link).

### 9.3 State summary

| Status                              | Stock effect        | Counts as sale | Reached by                                                                                                                                                                                                                                                  |
| ----------------------------------- | ------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PENDING_PAYMENT`                   | soft hold           | No             | order creation                                                                                                                                                                                                                                              |
| `PARTIALLY_PAID`                    | soft hold           | No             | seller records a partial payment                                                                                                                                                                                                                            |
| `PAYMENT_SUBMITTED`                 | soft hold           | No             | voiding a payment (`void-order-payment.usecase.ts`) that leaves an unreviewed buyer proof and nothing paid; from here the order moves to `PARTIALLY_PAID`, `VERIFIED`, `REJECTED` or `CANCELLED` (`order-status.vo.ts`). Submitting a proof does not set it |
| `VERIFIED`                          | confirmed decrement | Yes            | seller approve (or recording enough to reach `requiredAmount`)                                                                                                                                                                                              |
| `ORDERING` / `IN_TRANSIT` / `READY` | confirmed           | Yes            | seller fulfillment advance (gated on `VERIFIED`)                                                                                                                                                                                                            |
| `COMPLETED`                         | confirmed           | Yes            | seller fulfillment advance                                                                                                                                                                                                                                  |
| `REJECTED`                          | hold released       | No             | seller reject (terminal)                                                                                                                                                                                                                                    |
| `CANCELLED`                         | hold released       | No             | expiration sweep, or seller cancel                                                                                                                                                                                                                          |

The `PAYMENT_SUBMITTED` **order event** is a separate thing from the status: it
is recorded for every buyer proof submitted and every seller-recorded payment,
and it appears on the buyer's timeline whatever `paymentStatus` is.

The buyer follows the order from `PENDING_PAYMENT` to `COMPLETED` on
`/store/[slug]/account` (single-store buyer order history).

### 9.3.1 Buyer proof upload by private link

A buyer proof reaches the same `OrderPayment` row (`BUYER_SUBMITTED` /
`PENDING_REVIEW`) through three entry points, all validated by
`BuyerPaymentProofService` (the checkout path also goes through
`create-order.usecase.ts`):

| Entry point                 | Route                                                 | Who                                           |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| Checkout                    | `POST /stores/:slug/checkout` (multipart)             | a buyer placing an order (§9.2 step 2)        |
| Buyer session               | `POST /stores/:slug/account/orders/:orderId/payments` | a signed-in buyer, from the order detail page |
| Private link (this section) | `POST /public/orders/:token/payments`                 | an assisted-order buyer with only the link    |

The rest of this section describes the private-link entry point, whose limits
and rules the session upload shares.

An assisted order's buyer has no account, only the private link. Two public
routes (both in `public-order-events.controller.ts`) let them pay without one:

- `POST /public/orders/:token/payments` (multipart: `amount`, `method`, optional
  `operationCode` and `note`, `file`).
- `GET /public/orders/:token/payments/:paymentId/image` (the buyer's own proof).

Guard order is fixed: `ThrottlerGuard` (10/min per IP for the upload, 30/min for
the image), then `PublicOrderTokenGuard`, then Multer. The guard resolves the
token with the same single hash lookup and the same `404 Pedido no encontrado`
as `GET /public/orders/:token`, so an unknown or revoked token gets that answer
before any multipart body is parsed, even with an invalid file. A `POST` that is
not `multipart/form-data` gets `415` (after the 404 check; the image `GET` is
never 415).

Limits and rules, shared with the session upload through
`BuyerPaymentProofService`:

- JPEG or PNG only, by magic bytes, up to 5 MB; Multer cuts off anything larger
  (`PAYMENT_PROOF_UPLOAD_LIMITS`: 1 file, 8 fields, 4096-byte fields).
- `amount` is a string `^\d{1,9}(\.\d{1,2})?$` of at least one cent.
- The balance is `pending - pending proofs`, from `computePaymentSummary`
  (voided payments never count). At most 5 proofs may wait for review.
- Cancelled, rejected, settled, shipped, or expired-but-unswept orders get a
  `400` and nothing is uploaded. The guard's copy of the order is only used for
  these pre-checks: the service re-reads status, expiry and payments under
  `SELECT ... FOR UPDATE` and re-applies every rule, and deletes the uploaded
  object if the transaction fails.
- The row is `BUYER_SUBMITTED` / `PENDING_REVIEW`; `paymentStatus` does not
  change. The buyer page derives "in review" from the pending proof.
- The `PAYMENT_SUBMITTED` event payload has exactly `paymentId, amount, method`.
  The operation code, the note, the original file name, the IP and the user
  agent never reach events, audit logs, notifications or logs.

The image route runs one compound query (`id`, `orderId` of the token's order,
`source = BUYER_SUBMITTED`, image present). Every miss (other order, other
store, seller capture, no image, unknown id) is the same
`404 Comprobante no encontrado`. The content type is forced from an allow-list
(`image/jpeg`, `image/png`) and the response carries
`Cross-Origin-Resource-Policy: cross-origin` (the web app and the API are
different origins), `nosniff`, a `default-src 'none'; sandbox` CSP,
`Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`. Browsers
must not send custom request headers to these routes: a preflight would be
rejected by `allowedHeaders`.

**Seller side.** The seller sees buyer proofs next to the payments they record
themselves. Two routes in `order.controller.ts` act on one payment:
`PATCH /stores/:storeId/orders/:orderId/payments/:paymentId/review` approves or
rejects a pending proof, and `.../void` voids a recorded payment (§9.2 step 3).
The seller reads the image through
`GET /stores/:storeId/orders/:orderId/payments/:paymentId/image`, which is
ownership-checked like every other seller route. Approving a proof writes a
`payment_proof.approved` audit row. If the approved total reaches
`requiredAmount` the order then goes through the approve path of §9.2 step 4;
otherwise it becomes `PARTIALLY_PAID`. Review and void decisions are written to
the audit log and the order timeline; the full action list is in
[assisted-orders.md](assisted-orders.md#audit-log-actions).

PDF proofs are not accepted here (the checkout route still takes them). To
enable them later, use `PROOF_UPLOAD_MIME_TYPES` on the upload route, extend the
image route's content-type allow-list, and render PDFs as a download link in
both the buyer and the seller viewers.

### 9.4 Future Upgrade Path

- **Automated proof hardening** — virus scanning, image re-encoding/EXIF
  stripping, and automated payment-provider verification remain future work. The
  live buyer-proof flow deliberately reuses `OrderPayment` rather than a
  separate `PaymentProof` model.
- Stripe / MercadoPago integration for automatic verification (removes the
  manual review step for stores that opt in)
- Hybrid manual + automated, selectable per store, consistent with the
  configurable-payment-methods approach in
  [product.md §5.4](product.md#54-payment-configuration-seller-panel)

---

## 10. Storage Strategy

Use:

- Cloudflare R2 (cheap, scalable) — **spec only.** The deploy actually uses
  self-hosted MinIO instead (see [operations.md](operations.md#minio)): product
  images and store logos live in public buckets. Buyer and seller proofs are
  `OrderPayment.imageUrl` rows in the private payment bucket
  (`S3_PAYMENT_BUCKET`), served only through the authenticated or token-checked
  routes described in §7.3, §9.2 and §9.3.1. Packed photos are private too.

Store:

- Product images (public)
- Payment proofs and packed photos (private; buyer-submitted and
  seller-recorded)

Save only:

- URL in DB

---

## Related

Next: [assisted-orders.md](assisted-orders.md) for the seller-created order
lifecycle that builds on §9, then [architecture.md](architecture.md) for where
the code lives. Admin and operator access: [admin.md](admin.md).
