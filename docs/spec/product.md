# Product

What BarriStore is, who it's for, and what the MVP ships.

## 1. Product Overview

**BarriStore** is a niche-first store builder targeting creator-led commerce,
starting with **K-pop / artist merchandise stores** (albums, photocards,
fan-made goods).

### Core Value Proposition

- Launch a store in minutes (no tech knowledge)
- Designed specifically for fandom commerce workflows
- Manual payment-first (low friction, no Stripe requirement)
- Built-in proof-of-payment verification system

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

BarriStore replaces:

- Google Forms + Sheets
- Manual DM tracking
- Screenshot chaos

With: → Structured storefront + admin workflow

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

### Checkout Flow:

1. User places order
2. Receives:

   - Order ID
   - Payment instructions
3. Uploads:

   - Proof of payment (image)

---

### 3.3 Admin Dashboard

#### Orders Management

- Status:

  - Pending Payment
  - Payment Submitted
  - Verified
  - Rejected
  - Fulfilled

#### Payment Review

- View uploaded proof image
- Approve / Reject
- Add notes

#### Product Management

- CRUD products
- Variant handling

#### Store Settings

- Payment instructions
- Theme config (colors, fonts, logo)

---

## 13. Key Differentiator

BarriStore is not Shopify-lite.

It is: → **Fan-commerce infrastructure** → Built for chaotic, manual workflows →
Then gradually automates them
