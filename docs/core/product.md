# Product

What Bias Market is, who it's for, and what the MVP ships.

## 1. Product Overview

**Bias Market** is a store **manager** (not a single store) that lets an
operator create and run one or more storefronts from a single account, starting
with **K-pop / artist merchandise stores** (albums, photocards, fan-made goods)
as the first vertical.

### Core Value Proposition

- Launch a store in minutes (no tech knowledge)
- One account can operate **multiple stores** under the same platform
- Designed specifically for fandom commerce workflows
- Manual payment-first (low friction, no Stripe requirement)
- Built-in proof-of-payment verification system
- Payment rules are **configurable per store**, not hardcoded per business
- Order tracking designed for **import/group-order** commerce, not just in-stock
  retail

### Why this distinction matters

The first real customer (a K-pop import store) already runs on a workflow —
Instagram DMs, Google Forms, manual bank/Yape transfers — that a _store manager_
platform can absorb without forcing that seller into a rigid, one-size-fits
payment/delivery model. The platform's job is to make those rules
**configuration**, not code, so the second, third, and tenth store can each set
their own payment methods, deposit rules, and delivery options without a new
deploy.

---

## 2. Target Market (Initial Niche: K-pop Stores)

### Observations

- K-pop fans frequently:

  - Buy via **group orders (GOs)**
  - Use **manual payments** (bank transfer, Wise, PayPal)
  - Submit **screenshots as proof**
- High demand for:

  - Photocards (randomized SKUs)
  - Albums (versions, pre-orders)
  - Limited drops
- Sellers often operate via:

  - Instagram DMs
  - Google Forms
  - Telegram

### Opportunity

Bias Market replaces:

- Google Forms + Sheets
- Manual DM tracking
- Screenshot chaos

With a structured storefront, a seller admin panel, and an order-tracking
workflow that matches how the product actually moves (ordered → imported →
delivered).

---

## 3. MVP Scope

### 3.1 Onboarding Flow

User answers:

- Business name
- Store handle (URL slug)
- Business type (default: artist merch)
- Store language (ES / EN — see [i18n.md](i18n.md))
- Product categories (albums, photocards, bundles)
- Payment methods:

  - Bank transfer
  - Wise
  - PayPal (manual)

Output: → Auto-generated store + theme

---

### 3.2 Storefront Features

- Product listing:

  - Name
  - Description
  - Images
  - Price
  - Variants (album version, member, etc.)
- Cart system
- Checkout flow (no payment gateway)

### Orders Management

- Status:

  - Pending Payment
  - Payment Submitted
  - Verified
  - Rejected
  - Fulfilled

### Checkout Flow:

1. User places order
2. Receives:

   - Order ID
   - Delirvery Type
   - Payment instructions
3. Is handed off to WhatsApp to pay (payment coordinated with the seller — the
   seller then records it; see 5.6 — no in-app proof upload in the MVP)

### Delivery Status

- Status:

  - Pending
  - Dropped off at courier

---

## 4. Platform Layers

The platform has three distinct layers. Every feature in this document belongs
to exactly one of them, so it's always clear who configures what.

### 4.1 Platform Layer (superadmin)

