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

The scope is defined once, in [section 5](#5-mvp-scope), grouped by the layer
that owns each feature (section 4). Order, payment and delivery state names are
the data-model enums, described in
[5.7](#57-order-tracking-states-public-storefront--seller-panel).

---

## 4. Platform Layers

The platform has three distinct layers. Every feature in this document belongs
to exactly one of them, so it's always clear who configures what.

### 4.1 Platform Layer (superadmin)

- Manages all stores and their owners (accounts, premium coupons, bans)
- Not customer-facing; used only by the Bias Market operator
- Out of scope for MVP beyond basic account/store listing (see
  [architecture.md](architecture.md#3-multi-tenant-design-critical))
- What exists: a `role: "admin"` gate and four screens — contact inquiries from
  the public `/contact` form, stores (listing + impersonation), users (listing +
  ban), and premium coupons (see [5.11](#511-plans-and-premium-coupons)) — see
  [admin.md](admin.md). Account/store management beyond that is not built.

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

Seller and buyer features that this section does not describe individually
(collections, store sections, restock requests, WhatsApp templates, saved
addresses, notifications, analytics, couriers, assisted orders) are listed with
their modules in the [API module catalog](architecture.md#api-module-catalog).

### 5.1 Onboarding Flow (Seller Panel)

Seller answers, at signup:

- Business name
- Store handle (URL slug)
- Business type (default: artist merch)
- Product categories (albums, photocards, bundles, lightsticks)
- Payment methods to enable (see 5.4 — not fixed to one country/method)
- Delivery methods to enable (see 5.5)

Output: an auto-generated store + default theme, ready to publish.

### 5.2 Product Management — CRUD (Seller Panel)

Product CRUD is core MVP functionality — nothing else in this document works
without it, and it's listed as an MVP deliverable in [roadmap.md](roadmap.md).

**Create**

- Required fields: name, description, price, category, at least 1 image
- Optional: variants (see below)
- Product is created in `DRAFT` until the seller explicitly publishes it, so
  half-finished products don't show up on the live storefront

**Read / List**

- Seller sees all their store's products (scoped to `store_id`, see
  [security-payments.md §7.2](security-payments.md#72-input-validation))
- Filterable by category and status (draft / published / sold out)
- Buyer-facing listing only shows `PUBLISHED` products (see 5.3)

**Update**

- Any field editable after creation, including moving a product back to `DRAFT`
- Toggle `sold out` manually, independent of variant-level stock (a seller may
  want to mark a whole product sold out even if one variant technically has
  stock left, e.g. reserved for another channel)

**Delete**

- **Soft delete only.** A product referenced by an existing order (any status,
  including `CANCELLED`) cannot be hard-deleted — this would break the
  stock/state logic in
  [security-payments.md §9](security-payments.md#9-payment-flow-design-manual)
  and make past orders unreadable in the seller's history
- Soft-deleted products disappear from the storefront and from the default
  product list, but remain resolvable from existing orders

**Variants**

- A product can have one or more variants (e.g. album version, member, size)
- Each variant has: its own stock count (or unlimited/N-A for made-to-order
  items), optional price override, optional image override
- Stock decrement on `VERIFIED` (see
  [security-payments.md §9.2](security-payments.md#92-flow-whats-actually-live))
  happens at the variant level if variants exist, otherwise at the product level

**Images**

- Stored in object storage (public bucket — MinIO in the current deploy; see
  [security-payments.md §10](security-payments.md#10-storage-strategy))
- Limits: a per-product image cap (`MAX_PRODUCT_IMAGES` in
  `apps/api/src/modules/products/product-images.constants.ts`), JPEG/PNG only,
  same size/type rules as payment images (§7.3 of that file)

### 5.2.1 Seller-content conventions (SEO + accessibility)

Applies to every field a seller writes that ends up on a public storefront page:
`Store.bio`, `Store.aboutMarkdown`, `StoreSection` `TEXT_BLOCK` / `BANNER`
content, and product name/description/images. Scoped by
[the store rich-content + thin-content indexing plan](../../.artifacts/2026/09/20260907--store-rich-content-and-thin/plan.md);
this also closes the GSC-audit doc's Phase D Tier 3 item 4 (alt-text
convention). The forms and the markdown renderer **enforce** the
machine-checkable parts (non-empty `alt`, on-CDN image `src`, the tag
allowlist); the rest of this subsection is the copy guidance behind that
enforcement.

**`Store.aboutMarkdown` — markdown subset only.** Rendered server-side through a
strict allowlist (`apps/web/lib/store-markdown.tsx`), never as raw HTML:

- Allowed: paragraphs, `**bold**` / `_italic_`, sub-headings (`##`–`####`),
  bulleted and numbered lists, blockquotes, links, images, inline `code` and
  fenced code blocks, horizontal rules.
- **No raw HTML** of any kind — `<script>`, `<iframe>`, `<style>`, `on*=`
  handlers, and `javascript:` URLs are stripped/rejected on write and on render.
- **No `<h1>`.** The page owns its single `<h1>` (the store name). A leading `#`
  is demoted to `##`.
- No tables in v1 (revisit only for a concrete size/return-table use-case).
- App caps: `bio` ≤ 280 chars (plain text, no markdown), `aboutMarkdown` ≤ 4000.

**Outbound links in seller content carry `rel="nofollow ugc noopener"`** (and
`target="_blank"`), forced by the renderer. Sellers don't get to pass the
platform's ranking authority to arbitrary external sites, and `ugc` marks the
content as user-generated. Only `http:` / `https:` / `mailto:` schemes are
allowed.

**Every seller-provided image must be CDN-hosted and carry non-empty,
human-written `alt` text** — this covers product images, `BANNER` section
images, and inline `![alt](url)` images in `aboutMarkdown`:

- `src` must resolve to the platform CDN host (`cdn.biasmarket.com`). Arbitrary
  remote images (hotlinks, tracking pixels, mixed content) are rejected; inline
  markdown images with an off-CDN `src` are dropped at render.
- `alt` must be a real description of what's in the image, written by a person —
  not the filename, not "image", not empty. The forms reject an empty `alt`; an
  inline markdown image with an empty `alt` is dropped.
- Why: image-search discoverability and screen-reader accessibility, in equal
  measure. A store that fills these in ranks for image queries its competitors
  don't; one that doesn't is invisible to that surface and unusable to assistive
  tech.

### 5.3 Storefront Features (Public Storefront)

- Product listing:
  - Name, description, images, price
  - Variants (album version, member, etc.)
  - Stock status (in stock / sold out)
  - Only products in `PUBLISHED` status are shown (see 5.2)
- Product detail page
- Cart (drawer-style)
- Checkout flow (see 5.6)
- Buyer order tracking (see 5.7)

### 5.4 Payment Configuration (Seller Panel)

This is the piece that makes Bias Market a _manager_ rather than a single
hardcoded store.

Per store, the seller can:

- Enable/disable payment methods individually. The method set is the
  `PaymentMethodType` enum: `YAPE`, `PLIN`, `TRANSFER`, `CASH`. Wise and PayPal
  are not integrations: a seller who uses them gives the transfer details as
  free text under a method, and the buyer pays by manual transfer and screenshot
- Set a **deposit percentage per method** (`PaymentMethodConfig.depositPercent`,
  default 100, i.e. full payment). A buyer may choose a partial payment only on
  an enabled, non-`CASH` method whose percentage is below 100
- Provide payment account details per method (Yape number, bank account, etc.)
  shown to the buyer at checkout

Seller-assisted orders ([assisted-orders.md](assisted-orders.md)) use a fixed
rule instead of the per-method percentage: a pickup order may take a deposit, a
courier order must be paid in full
(`packages/utils/src/assisted-order-payment`). Every setting above is per store,
not application code.

### 5.5 Delivery Methods (Seller Panel)

Per store, the seller enables pickup, courier, or both (`DeliveryMethodType` is
`PICKUP` or `COURIER`; `DeliveryMethodConfig`, one row per type with a free-form
`details` object):

- **Pickup points** (`PickupPoint`): any number per store, each with a label, an
  enabled flag, a sort order, the weekdays it is open (empty means every day),
  and a manual "closed" override. If the store has enabled points, a pickup
  order must name one and a pickup date that falls on an open day; the order
  stores a label snapshot.
- **Couriers** (`Courier`, `CourierConfig`): seller-named couriers, each with an
  `AGENCY` (pick up at the courier's agency) and/or `HOME` (home delivery)
  modality and a price per modality. A courier order must name a courier and a
  modality, which are copied onto the order along with the price. A legacy
  `estimatedCost` in the delivery `details` is used only when no courier
  modality applies.

Dashboard route: `/dashboard/[slug]/shipping`. Buyers read the enabled options
from the `stores/:slug/public/*` endpoints. See the module catalog in
[architecture.md](architecture.md#api-module-catalog). The delivery method also
determines the deposit rule for seller-assisted orders (see 5.4).

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
   seller. The buyer can also upload a proof image in the app (at checkout, from
   the account order page, or through an assisted order's private link). The
   upload creates a pending `OrderPayment` for the seller to review and does not
   change `paymentStatus` by itself; see
   [security-payments.md §9.3.1](security-payments.md#931-buyer-proof-upload-by-private-link).
6. **Seller records or reviews the payment** in the panel (`OrderPayment`:
   amount, method, optional note, optional image) — either entering what was
   received over WhatsApp or approving, rejecting or voiding a buyer-submitted
   proof. Recording enough to cover the required amount routes straight through
   the approve path to `VERIFIED`; a partial amount leaves the order in
   `PARTIALLY_PAID` (still on soft-hold) until the seller approves. Approving
   directly always requires at least one recorded payment (`paidAmount > 0`) —
   it can be done from `PENDING_PAYMENT` or `PARTIALLY_PAID`, but never with no
   payment registered:
   - Approve → `VERIFIED` (now counts as a confirmed order)
   - Reject → `REJECTED`
7. From `VERIFIED`, the order proceeds into the fulfillment states in 5.7. Full
   validation rules, file upload limits, and the technical version of this flow
   are defined in
   [security-payments.md](security-payments.md#92-flow-whats-actually-live) —
   this section is the product-level reason those rules exist the way they do,
   and that file should be read together with this one.

### 5.7 Order Tracking States (Public Storefront + Seller Panel)

For import-based sellers, "paid" is not the same as "in hand." Buyers need
visibility into where their order actually is:

1. `PENDING_PAYMENT` — order created, awaiting payment (5.6)
2. `PARTIALLY_PAID` — seller has recorded a partial payment (deposit), still
   awaiting the rest
3. `PAYMENT_SUBMITTED` — set only when voiding a payment leaves an unreviewed
   buyer proof and nothing paid; a pending buyer proof does not set it. Sellers
   otherwise approve/reject from `PENDING_PAYMENT` / `PARTIALLY_PAID` (5.6; see
   [security-payments.md §9.3](security-payments.md#93-state-summary))
4. `VERIFIED` — payment confirmed (seller-approved), order is real
5. `ORDERING` — seller has included it in a bulk purchase from origin country
   (Korea, etc.)
6. `IN_TRANSIT` — shipped from origin, en route to seller
7. `READY` — arrived, available for pickup or local shipping
8. `COMPLETED` — delivered to buyer / picked up
9. `REJECTED` / `CANCELLED` — terminal failure states

Items 1-4 and 9 are `paymentStatus` values and items 5-8 are `fulfillmentStatus`
values; cancellation is a third axis (`OrderStatus`). The states are fixed
vocabulary in the data model — see
[architecture.md](architecture.md#4-database-improvements). Whether a store
skips `ORDERING`/`IN_TRANSIT` is a seller practice; the code does not vary the
states per store.

### 5.8 Buyer Authentication (Public Storefront)

- Buyers have a global account (`BuyerAccount`) across all stores. Phone number
  plus password is the main identity (`phone` is unique); Google sign-in is
  optional, and a Google-only account has no password.
- Email is optional and, once added, goes through a verification flow
  (`email`/`emailVerified`/`pendingEmail`); phone changes use `pendingPhone`. No
  SMS verification.
- A buyer can view their own order history and current status per order, on the
  store's account page and on `/my-purchases`.
- A buyer who received an assisted-order link can claim the order into an
  account. Per-store customer records (`Customer`) are linked through
  `CustomerStoreLink`. See
  [security-payments.md §7.5](security-payments.md#75-seller-and-buyer-identity).

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
browse and check out on one store at a time, per-store, exactly as 5.3
describes); this is an **acquisition layer on top of it**, so a seller isn't
solely dependent on their own social following to get buyers. Three surfaces,
all reading across every store, none of them transactional themselves:

- **Featured stores** (`GET /stores/featured`, home-page section): public,
  non-banned stores with at least one listable product and a minimum number of
  `VERIFIED` orders in a trailing window (`MIN_ORDER_COUNT` and the window in
  `StoresService.findFeatured`), ranked by revenue — an activity signal, not a
  manually curated/paid placement.
- **Store directory** (`/stores`): paginated, searchable list of every public
  store (name, slug, owner, logo).
- **Global product search** (`/search`): searches products across all stores at
  once, not scoped to one storefront — the same product-listing rules apply
  (5.3: only `PUBLISHED` products surface).

A store can opt out entirely: `Store.isPublic` (default `true`) gates inclusion
in featured/directory/search — toggled in store settings
(`features/store-settings`). Clicking through from any of these still lands the
buyer on that store's own `/store/[slug]` page — checkout, payment methods, and
delivery options remain fully per-store (5.4–5.6), unchanged by this layer.

### 5.11 Plans and Premium Coupons

The code implements a plan flag and coupon redemption; it implements no price,
billing or paid checkout. Pricing, and what a premium plan will unlock, are not
defined anywhere in the code or in these docs.

- **State.** Each seller account (`User`, not a store) has `plan` (default
  `basic`) and `premiumUntil`. Both are read-only to clients and are written
  only by coupon redemption, unredeeming, and the expiry sweep.
- **Coupons.** An admin creates coupons at `/admin/coupons`: a 4-8 character
  alphanumeric code, name, `plan` (default `premium`), `durationDays` (default
  `PREMIUM_DURATION_DAYS` in `coupons.service.ts`), `maxUses` (default 1), an
  active flag and an optional start/end window. Admins can edit, toggle, delete,
  list redemptions, and unredeem one.
- **Redeeming.** A signed-in seller enters a code in the account page
  (`features/coupons`, `POST /coupons/redeem`, throttled). A user can redeem a
  given coupon once, and a coupon stops working at `maxUses`. Redeeming sets
  `plan` to the coupon's plan and moves `premiumUntil` forward by
  `durationDays`, starting from the current expiry when one is still in the
  future, so durations stack. Unredeeming recomputes both fields from the
  remaining redemptions, falling back to `basic`.
- **Expiry.** The `premium` queue in `apps/workers` triggers an internal sweep
  that resets `plan` to `basic` and clears `premiumUntil` once it has passed
  (`expire-premium.usecase.ts`). The web client treats a plan as premium only
  while `premiumUntil` is in the future
  (`features/coupons/queries/use-my-plan.ts`).
- **What a plan changes today.** The account page shows the premium status and
  expiry. No API route or dashboard feature checks the plan, so a `basic` seller
  has access to the same features as a premium one.

---

## 6. Non-Goals for MVP

To keep scope honest:

- No live payment gateway integration (Stripe, MercadoPago) — manual proof only,
  per [security-payments.md](security-payments.md)
- No subdomain-per-store routing — all stores share one domain path scheme until
  justified (see [architecture.md](architecture.md))
- No themes marketplace — built-in palettes and a custom primary color only (see
  [architecture.md §5](architecture.md#5-theming))
- No group-order-specific tooling beyond the order states in 5.7 (no demand
  aggregation UI, no bulk-buy calculators) — tracked for v2 in
  [roadmap.md](roadmap.md)

---

## 7. Open Decisions

Still unresolved:

- Pricing and plan limits (see 5.11): no price or plan-gated feature exists in
  the code.
- Which courier(s) to list by default in the delivery configuration (5.5).
- Whether `ORDERING`/`IN_TRANSIT` states are visible to buyers by default or
  only shown for stores that opt in.

---

## 8. Key Differentiator

Bias Market is not Shopify-lite.

It is: → **Fan-commerce infrastructure** → Built for chaotic, manual workflows →
Then gradually automates them

---

## Related

- [architecture.md](architecture.md): modules, data model, queues.
- [security-payments.md](security-payments.md): payment flow and identity.
- [assisted-orders.md](assisted-orders.md): seller-created orders.
- [roadmap.md](roadmap.md), [admin.md](admin.md), [i18n.md](i18n.md).
