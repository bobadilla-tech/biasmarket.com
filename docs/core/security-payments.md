# Security, API Design & Payments

Validation rules, why REST over tRPC, and the manual payment flow.

## 7. Security & Validation (Critical)

### 7.1 Password Handling (Salt)

Use:

- bcrypt with salt rounds (>=10)

```ts
bcrypt.hash(password, saltRounds);
```

Never:

- Store raw passwords
- Use unsalted hashes

Applies to both seller accounts and buyer accounts (see product.md §5.8 — buyers
authenticate with phone + password, same hashing rule applies).

---

### 7.2 Input Validation

Use:

- class-validator (DTOs)
- Zod (optional for stricter schemas)

#### Example

```ts
email: string;
```

Store-scoped validation — new

Because the platform is multi-tenant, every DTO for a store-owned resource
(product, order, payment config) must validate that the authenticated seller
actually owns the `store_id` being acted on — not just that the fields are
well-formed. This is an authorization check, not just a shape check, and it
belongs at the DTO/guard layer so it can't be skipped by a route that forgets to
check.

---

### 7.3 File Upload Validation

For payment images (seller-recorded via `OrderPayment`, see §9.2 — there is no
buyer upload in the MVP):

- Max size (5MB)
- Allowed types:

  - image/jpeg
  - image/png
- Virus scan (optional future)
- The image is attached to an `OrderPayment` row that carries `orderId` +
  `storeId`, and reads go through an authenticated, ownership-checked endpoint
  (`GET /stores/:storeId/orders/:orderId/payments/:paymentId/image`) — sellers
  can only view their own store's orders

---

### 7.4 Abuse Prevention

Even without "public API", server actions = endpoints

Add:

- Rate limiting (IP-based)
- CSRF protection
- Input sanitization
- Rate limiting on order creation specifically (per IP and per buyer account) to
  prevent someone from spamming `PENDING_PAYMENT` orders to exhaust
  limited-stock items — see §9.2 below, this is the main abuse vector this flow
  needs to guard against, since an order exists before payment is confirmed

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

> **Buyer-proof-upload caveat (stale as of this note, kept for history):** this
> caveat used to say the MVP does not collect an in-app payment proof — that's
> no longer true. Checkout now collects a buyer-submitted proof (uploaded
> straight through `CheckoutController`) and records it as an `OrderPayment`
> row with `source: 'BUYER_SUBMITTED'`/`reviewStatus: 'PENDING_REVIEW'` — see
> `create-order.usecase.ts`, the block right before its `whatsappUrl`
> construction. A proof upload is required only when the buyer's chosen manual
> payment method (YAPE/PLIN/TRANSFER) is both selected and the store has
> actually configured real account details for it
> (`isPaymentMethodConfigured`, `packages/utils/src/payment-methods/index.ts`);
> for CASH, no method selected, or a method the store enabled but never
> finished configuring, checkout still falls back to the **WhatsApp handoff**
> described below.

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
2. **Checkout hands the buyer off to WhatsApp** — `create-order.usecase.ts`
   builds a pre-filled `wa.me` link from `Store.whatsappNumber` (order id,
   items, total, delivery + payment method) and the storefront redirects there
   (`checkout-form.tsx`); if the store has no WhatsApp number configured the
   link is null and the buyer just gets the payment instructions. Payment
   happens wherever buyer and seller coordinate — outside the app, with no
   buyer-side evidence collected here
3. **Seller records what came in** —
   `POST /stores/:storeId/orders/:orderId/payments` (`order.controller.ts`
   `addPayment`, AuthGuard + `assertOwnership`): the seller enters amount,
   method, optional note, and an **optional image** (max 5MB, JPEG/PNG,
   magic-byte validated — see §7.3) that goes to a private bucket
   (`S3_PAYMENT_BUCKET`) readable only through the authenticated,
   ownership-checked endpoint above. A partial amount → `PARTIALLY_PAID`;
   recording enough to reach `requiredAmount` routes straight through the
   approve path (next step) → `VERIFIED`
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
5. **Expiration sweep** — `orders-cron.service.ts` (`@Cron("*/5 * * * *")`)
   checks for orders still in `PENDING_PAYMENT` past their `expiresAt`
   - Status set to `CANCELLED`, soft hold released automatically, no seller
     action required

### 9.3 State summary

| Status                              | Stock effect        | Counts as sale | Reached by                                                                                                                                                     |
| ----------------------------------- | ------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PENDING_PAYMENT`                   | soft hold           | No             | order creation                                                                                                                                                 |
| `PARTIALLY_PAID`                    | soft hold           | No             | seller records a partial payment                                                                                                                               |
| `PAYMENT_SUBMITTED`                 | soft hold           | No             | legal state in the model, but no current code path sets it — sellers approve/reject from `PENDING_PAYMENT`/`PARTIALLY_PAID` based on the WhatsApp conversation |
| `VERIFIED`                          | confirmed decrement | Yes            | seller approve (or recording enough to reach `requiredAmount`)                                                                                                 |
| `ORDERING` / `IN_TRANSIT` / `READY` | confirmed           | Yes            | seller fulfillment advance (gated on `VERIFIED`)                                                                                                               |
| `COMPLETED`                         | confirmed           | Yes            | seller fulfillment advance                                                                                                                                     |
| `REJECTED`                          | hold released       | No             | seller reject (terminal)                                                                                                                                       |
| `CANCELLED`                         | hold released       | No             | expiration sweep, or seller cancel                                                                                                                             |

The buyer follows the order from `PENDING_PAYMENT` to `COMPLETED` on
`/store/[slug]/account` (single-store buyer order history).

### 9.4 Future Upgrade Path

- **In-app buyer proof upload (not built, deliberately)** — wiring this for real
  (a buyer-facing upload endpoint + `PENDING_REVIEW`/`APPROVED`/`REJECTED`
  review) is a possible future addition, only worth building if real sellers
  report the WhatsApp handoff as actual friction (audit §3, §16 #7). The
  `PaymentProof` model was deleted rather than left half-wired, so building it
  would mean a new schema model + migration, a buyer upload API, and a review
  surface. (The `docs/business/buyer-flow.md`/`seller-flow.md` diagrams document
  the current WhatsApp handoff + seller-recorded flow.)
- Stripe / MercadoPago integration for automatic verification (removes the
  manual review step for stores that opt in)
- Hybrid manual + automated, selectable per store, consistent with the
  configurable-payment-methods approach in
  [product.md §5.4](product.md#54-payment-configuration-seller-panel)

---

## 10. Storage Strategy

Use:

- Cloudflare R2 (cheap, scalable) — **spec only.** The MVP deploy actually uses
  self-hosted MinIO instead (see [deploy.md](deploy.md#image-uploads-minio)):
  product images and store logos live in public buckets, and seller-recorded
  payment images (`OrderPayment.imageUrl`) go to a separate **private** bucket
  (`S3_PAYMENT_BUCKET`) served only through the authenticated, ownership-checked
  endpoint described in §9.2. There is no buyer-uploaded proof model.

Store:

- Product images (public)
- Seller-recorded payment images (private, authenticated read)

Save only:

- URL in DB
