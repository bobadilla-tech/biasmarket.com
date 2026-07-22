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

Applies to both seller accounts and buyer accounts (see product.md §4.8 — buyers
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

For proof-of-payment:

- Max size (e.g. 5MB)
- Allowed types:

  - image/jpeg
  - image/png
- Virus scan (optional future)
- File is always associated with one `order_id` and inherits that order's
  `store_id` — sellers can only view proofs for their own store's orders

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
[product.md §4.6](product.md#46-checkout--order-creation-flow)).

But for limited-stock items (photocards, limited drops) that creates a real risk
if left unguarded: an order could sit in `PENDING_PAYMENT` indefinitely while
holding a unit hostage from other buyers. The flow below adds **soft-hold +
expiration** to prevent that, and is explicit about what does and doesn't count
as a confirmed sale at each step.

### 9.2 Flow

1. **Order created** → status `PENDING_PAYMENT`
   - Created as soon as buyer completes checkout (before any payment evidence
     exists) — this is intentional, see
     [product.md §4.6](product.md#46-checkout--order-creation-flow) for why
     (group-order demand aggregation)
   - Places a **soft hold** on stock (reserved, not decremented from sellable
     inventory)
   - Required payment amount is computed at creation time from the store's
     configured deposit rule and the selected delivery method (see
     [product.md §4.4](product.md#44-payment-configuration-seller-panel) and
     [§4.5](product.md#45-delivery-methods-seller-panel))
   - `expires_at` timestamp is set (store-configurable window, default 24–48h —
     open decision, see [product.md §6](product.md#6-open-decisions))
2. Buyer uploads payment proof → status `PAYMENT_SUBMITTED`
   - Soft hold remains in place
3. Seller reviews in the panel:
   - **Approve** → `VERIFIED`
     - This is the only point at which the order becomes a real, confirmed sale
       — stock hold converts to a real decrement, order counts toward sales
       totals
     - Order proceeds into the fulfillment states from
       [product.md §4.7](product.md#47-order-tracking-states-public-storefront--seller-panel):
       `ORDERING` → `IN_TRANSIT` → `READY` → `COMPLETED`
   - **Reject** → `REJECTED`
     - Soft hold released, stock returns to available pool
4. **Expiration job:** a scheduled job checks for orders still in
   `PENDING_PAYMENT` past their `expires_at`
   - Status set to `CANCELLED`
   - Soft hold released automatically
   - No seller action required

### 9.3 State summary

| Status                              | Stock effect        | Counts as sale | Buyer-visible |
| ----------------------------------- | ------------------- | -------------- | ------------- |
| `PENDING_PAYMENT`                   | soft hold           | No             | Yes           |
| `PAYMENT_SUBMITTED`                 | soft hold           | No             | Yes           |
| `VERIFIED`                          | confirmed decrement | Yes            | Yes           |
| `ORDERING` / `IN_TRANSIT` / `READY` | confirmed           | Yes            | Yes           |
| `COMPLETED`                         | confirmed           | Yes            | Yes           |
| `REJECTED`                          | hold released       | No             | Yes           |
| `CANCELLED` (expired)               | hold released       | No             | Yes           |

### 9.4 Future Upgrade Path

- Stripe / MercadoPago integration for automatic verification (removes the
  manual review step for stores that opt in)
- Hybrid manual + automated, selectable per store, consistent with the
  configurable-payment-methods approach in
  [product.md §4.4](product.md#44-payment-configuration-seller-panel)

---

## 10. Storage Strategy

Use:

- Cloudflare R2 (cheap, scalable) — **spec only.** The MVP deploy actually
  uses self-hosted MinIO instead (see
  [deploy.md](deploy.md#image-uploads-minio)); payment-proof uploads aren't
  implemented yet, only product images and store logos.

Store:

- Product images
- Payment proofs

Save only:

- URL in DB