- Manages all stores and their owners (accounts, plans, suspension)
- Not customer-facing; used only by the Bias Market operator
- Out of scope for MVP beyond basic account/store listing (see
  [architecture.md](architecture.md#3-multi-tenant-design-critical))
- What actually exists today: a `role: "admin"` gate + three screens — contact
  inquiries from the public `/contact` form, stores (listing + impersonation),
  and users (listing + ban) — see [admin.md](admin.md). Account/store management
  beyond that is still unbuilt.

### 4.2 Seller Panel (per store)

- Everything a store owner configures and manages for _their_ store: onboarding,
  catalog, orders, payment methods, delivery options, and order review
- Fully scoped to `store_id` — see [architecture.md](architecture.md)

### 4.3 Public Storefront (per store)

- The customer-facing site a buyer visits to browse and order
- Rendered per store, using that store's configuration (payment methods shown,
  delivery options offered, language)

---

## 5. MVP Scope

### 5.1 Onboarding Flow (Seller Panel)

Seller answers, at signup:

- Business name
- Store handle (URL slug)
- Business type (default: artist merch)
- Product categories (albums, photocards, bundles, lightsticks)
- Payment methods to enable (see 4.4 — not fixed to one country/method)
- Delivery methods to enable (see 4.5) Output: an auto-generated store + default
  theme, ready to publish.

### 5.2 Product Management — CRUD (Seller Panel)

Product CRUD is core MVP functionality — nothing else in this document works
without it, and it's listed as an MVP deliverable in [roadmap.md](roadmap.md).

**Create**

- Required fields: name, description, price, category, at least 1 image
- Optional: variants (see below)
- Product is created in `DRAFT` until the seller explicitly publishes it, so
  half-finished products don't show up on the live storefront **Read / List**

- Seller sees all their store's products (scoped to `store_id`, see
  [security-payments.md §7.2](security-payments.md#72-input-validation))
- Filterable by category and status (draft / published / sold out)
- Buyer-facing listing only shows `PUBLISHED` products (see 4.3) **Update**

- Any field editable after creation, including moving a product back to `DRAFT`
- Toggle `sold out` manually, independent of variant-level stock (a seller may
  want to mark a whole product sold out even if one variant technically has
  stock left, e.g. reserved for another channel) **Delete**

- **Soft delete only.** A product referenced by an existing order (any status,
  including `CANCELLED`) cannot be hard-deleted — this would break the
  stock/state logic in
  [security-payments.md §9](security-payments.md#9-payment-flow-design-manual)
  and make past orders unreadable in the seller's history
- Soft-deleted products disappear from the storefront and from the default
  product list, but remain resolvable from existing orders **Variants**

- A product can have one or more variants (e.g. album version, member, size)
- Each variant has: its own stock count (or unlimited/N-A for made-to-order
  items), optional price override, optional image override
- Stock decrement on `VERIFIED` (see
  [security-payments.md §9.2](security-payments.md#92-flow)) happens at the
  variant level if variants exist, otherwise at the product level **Images**

- Stored in object storage (public bucket — MinIO in the current deploy; see
  [security-payments.md §10](security-payments.md#10-storage-strategy))
- MVP limit: up to 5 images per product, JPEG/PNG only, same size/type rules as
  payment images (§7.3 of that file)

### 5.3 Storefront Features (Public Storefront)

- Product listing:
  - Name, description, images, price
  - Variants (album version, member, etc.)
  - Stock status (in stock / sold out)
  - Only products in `PUBLISHED` status are shown (see 4.2)
- Product detail page
- Cart (drawer-style)
- Checkout flow (see 4.6)
- Buyer order tracking (see 4.7)

### 5.4 Payment Configuration (Seller Panel)

This is the piece that makes Bias Market a _manager_ rather than a single
hardcoded store.

Per store, the seller can:

- Enable/disable payment methods individually:
  - Yape
  - Plin
  - Bank transfer
  - Wise (for cross-border sellers)
  - PayPal (manual, screenshot-based — no live integration in MVP)
- Set a **deposit rule**, as a percentage (e.g. 30%), instead of hardcoding full
  payment
- Make the deposit rule **conditional on delivery method** — e.g.:
  - Pickup in person → deposit only (30%), balance paid on pickup
  - Courier/shipping → full payment required upfront
- Provide payment account details per method (Yape number, bank account, etc.)
  shown to the buyer at checkout Every one of these is a per-store setting, not
  application code — a store can choose a fixed 30% deposit and Yape-only,
  pickup-only, but that's a configuration choice, not a hardcoded assumption.

### 5.5 Delivery Methods (Seller Panel)

Per store, the seller configures one or both:

- **Pickup point:** address, available days/hours
- **Courier/shipping:** courier name(s), estimated cost, estimated delivery
  window The delivery method a buyer selects at checkout determines which
  payment rule applies (see 4.4).

### 5.6 Checkout & Order Creation Flow

This section directly answers an open question from spec review: **should an
order exist before payment, or only after?**

Decision for MVP: **the order exists before full confirmation, but does not
count as a confirmed sale until payment is verified.** This is necessary because
group-order/import sellers need to see demand (how many buyers want an item)
before they place the bulk purchase in Korea — waiting for payment confirmation
before the order even exists would make that impossible.

Flow:

1. Buyer adds items to cart, proceeds to checkout
2. Buyer selects delivery method (pickup or courier)
3. System calculates the required payment (deposit % or full, per 5.4/5.5)
4. **Order is created** with `paymentStatus PENDING_PAYMENT`
   - Does **not** decrement confirmed stock (soft hold on `reserved` instead)
   - Does **not** count toward sales totals
   - Expires automatically after the store's configured window
     (`Store.holdWindowHours`, default 48h) if nothing is recorded, freeing the
     reserved item
5. **Buyer is handed off to WhatsApp to pay** — checkout builds a pre-filled
   `wa.me` message from the store's WhatsApp number (order id, items, total,
   delivery + payment method) and redirects; payment is coordinated with the
   seller outside the app. There is **no in-app buyer proof upload** in the MVP
   — the seller records what came in (step 6), see security-payments.md §9.2.
6. **Seller records the payment** in the panel (`OrderPayment`: amount, method,
   optional note, optional image) — the seller enters what was received over
   WhatsApp, not the buyer. Recording enough to cover the required amount routes
   straight through the approve path to `VERIFIED`; a partial amount leaves the
   order in `PARTIALLY_PAID` (still on soft-hold) until the seller approves.
   Approving directly always requires at least one recorded payment
   (`paidAmount > 0`) — it can be done from `PENDING_PAYMENT` or
   `PARTIALLY_PAID`, but never with no payment registered:
   - Approve → `VERIFIED` (now counts as a confirmed order)
   - Reject → `REJECTED`
7. From `VERIFIED`, the order proceeds into the fulfillment states in 5.7. Full
   validation rules, file upload limits, and the technical version of this flow
   are defined in
   [security-payments.md](security-payments.md#9-payment-flow-design-manual) —
   this section is the product-level reason those rules exist the way they do,
   and that file should be read together with this one.

### 5.7 Order Tracking States (Public Storefront + Seller Panel)

For import-based sellers, "paid" is not the same as "in hand." Buyers need
visibility into where their order actually is:

1. `PENDING_PAYMENT` — order created, awaiting payment (5.6)
2. `PARTIALLY_PAID` — seller has recorded a partial payment (deposit), still
   awaiting the rest
3. `PAYMENT_SUBMITTED` — a legal state in the model, but no current flow
   produces it: sellers approve/reject straight from `PENDING_PAYMENT` /
   `PARTIALLY_PAID` based on the WhatsApp conversation (5.6)
4. `VERIFIED` — payment confirmed (seller-approved), order is real
5. `ORDERING` — seller has included it in a bulk purchase from origin country
   (Korea, etc.)
6. `IN_TRANSIT` — shipped from origin, en route to seller
7. `READY` — arrived, available for pickup or local shipping
8. `COMPLETED` — delivered to buyer / picked up
9. `REJECTED` / `CANCELLED` — terminal failure states Not every store will use
   every state (a store with in-stock-only inventory can skip
   `ORDERING`/`IN_TRANSIT`), so this list is configurable per store's business
   type, but the states themselves are fixed vocabulary in the data model — see
   [architecture.md](architecture.md).

### 5.8 Buyer Authentication (Public Storefront)

- Phone number + password is the required identity (`Customer.phone` +
  `passwordHash`, unique per store)
- Email is optional and, once added, goes through a verification flow
  (`Customer.email`/`emailVerified`/`pendingEmail`) — same for phone number
  changes (`pendingPhone`) — see
  `apps/api/src/modules/orders/application/customer-account.service.ts`. No SMS
  verification.
- Buyer can view their own order history and current status per order
- No social login in MVP

### 5.9 Seller Panel (management)

Beyond product management (5.2) and payment/delivery configuration (5.4, 5.5),
the seller panel includes:

- Dashboard: pending orders needing review, recent activity
- Category management
- Order management: filter by status, move orders through the states in 5.7,
  approve/reject payments (the seller records the received payment first — see
  5.6)
- Store settings: name, theme basics, contact info, language (see
  [i18n.md](i18n.md))

### 5.10 Discovery Layer (Public, Cross-Store)

Shipped, not originally in this spec — the one deliberate expansion beyond
"single-store builder." Bias Market is still not a marketplace (buyers still
browse and check out on one store at a time, per-store, exactly as 4.3
describes); this is an **acquisition layer on top of it**, so a seller isn't
solely dependent on their own social following to get buyers. Three surfaces,
all reading across every store, none of them transactional themselves:

- **Featured stores** (`GET /stores/featured`, home-page section): stores with
  ≥3 `VERIFIED` orders in the trailing 30 days, at least one published product,
  and not banned — an activity signal, not a manually curated/paid placement.
- **Store directory** (`/stores`): paginated, searchable list of every public
  store (name, slug, owner, logo).
- **Global product search** (`/search`): searches products across all stores at
  once, not scoped to one storefront — the same product-listing rules apply
  (4.3: only `PUBLISHED` products surface).

A store can opt out entirely: `Store.isPublic` (default `true`) gates inclusion
in featured/directory/search — toggled in store settings
(`features/store-settings`). Clicking through from any of these still lands the
buyer on that store's own `/store/[slug]` page — checkout, payment methods, and
delivery options remain fully per-store (4.4–4.6), unchanged by this layer.

---

## 6. Non-Goals for MVP

To keep scope honest:

- No live payment gateway integration (Stripe, MercadoPago) — manual proof only,
  per [security-payments.md](security-payments.md)
- No subdomain-per-store routing — all stores share one domain path scheme until
  justified (see [architecture.md](architecture.md))
- No themes marketplace — one default theme, minor customization only
- No group-order-specific tooling beyond the order states in 4.6 (no demand
  aggregation UI, no bulk-buy calculators) — tracked for v2 in
  [roadmap.md](roadmap.md)

---

## 7. Open Decisions

Still unresolved:

- Should the MVP data model assume multi-store from day one (all tables scoped
  to `store_id`), even though only one real store will use it at first? This
  affects initial development effort — see
  [architecture.md](architecture.md#3-multi-tenant-design-critical).
- Exact deposit-expiration window for `PENDING_PAYMENT` orders (24h? 48h?) —
  affects both product behavior and courier/import timelines.
- Which courier(s) to list by default in the delivery configuration (4.5).
- Whether `ORDERING`/`IN_TRANSIT` states are visible to buyers by default or
  only shown for stores that opt in.

---

## 13. Key Differentiator

Bias Market is not Shopify-lite.

It is: → **Fan-commerce infrastructure** → Built for chaotic, manual workflows →
Then gradually automates them
