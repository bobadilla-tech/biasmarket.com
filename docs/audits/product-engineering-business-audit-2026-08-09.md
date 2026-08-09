# BiasMarket — Product, Engineering & Business Audit

**Date:** 2026-08-09 **Scope:** `apps/api`, `apps/web`, `packages/*`,
`docs/core`, `docs/plans`, git history **Method:** full-repo read, code treated
as ground truth over documentation. `docs/audits/` was deliberately excluded as
a source for this review, per the review brief, to get a fresh read.

A fresh, code-first read of where BiasMarket actually stands: what's built,
what's real vs. aspirational in the docs, and what the next 30 days should focus
on before adding another feature.

---

## Contents

1. [What BiasMarket Is Today](#1-what-biasmarket-is-today)
2. [The Chaos-First Strategy — Reality Check](#2-the-chaos-first-strategy--reality-check)
3. [Buyer Identity](#3-buyer-identity)
4. [Multi-Tenant Architecture](#4-multi-tenant-architecture)
5. [Orders & the State Machine](#5-orders--the-state-machine)
6. [Payment Proof System](#6-payment-proof-system)
7. [Automated Payments — Foundations, Not Features](#7-automated-payments--foundations-not-features)
8. [Monetization Analysis](#8-monetization-analysis)
9. [MVP Definition](#9-mvp-definition)
10. [Gap Analysis](#10-gap-analysis)
11. [Technical Debt Audit](#11-technical-debt-audit)
12. [Security Review](#12-security-review)
13. [Recommended Architecture](#13-recommended-architecture)
14. [Roadmap](#14-roadmap)
15. [Top 10 Things To Do Next](#15-top-10-things-to-do-next)
16. [What NOT To Build Yet](#16-what-not-to-build-yet)
17. [Founder / Product Perspective](#17-founder--product-perspective)
18. [Executive Summary](#18-executive-summary)

---

## 1. What BiasMarket Is Today

BiasMarket is further along than a typical "MVP audit" finds. This is not a
skeleton with a payments idea bolted on — it's a modular-monolith store builder
(NestJS API, Next.js storefront/dashboard, Postgres via Prisma, MinIO for files,
Resend for email) where the entire manual-commerce loop the founders set out to
build — store → catalog → checkout → payment proof → seller review → fulfillment
tracking — is implemented and exercised by 123 real test files, not stubs.

The product, per `docs/core/product.md`, is a multi-tenant store manager for
creator-led commerce, K-pop/artist merch first, one seller account can run
several stores, and it is deliberately manual-payment-first: bank transfer,
Yape, Plin, cash — no gateway required, with a built-in proof-of-payment review
workflow standing in for what Shopify would call "mark as paid." The first named
customer is a real K-pop import store currently running the business on
Instagram DMs, WhatsApp, and screenshots (`product.md:25-31`).

What surprised this audit most is how recently and deliberately the team closed
gaps a prior audit
(`docs/audits/product-engineering-business-audit-2026-08-08.md`, excluded from
this review by design but visible as a citation inside `docs/plans/`) had
flagged. The git log for the last ~40 commits and the `docs/plans/` directory
both show a tight Aug 6–9 cluster: global buyer account, shipping addresses,
buyer payment-proof upload, security baseline (helmet/CSRF/rate-limiting),
observability + env validation, orders-module hardening, payment-proof access
control. This is a team that runs its own audits and visibly acts on them within
days.

The counterweight: `CLAUDE.md`, `docs/core/security-payments.md`, and
`docs/core/product.md` are now stale relative to code that shipped in the last
24–48 hours. `CLAUDE.md:193-196` claims "no CSRF/helmet, no startup env-var
validation" — both are live (`apps/api/src/main.ts:6,16,30-39`,
`apps/api/src/config/env.validation.ts`). `security-payments.md §9` and
`product.md:120-121,288` both state buyer-side payment-proof upload doesn't
exist — it shipped **the day this audit was requested**
(`customer-order-payments.controller.ts`, migration
`20260809231500_add_buyer_payment_proof`). Per Rule 1 of this review:
documentation says X, implementation currently does Y. Fixing this is item #4 in
the priority list (§15).

---

## 2. The Chaos-First Strategy — Reality Check

The founding hypothesis holds up against the code: keep the seller's existing
WhatsApp/Yape workflow, wrap it in structure, don't touch the money. Walking the
actual flow end to end:

```
Create store          → EXISTS, production-ready   (onboarding + CreateStoreForm)
Add products          → EXISTS, production-ready   (features/products, migrated to typed client)
Buyer places order     → EXISTS, production-ready   (checkout-form.tsx, 649 lines, full zod validation)
Payment instructions   → EXISTS, functional but split across two uncoordinated channels (see §6, §11)
Buyer pays externally  → out of scope by design — no code needed, this is the point
Buyer uploads proof    → EXISTS, production-ready   (shipped 2026-08-09 — see §1 doc-drift note)
Seller verifies payment → EXISTS, production-ready   (approve/reject, audit log, Decimal-safe totals)
Order becomes VERIFIED → EXISTS, but with real state-machine gaps (see §5)
Seller processes order → EXISTS   (ORDERING → IN_TRANSIT → READY → COMPLETED)
DELIVERED / tracked     → EXISTS per-store; NOT cross-store (see §3)
```

Score this flow honestly: roughly **85–90% built**. The remaining 10–15% is not
missing features, it's rough edges — a cart that's never cleared after checkout,
a guest confirmation screen with no durable URL, a state machine with three
write paths that bypass its own guard rails, and documentation that no longer
matches what ships. None of that is a rewrite. All of it is small, bounded work.

What's genuinely missing is not code — it's proof that a real, non-team seller
has run a real sale through this loop. Nothing in `docs/plans/`, the git log, or
the product doc's roadmap points to a validated seller yet. `roadmap.md:75-90`
already names the exact risk this creates: _stock griefing_ (buyers creating
unpaid orders to hold scarce stock) is called out as a risk on paper, and this
audit found a concrete instance of the underlying mechanism being incomplete —
the expiration sweep only clears `PENDING_PAYMENT` orders, not stalled
`PARTIALLY_PAID` ones (§5). That's the kind of thing that only surfaces once
real drop-sensitive K-pop buyers are actually using the product under time
pressure.

**Verdict:** don't build more of the chaos-killer loop. Ship what exists to real
sellers, fix the handful of correctness bugs in §11/§15, and let usage — not
more building — tell you what Phase 2 actually needs.

---

## 3. Buyer Identity

The data model already implements the global-identity target this audit was
asked to check — it's the frontend that hasn't caught up.

**What the schema already supports:**

- `BuyerAccount` (`schema.prisma:467-486`) — one row per phone number
  (`phone @unique`), fully store-independent. `passwordVersion` is the sole
  session-revocation mechanism: bump it, every outstanding session cookie stops
  validating (comment at `:471-474`).
- `CustomerStoreLink` (`:523-534`) — a join row proving a given `BuyerAccount`
  has touched a given store, unique on `(buyerAccountId, storeId)`.
- `Address` (`:494-518`) — owned by `buyerAccountId`, not by any store. The team
  already hit and fixed a real incident here: an inline comment (`:508-514`)
  documents that a prior `prisma migrate dev` silently flipped this FK from the
  intended cascading delete to `RESTRICT` in the live database, and the schema
  now pins `onDelete: Cascade` explicitly to prevent recurrence.
- `Order.buyerAccountId` coexists with the older, per-store `Order.customerId`
  (`:223-227`) — orders already carry both identities simultaneously.
- The API-side aggregation already exists: `getGlobalOrders` /
  `getGlobalProfile` (`customer-auth.service.ts:305-354`) scope strictly to
  `session.buyerAccountId` and return orders across every store that buyer has
  touched.

> **The actual gap:** there is no web page that calls it. Every buyer-facing
> route in `apps/web` lives under `store/[slug]/account/*` — login, orders,
> addresses, profile are all namespaced per store slug. A buyer who has ordered
> from two stores has two separate logins and two separate order lists today,
> even though the backend could already show them one merged view. This is a
> **Should-Have**, low-engineering-risk gap: the hard part (global identity,
> session model, cross-store aggregation query) is done; what's missing is a
> `/[locale]/account` route and a nav entry point into it.

One architectural question worth resolving deliberately rather than by drift:
the legacy per-store `Customer` model (denormalized contact record built off
historical orders, still what the seller-facing "Customers" dashboard tab reads
from) and the new global `BuyerAccount` now coexist. Nothing forces them to stay
in sync, and no migration path from one to the other is documented. That's fine
at current scale — flag it now so it doesn't become a silent
two-systems-of-record problem once buyer volume grows.

---

## 4. Multi-Tenant Architecture

**Verdict: path-based routing is correct for now, and the architecture is not
blocking a later move to subdomains.** Don't build subdomain/custom-domain
routing yet — nothing in the code makes that migration painful later; every
tenant-scoped table is already keyed by `storeId`, and routing is a thin layer
on top.

**How tenancy is actually enforced:** there is no tenant-resolution middleware,
and per `CLAUDE.md` that's an intentional, accepted decision, not an oversight.
Instead, every service that touches tenant data follows one consistent pattern,
established in `products.service.ts:30-54` and verified across every other
module during this review:

1. `assertOwnership(storeId, userId)` — loads the store, 404s if missing, 403s
   if `store.ownerId !== userId`.
2. A second, independent check on the child row's own `storeId` (e.g.
   `findOwnedProduct` re-verifies `product.storeId === storeId`) — this is the
   check that actually prevents the classic IDOR of requesting `storeId=A` with
   a resource id that belongs to store B.

This exact two-layer pattern was confirmed, read in full, and found correctly
applied in: `categories`, `collections` (including a reorder endpoint that
verifies `result.count` matches the expected row count to catch a mismatched
product/collection pair), `store-sections`, `payment-config`, `delivery-config`,
`pickup-points`, `notifications`, `stats`, `whatsapp-templates`, `restock`,
`stores`, and every order-mutation use case. Across every controller checked, no
method was found that calls a tenant-scoped service without also passing the
session's `userId`. **This is the single strongest finding of the whole audit:
zero IDORs found** in a fairly deep pass across 12+ services — see §12 for the
full security writeup.

**What would need to change for subdomains later:**

- Routing layer only: `store/[slug]/*` paths would become subdomain roots — a
  Next.js rewrite/middleware concern, not a data-layer one.
- Cookies: the buyer session cookie is currently scoped to the main domain
  implicitly. Subdomain buyer sessions would need either a shared parent-domain
  cookie or a re-auth per subdomain — worth a design decision when the time
  comes, not now.
- Caddy already fronts three subdomains today (`biasmarket.com`,
  `api.biasmarket.com`, `cdn.biasmarket.com`) — the TLS/reverse-proxy pattern
  for N subdomains is already proven in `infra/caddy/Caddyfile`, it just isn't
  wildcarded yet.

**A real gap worth fixing before subdomains or SEO investment: soft 404s.** Both
the storefront page and product-detail page return a normal HTTP **200** with a
translated "not found" string when the store or product doesn't exist — neither
calls Next's `notFound()` (`store/[slug]/page.tsx`,
`store/[slug]/product/[productId]/page.tsx`). `generateMetadata` does at least
set `robots: noindex` in that case, but search engines and monitoring both see
"200 OK" for a page that doesn't exist. This is cheap to fix and matters more,
not less, once discovery/search investment increases (see §10, §16).

---

## 5. Orders & the State Machine

The conceptual model is right and shouldn't be redesigned: `Order` already
separates **payment status** (`PaymentStatus`), **fulfillment status**
(`FulfillmentStatus`), and **cancellation** (`OrderStatus: ACTIVE | CANCELLED`)
into three independent axes, exactly the separation this review was asked to
check for. Keep this shape. The problem isn't the model — it's that enforcement
of the model is inconsistent.

```
paymentStatus:
  PENDING_PAYMENT  → PARTIALLY_PAID, PAYMENT_SUBMITTED, VERIFIED, REJECTED, CANCELLED
  PARTIALLY_PAID   → PARTIALLY_PAID, PAYMENT_SUBMITTED, VERIFIED, REJECTED, CANCELLED
  PAYMENT_SUBMITTED → PARTIALLY_PAID, VERIFIED, REJECTED
  VERIFIED / REJECTED / CANCELLED → terminal

fulfillmentStatus:
  ORDERING → IN_TRANSIT → READY → COMPLETED   (strictly linear, terminal at COMPLETED)
```

**Enforcement is centralized on paper, not in practice.** `order-status.vo.ts`
defines the transition tables above, and `order.entity.ts` exposes
`approvePayment()`, `rejectPayment()`, `expire()`, and `advanceFulfillment()` as
the guarded way to change state. But only two of the five real write paths
actually go through it:

| Write path                                                                          | Goes through Order entity? | What it does instead                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReviewPaymentUseCase` (approve/reject)                                             | Yes                        | —                                                                                                                                                                                                  |
| `AdvanceFulfillmentUseCase`                                                         | Yes                        | but its final write has no concurrency guard — see below                                                                                                                                           |
| `CancelOrderUseCase`                                                                | **No**                     | Hand-rolled checks, then a raw `tx.order.updateMany`. Explicitly allows cancelling a `VERIFIED` order — which the entity's own VO table forbids (`VERIFIED` is terminal, no outgoing transitions). |
| `OrderController.addPayment` (seller-recorded, `PARTIALLY_PAID` branch)             | **No**                     | Computes the next status inline, writes it directly via `saveStatus`.                                                                                                                              |
| `OrderController.reviewPaymentProof` (buyer-proof approve, `PARTIALLY_PAID` branch) | **No**                     | Re-derives `paymentStatus` inline, writes it directly, with a comment claiming it "mirrors the domain guard" without actually calling it.                                                          |
| `ExpireOrdersUseCase`                                                               | **No**                     | Raw `tx.order.updateMany`; the entity's own `expire()` method is never called by anything, anywhere.                                                                                               |

None of this has caused visible data corruption yet — the hand-rolled guards
happen to be individually reasonable. But it means the domain layer's guarantees
are decorative for 3 of 5 write paths, and the one confirmed real gap
(`VERIFIED → CANCELLED` via `CancelOrderUseCase`) is a live discrepancy between
what the domain model says is legal and what the API actually allows a seller to
do.

**Two more concrete gaps:**

- **Stalled partial payments never expire.** `ExpireOrdersUseCase` only queries
  `paymentStatus: "PENDING_PAYMENT"`. An order that received a partial payment
  and then stalled past `expiresAt` is never swept — its soft stock hold
  (`ProductVariant.reserved`) stays locked indefinitely unless a seller manually
  intervenes. This is the concrete mechanism behind the "stock griefing" risk
  `roadmap.md` already names on paper.
- **No concurrency guard on fulfillment advance.** `ReviewPaymentUseCase` and
  `CancelOrderUseCase` both use a guarded
  `updateMany({where: {id, currentStatus: expected}})` specifically to catch a
  double-click/retry race — both have comments saying so explicitly.
  `AdvanceFulfillmentUseCase.saveStatus` is a plain `update` with no equivalent
  guard, so two concurrent "advance" clicks can both read the same stale status
  and the second write silently clobbers the first.

**Two small pieces of dead code, worth cleaning up while in this area:**

- `ReleaseResolution` enum (`REFUNDED | STORE_CREDIT`) is declared in the schema
  and never referenced anywhere in `apps/api/src` — the field that should use it
  (`Order.releasedResolution`) is typed as the unrelated
  `CancellationResolution` enum instead.
- `Order.expire()` on the entity is a correctly-implemented, fully dead method.

**Recommendation, scoped deliberately small:** route the three hand-rolled write
paths through the entity's transition methods (this closes the
`VERIFIED → CANCELLED` gap for free), extend the expiration sweep's `where`
clause to also catch stalled `PARTIALLY_PAID` orders past `expiresAt`, and add
the same guarded-`updateMany` pattern to `AdvanceFulfillmentUseCase`. This is a
consolidation, not a redesign.

---

## 6. Payment Proof System

This is the most mature subsystem in the codebase relative to what a
manual-payment MVP actually needs, and it was rebuilt from scratch in the last
24 hours of git history. A schema-only `PaymentProof` model was deliberately
deleted (migration `20260808192135_delete_payment_proof`) rather than left
half-wired, and its replacement landed the next day as fields on `OrderPayment`
instead of a duplicate model — a considered redesign, not a re-add of the same
idea.

**How it actually works:**

- **Two sources, one table.** `OrderPayment.source` is `SELLER_RECORDED` (seller
  manually logs what came in via WhatsApp) or `BUYER_SUBMITTED` (buyer uploads a
  screenshot in-app). Both flow through the same aggregation logic.
- **Multiple proofs per order, full per-proof audit trail.** Nothing about the
  model assumes "one proof wins" — every row independently carries
  `createdAt`/`reviewedAt`/`reviewedBy`.
- **Review state machine.** Buyer-submitted proofs start `PENDING_REVIEW`; a
  seller-only endpoint flips them to `APPROVED`/`REJECTED`, writes an `AuditLog`
  row, and re-derives the order's `paymentStatus`.
- **Money math is Decimal-safe end to end.** `common/payment-summary.ts` is the
  explicitly-documented single source of truth for what counts toward "paid,"
  aggregates in `Decimal` space, and only converts to `Number` at the very end —
  a comment there records the exact float bug this replaced
  (`59.989999999999995` instead of `59.99`). This wasn't theoretical:
  `docs/plans/2026-08-06-order-payment-precision-bug-fix-plan.md` is a real
  retrospective on it, and
  `docs/plans/2026-08-06-order-approval-without-payment-guard.md` documents a
  second, related bug (an order could show `VERIFIED` with zero payment
  recorded) that was also found and fixed.
- **Storage is correctly private.** Proof images live in a dedicated
  `S3_PAYMENT_BUCKET` that never gets a public-read policy (confirmed in
  `docker-compose.yml`'s `minio-init` step, unlike the product-image and logo
  buckets, which are intentionally public). Every read goes through an
  authenticated, ownership-checked streaming endpoint — never a signed or public
  URL. Uploads are validated by magic bytes (JPEG/PNG signature), not the
  client-declared content type.
- **A deliberate near-miss the team already caught:** the buyer-side proof
  lookup (`findPaymentForBuyer`) uses one compound query on
  `{paymentId, orderId, order.buyerAccountId}` instead of two sequential
  lookups, with an inline comment explaining why — splitting it into two queries
  would let a buyer view another buyer's payment/image by pairing their own
  valid `orderId` with someone else's `paymentId`. This is exactly the IDOR
  class this audit was asked to hunt for, and it doesn't exist here because it
  was already fixed before this review started.

**Real gaps:**

- **No Multer file-size limit.** All six upload endpoints (product images, store
  logo, payment-config QR, seller-recorded payment proof, buyer-submitted proof)
  validate size only _after_ Multer's default in-memory storage has already
  buffered the full request body. An oversized multipart POST forces full
  buffering before the app-level 5MB check runs — a real, low-effort
  memory-exhaustion vector, worse on the buyer-submitted-proof endpoint since
  it's `@Public()` (session-gated, but not seller-only).
- **Two uncoordinated instruction channels.** Structured
  `PaymentMethodConfig.details` (bank account, Yape/Plin number) and the
  free-text `Store.paymentInstructions` field are both independently editable
  and both shown to the buyer at checkout, with nothing keeping them consistent.
  Worth collapsing to one source before it causes a seller to show conflicting
  account numbers.
- **Deposit-percent fields are dead.**
  `PaymentMethodConfig.depositPercentPickup`/`depositPercentCourier` exist in
  the schema, default to 100, and are never accepted as input, never read by
  `CreateOrderUseCase`, and never surfaced in the settings UI. `requiredAmount`
  is always 100% of `totalAmount` today, contradicting `product.md §5.4/§5.6`'s
  description of a live, delivery-method-conditional deposit rule. Either build
  the read path or delete the fields.

**This is close to the minimum robust model for manual payments already.**
Nothing here needs new infrastructure. The recommendation is cleanup, not
construction: cap upload size at the transport layer, pick one instruction
channel, and resolve the deposit-percent fields one way or the other.

---

## 7. Automated Payments — Foundations, Not Features

No Culqi or any gateway integration exists, and none should yet — this is the
correct read of the product's own stated non-goals (`product.md:380-391`) and
this audit agrees with that call. The interesting question isn't "should we
build it," it's "does anything we're building now make it harder later." It
doesn't.

| Concept                              | State today                                                                                                               | Worth doing now?                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Payment` / `PaymentAttempt`         | `OrderPayment` already models an individual payment event with amount, method, source, and review state.                  | Already have it — no action.                                                                                                                                                                                           |
| `PaymentProvider` abstraction        | Doesn't exist. `method: PaymentMethodType` is a flat enum (`YAPE\|PLIN\|TRANSFER\|CASH`), not a provider-pluggable field. | **Do not build yet** — a provider abstraction designed against zero real gateway integrations is a guess. Extend the enum or add a nullable `provider` column when there's an actual second provider to abstract over. |
| `PaymentStatus`                      | Modeled, Decimal-safe, independently tracked from fulfillment.                                                            | Already have it — no action.                                                                                                                                                                                           |
| `PaymentReference` / idempotency key | Doesn't exist — not needed without a webhook source that can retry-deliver.                                               | **Do not build yet**.                                                                                                                                                                                                  |
| Webhook handling                     | Zero webhook code anywhere in the repo (confirmed by repo-wide grep).                                                     | **Do not build yet** — building webhook infrastructure with nothing to receive is pure speculation.                                                                                                                    |
| Refunds / reconciliation             | `CancellationResolution` (`REFUNDED\|RETAINED\|STORE_CREDIT`) already exists on `Order` for the manual case.              | Sufficient for manual payments. Automated refunds are a Phase 5 concern.                                                                                                                                               |

**What's genuinely worth doing now:** nothing structural. The `OrderPayment`
table's shape — Decimal amounts, a `source` discriminator, a review-state axis —
is exactly the shape you'd want a gateway-originated payment to slot into later
as a third `source` value (e.g. `GATEWAY_CONFIRMED`) rather than a parallel
table. That's a one-column extension when the time comes, not a redesign. Resist
the temptation to design a multi-provider payment engine now. Per Rule 7 of this
review: any specific claim about what a merchant-of-record or fund-holding
obligation would require under Peruvian law needs actual legal/accounting advice
before it shapes engineering decisions — not something to infer from the
codebase.

---

## 8. Monetization Analysis

Zero monetization or billing code exists anywhere in the repo — correct for this
stage. But the architecture itself narrows the realistic options more than a
generic "which model" discussion would suggest.

> **The architecture-driven constraint:** because Phase 1 is deliberately
> manual-payment — BiasMarket never touches the money, sellers get paid directly
> via Yape/Plin/bank transfer outside the platform — **a transaction-fee model
> (Model B/D) is currently unenforceable**. There's no technical mechanism to
> verify GMV or collect a percentage of money that never flows through the
> platform. That's not a business-strategy opinion, it's a direct consequence of
> the payment architecture reviewed in §6–§7. Transaction-fee monetization
> becomes viable only after Phase 5 (automated payments) exists.

| Model                                        | Fits current architecture? | Read against informal Peruvian sellers                                                                                                                                                                    |
| -------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — SaaS (flat monthly)                      | Yes, today                 | Highest friction for acquisition (asks for money before the seller has proven the tool works for them), but honestly implementable with zero new payment infrastructure — just a subscription check gate. |
| B — Transaction fee (% of GMV)               | Not enforceable yet        | Best long-run alignment with seller success, but requires Phase 5. Don't plan around it before then.                                                                                                      |
| C — Hybrid                                   | Blocked on B               | Same blocker as B for the fee component.                                                                                                                                                                  |
| D — Payments monetization (processing + fee) | Blocked on Phase 5         | Furthest out; depends entirely on the automated-payments work §7 already says to defer.                                                                                                                   |
| E — Freemium                                 | Yes, today                 | Lowest acquisition friction, matches "try it on your existing chaos before paying anything" — the most consistent fit with the chaos-killer positioning in §2.                                            |

**What to measure before deciding, starting now (cheap, not a distraction):**
orders per active store per week, proof-to-approval turnaround time, GMV per
store (even though the platform doesn't collect it, sellers report totals via
the dashboard — `stats.service.ts` already aggregates per-store order/revenue
stats and could be extended to a lightweight GMV view), and — most importantly —
whether a seller who onboards keeps using the dashboard after their first
WhatsApp-workflow week, or reverts. That retention signal, not a model
preference, should decide between A and E.

---

## 9. MVP Definition

**Must Have**

- Fix the order-state-machine bypass paths (§5) — the one item here with real
  correctness/money risk if left alone.
- Sweep stalled `PARTIALLY_PAID` orders in the expiration cron (§5) — directly
  prevents the stock-griefing risk the team has already named on paper.
- Fix the cart-not-cleared bug and give guests a durable order-confirmation URL
  (§11) — affects every completed guest checkout today.
- Sync `CLAUDE.md` / `docs/core/security-payments.md` / `docs/core/product.md`
  with what's actually shipped (§1, §15).
- Get 5–10 real sellers using the loop that already exists. This is a product
  action, not an engineering one, and it's the highest-leverage single item on
  this whole list.

**Should Have**

- Cross-store buyer "my orders" page (§3) — backend is done, only the web route
  is missing.
- Collapse the two payment-instruction channels into one (§6).
- Real 404s on store/product pages instead of soft-200s (§4).
- Multer file-size limits on upload endpoints (§12).
- Resolve the dead deposit-percent fields — build or delete (§6).

**Nice to Have**

- Lightweight per-store GMV/retention dashboard to inform the monetization
  decision in §8.
- Consistency fix for the fulfillment-advance button that bypasses the
  undo/confirm-dialog pattern the rest of the order UI uses (documented as a
  known inconsistency in `apps/web/AGENTS.md`).
- `@@index([storeId, customerId])` on `Order` — two dashboard hot paths
  (`CustomersService.findAllForStore`/`findOneForStore`) currently run unindexed
  on this column.

**Do Not Build Yet**

- Any `PaymentProvider`/gateway abstraction, webhook handling, or idempotency
  infrastructure (§7).
- Subdomain or custom-domain routing (§4) — not blocking anything, defer until
  there's a seller asking for it.
- Any billing/subscription/transaction-fee code (§8) — the model isn't chosen
  yet, and B/D aren't enforceable regardless.
- A themes marketplace, advanced analytics, or a recommendation system — none of
  these were found started in the code, and none address the chaos-killer
  hypothesis.
- Group-order tooling beyond the current basic states — already explicitly
  scoped to v2 in `roadmap.md:31-72`, and correctly so.

---

## 10. Gap Analysis

| Area                              | Current State                                                                                   | Target State                                   | Gap                                                                                | Priority     | Effort |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | ------------ | ------ |
| Authentication (seller)           | better-auth, email+password, global `AuthGuard`, anti-enumeration on signup                     | Same                                           | None material                                                                      | —            | —      |
| Authentication (buyer)            | HMAC session cookie, magic-link register/confirm, sliding renewal, `passwordVersion` revocation | Same                                           | None material                                                                      | —            | —      |
| Buyer accounts                    | Global `BuyerAccount` model + API aggregation exist; no web UI                                  | One cross-store "my orders" page               | Web route only                                                                     | Should-have  | S–M    |
| Seller accounts                   | Multi-store per owner, working onboarding flow                                                  | Same                                           | None                                                                               | —            | —      |
| Stores / multi-tenancy            | Path-based, per-service ownership checks, no IDORs found                                        | Same, migrate to subdomains only when demanded | Soft-404 on missing store/product                                                  | Should-have  | S      |
| Products                          | Full CRUD, variants, stock, soft-hold reservation                                               | Same                                           | None material                                                                      | —            | —      |
| Inventory                         | `stock`/`reserved` soft-hold on variants                                                        | Same                                           | Stalled `PARTIALLY_PAID` orders never release their hold                           | Must-have    | S      |
| Cart                              | localStorage-only, per-store, functional                                                        | Same, but cleared post-checkout                | `clearCart` defined, never called                                                  | Must-have    | S      |
| Checkout                          | Production-ready, full validation, pickup/courier, all 4 payment methods                        | Same                                           | Guest confirmation is client-state only, no durable URL                            | Must-have    | S      |
| Orders / state machine            | 3-axis model correct; enforcement inconsistent across 5 write paths                             | All writes routed through the entity           | 3 of 5 paths bypass domain guard; one concurrency race                             | Must-have    | M      |
| Payment proofs                    | Dual-source, multi-proof, audit-trailed, private storage, Decimal-safe                          | Same, plus upload size cap                     | No Multer size limit; two instruction channels                                     | Should-have  | S      |
| Payment status                    | Independent axis, correctly modeled                                                             | Same                                           | None beyond §5 enforcement gap                                                     | —            | —      |
| Order status (cancellation)       | Independent axis                                                                                | Same                                           | `VERIFIED → CANCELLED` allowed in practice, illegal on paper                       | Must-have    | S      |
| Shipping / delivery config        | Pickup points + courier, address collection, per-store config                                   | Same                                           | Deposit-percent-by-delivery-method is dead code                                    | Should-have  | S–M    |
| Notifications                     | In-app only, real Prisma-backed model                                                           | Same                                           | Two dashboard toggles are permanently disabled/local-only (documented, not hidden) | Nice-to-have | S      |
| Customer management (seller-side) | Per-store `Customer` directory, dashboard tab                                                   | Same, reconciled with `BuyerAccount`           | Two systems of record with no sync path                                            | Nice-to-have | M      |
| Seller dashboard                  | Fully migrated to typed API client, all core sections wired                                     | Same                                           | Fulfillment-advance button skips confirm/undo pattern used elsewhere               | Nice-to-have | S      |
| Buyer dashboard                   | Per-store account (orders, addresses, profile), production-ready                                | Cross-store view                               | See "Buyer accounts" row                                                           | Should-have  | S–M    |
| Analytics                         | Basic per-store stats service                                                                   | Lightweight GMV/retention view                 | Not built, low priority pre-traction                                               | Nice-to-have | M      |
| Search / discovery                | Global product search, store directory — shipped beyond original spec                           | Same                                           | None material                                                                      | —            | —      |
| File storage                      | MinIO, 3 buckets correctly scoped public/private, magic-byte validation                         | Same, plus transport-level size cap            | No Multer `limits.fileSize`                                                        | Should-have  | S      |
| Security (general)                | Helmet, env validation, throttling on sensitive routes, no IDORs found                          | Same, broaden rate limiting                    | No global rate limiting on authenticated seller mutations                          | Nice-to-have | M      |
| Testing                           | 123 test files, deepest coverage on `orders`, real assertions not smoke tests                   | Same                                           | Thin coverage on `addresses` (1 spec file)                                         | Nice-to-have | S      |
| Observability                     | GlitchTip (self-hosted Sentry-compatible) wired in `main.ts`                                    | Same                                           | None material found                                                                | —            | —      |
| Deployment                        | Single VM, docker compose, Caddy TLS, manual SSH deploy                                         | Same for this scale                            | No CD/deploy workflow in CI — accepted at current scale                            | Acceptable   | —      |
| SEO                               | JSON-LD on storefront, locale routing, robots meta on missing pages                             | Same, with real 404s                           | Soft-200 on missing store/product (see multi-tenancy row)                          | Should-have  | S      |
| Performance                       | Not evaluated in this pass — no load-testing artifacts found in repo                            | Establish a baseline                           | Unmeasured, not urgent at current traffic                                          | Nice-to-have | —      |
| Accessibility                     | Not evaluated in this pass — no automated a11y tooling found in CI                              | Baseline audit once buyer traffic is real      | Unmeasured                                                                         | Nice-to-have | —      |

---

## 11. Technical Debt Audit

The codebase is unusually clean by conventional debt markers — a repo-wide grep
for `TODO|FIXME|HACK|XXX` across all of `apps/api/src` and `apps/web` returned
exactly one hit, and it was a false positive (a test fixture using ISO 4217's
`XXX` placeholder currency code). That's a genuine signal of discipline, not an
artifact of not looking. The debt that exists is architectural fragmentation,
not sloppiness.

**Critical — fix before further order/payment feature work**

- Order state-machine enforcement fragmentation, including the live
  `VERIFIED → CANCELLED` discrepancy (§5).
- Expiration sweep not covering stalled `PARTIALLY_PAID` orders (§5) — the
  concrete stock-griefing vector.
- No concurrency guard on `AdvanceFulfillmentUseCase` (§5).

**Important — should fix soon**

- Cart never cleared post-checkout; guest order confirmation has no durable URL
  (§2, §11).
- No Multer `limits.fileSize` on six upload endpoints (§6, §12).
- Silent-fallback error swallowing in
  `OrderRepository.findRowByIdForStore`/`findManyForStore` — both wrap their
  `payments`-include query in a bare `try/catch` that, on _any_ error, silently
  re-queries without the include and defaults to an empty array. This can mask a
  real query bug as "no payments" in the UI rather than surfacing it.
- Stale docs (`CLAUDE.md`, `security-payments.md`, `product.md`) actively
  describing shipped features as unbuilt (§1, §6).
- Missing `@@index([storeId, customerId])` on `Order` — two dashboard query
  paths run unindexed.

**Acceptable — can intentionally remain**

- Dead `ReleaseResolution` enum and dead `Order.expire()` entity method —
  genuinely harmless, clean up opportunistically, not urgently.
- Per-module `ThrottlerModule.forRoot()` registration instead of one global
  config — works, just slightly repetitive.
- Two uncoordinated payment-instruction channels — annoying, not dangerous,
  until it causes a support ticket.
- No CD/deploy pipeline — reasonable at single-VM, manual-deploy scale; revisit
  once deploys happen more than a few times a week.

---

## 12. Security Review

**No IDORs found** across every tenant-scoped and buyer-scoped resource read in
this review (products, orders, categories, collections, store-sections,
payment-config, delivery-config, pickup-points, notifications, addresses,
payment-proof images). This is the headline finding of the security pass — the
team's own `assertOwnership` + child-row re-check pattern (§4) is applied
consistently, and one deliberate near-miss (buyer payment-image lookup) was
found already fixed with an inline comment explaining why (§6).

| Finding                                                                    | Severity            | Detail                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No Multer `limits.fileSize` on upload endpoints                            | Low–Medium          | Full request body buffers into memory before the app-level 5MB check runs, on 6 endpoints including one `@Public()` route. Real memory-exhaustion vector, not currently mitigated.                                                                                                                     |
| Missing `OriginGuard` on `addresses.controller.ts` and buyer proof-submit  | Low                 | Inconsistent application of a pattern the team otherwise follows carefully (e.g. `change-password`, `PATCH /me` both have it). `SameSite=Lax` on the session cookie is the primary defense and already blocks the classic cross-site POST vector, so this is a defense-in-depth gap, not an open hole. |
| No global rate limiting on authenticated seller mutations                  | Low                 | Product/category/collection/order-review writes have no throttle beyond requiring a valid session. Blast radius is limited to the attacker's own store unless a seller session is compromised.                                                                                                         |
| No app-wide CSRF token scheme                                              | Low, accepted       | Documented and deliberately deferred (`docs/plans/2026-08-08-security-baseline-csrf-helmet-rate-limiting-plan.md`). Mitigated by `SameSite=Lax` plus `OriginGuard` on the routes that have it. Reasonable risk acceptance for current scale.                                                           |
| `CLAUDE.md` claims "no CSRF/helmet, no env validation"                     | Documentation drift | Both are live and correctly implemented. No security impact, but misleads anyone treating `CLAUDE.md` as ground truth for the current threat model.                                                                                                                                                    |
| `security-payments.md` / `product.md` claim buyer proof upload "not built" | Documentation drift | Fully implemented as of the day this audit was requested. Same category of risk: stale docs steering a reviewer or new engineer toward a wrong mental model.                                                                                                                                           |

**What's already solid, worth naming explicitly:**

- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` —
  mass-assignment/unexpected-field injection is blocked at the framework level,
  confirmed against real DTOs with conditional (`@ValidateIf`) and nested
  (`@ValidateNested`) validation.
- CORS locked to a single explicit origin, credentials true, no
  wildcard/reflection.
- Payment-proof images: private bucket, never a public or presigned URL,
  streamed through an authenticated, ownership-checked endpoint only.
- Upload validation by magic bytes, not client-declared MIME type.
- No webhook surface exists — appropriate, since there's no gateway to receive
  callbacks from yet.

---

## 13. Recommended Architecture

**Keep the modular monolith. Do not introduce microservices** — nothing in this
review found a scaling or team-topology problem that would justify the
operational cost. The smallest architecture that supports global buyer
identity + store tenancy + products + orders + manual payment proof + a real
state machine + a future payment abstraction is, largely, the architecture that
already exists:

```
apps/api  (NestJS, sole DB owner)
  ├─ modules/*          flat CRUD modules, ownership-checked per service — keep this shape
  └─ modules/orders/    DDD-lite (domain/application/infrastructure) — the one module
                        that earns the extra structure; don't retrofit it elsewhere,
                        don't undo it here — just make every write path actually use it

apps/web  (Next.js, API-only data access — never touches Postgres directly)
  └─ features/<name>/   schemas/api/queries/mutations/components — proven pattern,
                        fully migrated, keep extending it as-is

packages/db             Prisma schema — already has the three-axis order model,
                        Decimal money everywhere, global BuyerAccount — keep the shape,
                        fix the enforcement gaps, not the schema
```

The one structural change this review recommends is inside the existing `orders`
module, not a new layer: make `Order`'s entity methods the only path to a status
write (§5). That closes the correctness gap without adding a single new concept
to the architecture.

For the future payment abstraction: don't add a `PaymentProvider` layer now.
When a real gateway integration starts, the natural extension point is already
visible — a new `PaymentSource` enum value (alongside
`SELLER_RECORDED`/`BUYER_SUBMITTED`) plus a nullable `providerRef` column on
`OrderPayment`. That's additive, not a migration of existing data, and it's
exactly the kind of "designed to evolve without a rewrite" property this review
was asked to check for. It's already there.

---

## 14. Roadmap

**Phase 0 — Foundations (days, not weeks)** Objective: close the correctness
gaps that could bite a real seller during Phase 1 validation, before more people
are relying on the system. Engineering: route all `paymentStatus` writes through
the `Order` entity; extend the expiration sweep to stalled `PARTIALLY_PAID`
orders; add the concurrency guard to `AdvanceFulfillmentUseCase`; fix the
cart-clear bug; give guests a durable confirmation URL; sync `CLAUDE.md`/core
docs with shipped reality. Product: none — this phase is pure hardening of what
already exists. Risks: low; all changes are localized, well within existing test
coverage patterns. Definition of done: no write path to `Order.paymentStatus`
bypasses the entity; a stalled partial payment past `expiresAt` is swept within
one cron cycle; a guest can refresh the confirmation page without losing it.

**Phase 1 — Chaos Killer MVP, in front of real sellers** Objective: put the
already-built loop (§2) in front of 5–10 real informal sellers. Engineering:
nothing new required to start — Phase 0 is the prerequisite, not more features.
Product: recruit sellers (the named K-pop import store from `product.md` is the
obvious first), onboard them personally, watch where they get stuck.
Dependencies: Phase 0 complete. Risks: the biggest risk here is skipping this
phase in favor of building more — the codebase is ready for it now, further
delay is the actual risk, not under-building. Definition of done: at least one
seller has processed real orders and real payment proofs through the full loop
for two consecutive weeks without the team manually fixing data.

**Phase 2 — Product Polish** Objective: fix the rough edges Phase 1 usage will
surface, plus the known Should-Haves. Engineering: cross-store buyer account
page; collapse the two payment-instruction channels; real 404s; Multer size
limits; resolve deposit-percent fields; whatever Phase 1 sellers actually
complain about. Product: respond to Phase 1 feedback before adding anything
speculative. Dependencies: Phase 1 findings. Definition of done: the specific
friction points named by Phase 1 sellers are resolved.

**Phase 3 — Validation / Traction** Objective: decide, with data, whether
BiasMarket is solving the chaos problem for more than one store. Engineering:
lightweight GMV/retention instrumentation (§8). Product: track
orders/store/week, proof-approval turnaround, week-2 retention. Expand seller
count past the initial cohort only once these are trending the right way.
Definition of done: a clear answer to "do sellers keep using this after week
one," backed by data, not anecdote.

**Phase 4 — Monetization** Objective: run the cheapest monetization experiment
the architecture actually supports. Engineering: a subscription/plan-gate check
— no new payment infrastructure required (§8). Product: pick between SaaS (A)
and freemium (E) based on Phase 3 retention data, not preference. Dependencies:
Phase 3 traction signal. Risks: monetizing before retention is proven risks
killing early adoption for marginal revenue.

**Phase 5 — Automated Payments** Objective: only once Phase 4 shows a real,
retained seller base asking for it. Engineering: the extension point already
exists (§13) — new `PaymentSource` value, provider integration, webhook
handling, idempotency. Get legal/accounting/payment-provider guidance before any
fund-holding design decision (Rule 7). Dependencies: proven business case, not a
fixed date.

**Phase 6 — Marketplace Payments / Payouts** Objective: only if Phase 5 traction
justifies holding seller balances. Risks: this is the phase with real regulatory
exposure — do not start engineering design here without professional legal
guidance first, per Rule 7.

---

## 15. Top 10 Things To Do Next

1. **Route every `Order.paymentStatus` write through the domain entity.** Why: 3
   of 5 write paths bypass the guard rails; `CancelOrderUseCase` currently
   allows the domain-illegal `VERIFIED → CANCELLED` transition. Outcome: every
   status change is guaranteed valid at every call site, for free, going
   forward. Dependencies: none. Complexity: Small–Medium.

2. **Extend the expiration sweep to stalled `PARTIALLY_PAID` orders.** Why: the
   cron currently only clears `PENDING_PAYMENT`; a stalled partial payment locks
   stock indefinitely — the exact stock-griefing risk `roadmap.md` already
   names. Outcome: stock holds release reliably regardless of how far payment
   got before stalling. Dependencies: #1 (shares the same write path).
   Complexity: Small.

3. **Fix the cart-not-cleared bug and add a durable guest order-confirmation
   URL.** Why: `clearCart` is defined and never called — every completed guest
   checkout leaves stale items in the cart. The confirmation screen is
   client-state only and disappears on refresh. Outcome: every buyer, logged in
   or guest, keeps a working reference to their order after checkout.
   Dependencies: none. Complexity: Small.

4. **Sync `CLAUDE.md`, `security-payments.md`, and `product.md` with what's
   actually shipped.** Why: all three currently describe helmet, env validation,
   and buyer payment-proof upload as not built — all three exist. Outcome: docs
   and code agree again; the next engineer or auditor doesn't repeat this
   discovery. Dependencies: none. Complexity: Small.

5. **Collapse the two buyer payment-instruction channels into one.** Why:
   structured `PaymentMethodConfig.details` and free-text
   `Store.paymentInstructions` are both shown to buyers with nothing keeping
   them consistent. Outcome: one source of truth for what a buyer sees at
   checkout. Dependencies: none. Complexity: Small–Medium.

6. **Replace the soft-200 "not found" pages with real `notFound()` 404s.** Why:
   both the storefront and product-detail pages return HTTP 200 for pages that
   don't exist — wrong for SEO and monitoring, worse as discovery investment
   increases. Outcome: correct HTTP semantics before any further SEO work is
   worth doing. Dependencies: none. Complexity: Small.

7. **Build the cross-store buyer "my orders" page.** Why: `BuyerAccount`,
   `CustomerStoreLink`, and the `getGlobalOrders`/`getGlobalProfile` API already
   exist — only the web route is missing. Outcome: one login, one order list,
   across every store. Dependencies: none — backend ready. Complexity: Medium.

8. **Add Multer `limits.fileSize` to all six upload endpoints.** Why: the
   app-level 5MB check runs after the full body is already buffered into memory
   — a real, low-effort memory-exhaustion vector, worse on the one `@Public()`
   upload route. Outcome: oversized requests get rejected at the transport
   layer, before they cost memory. Dependencies: none. Complexity: Small.

9. **Resolve the dead deposit-percent fields — build the read path or delete the
   fields.** Why: `product.md` documents a live, delivery-method-conditional
   deposit rule; the schema fields exist but are never read or exposed in the
   settings UI. Outcome: either a real partial-deposit feature, or an accurate
   product doc and a smaller schema. Dependencies: none. Complexity: Small
   (delete) / Medium (build).

10. **Put the existing product in front of 5–10 real informal sellers.** Why:
    the chaos-killer loop is ~85–90% built (§2) and zero evidence exists of a
    real, non-team seller using it end to end. Every other item on this list is
    small and bounded; this one is the actual bottleneck to learning anything.
    Outcome: real usage data to drive Phase 2 prioritization, the Phase 4
    monetization choice, and the honest MVP-readiness score in §17.
    Dependencies: Phase 0 (items 1–3). Complexity: Product/ops, not engineering
    — the highest-leverage item on this list.

---

## 16. What NOT To Build Yet

Everything below was checked against the actual code and confirmed not started —
these are deliberate holds, not gaps to feel behind on.

- **PaymentProvider / gateway abstraction** — no gateway exists to abstract over
  yet; the extension point (§13) is already visible when needed.
- **Webhook infrastructure** — zero webhook code anywhere; nothing to receive
  from without a gateway.
- **Marketplace payouts / seller balances** — real regulatory exposure; needs
  legal/accounting guidance before any design work, per Rule 7.
- **Subdomain / custom-domain routing** — data layer already supports it;
  nothing blocks deferring the routing work until demanded.
- **Microservices** — the modular monolith shows no scaling or team-topology
  pressure that would justify the split.
- **Transaction-fee billing** — architecturally unenforceable until Phase 5; the
  platform doesn't touch the money yet.
- **Themes marketplace** — not started, not needed for the chaos-killer
  hypothesis, explicitly out of scope in `product.md`.
- **Advanced analytics / recommendations** — no traction data exists yet to
  build recommendations against.
- **Group-order tooling beyond current states** — correctly scoped to v2 already
  in `roadmap.md`.

---

## 17. Founder / Product Perspective

| Dimension                     | Score  |
| ----------------------------- | ------ |
| Product Readiness             | 7 / 10 |
| Engineering Readiness         | 7 / 10 |
| MVP Readiness                 | 6 / 10 |
| Payment Readiness (manual)    | 8 / 10 |
| Payment Readiness (automated) | 1 / 10 |
| Monetization Readiness        | 1 / 10 |

**Product 7/10** — the actual hypothesis (structure the WhatsApp/Yape chaos
without touching the money) is implemented end to end and matches the founders'
own stated theory closely. It loses points for zero validated real-seller usage
and a couple of rough buyer-facing edges (§2, §11), not for missing scope.

**Engineering 7/10** — clean by every debt metric checked (near-zero TODO
markers, 123 real tests with genuine assertions, path-filtered CI,
Decimal-correct money everywhere, zero IDORs across a dozen-plus services). It
loses points for the state-machine enforcement fragmentation (§5) and for
documentation that's drifted from a codebase this actively maintained.

**MVP readiness 6/10** — "readiness" means both "built" and "validated." The
build side scores well; the validation side is at zero. `roadmap.md` and
`docs/plans/` themselves never mention a real seller having used the loop yet.

**Manual payment readiness 8/10** — genuinely the strongest subsystem in the
repo: dual-source proof model, Decimal-safe aggregation with two documented
bug-fix retrospectives already behind it, private storage, full audit trail.
Docked for the dead deposit-percent fields and the upload size gap, both small.

**Automated payment readiness 1/10** and **monetization readiness 1/10** —
correctly, deliberately near-zero. Nothing here is a defect; building either now
would be the actual mistake.

**If I were the CTO joining today, the next 30 days:** spend the first week on
Phase 0 only — the state-machine consolidation, the expiration-sweep fix, the
cart bug, the doc sync. All four are small, bounded, and remove the only real
correctness risks found in this review. Do not let this turn into a larger
refactor; the domain model doesn't need to change shape, just to actually be
used everywhere it claims to be.

Spend the remaining three weeks on exactly one thing: getting real sellers —
starting with the K-pop import store already named in `product.md` — running
actual sales through the product, and sitting close enough to watch where they
get stuck. The codebase does not need another feature to make that possible;
it's ready now. The biggest risk to this project in the next 30 days isn't a bug
— it's spending them building Phase 2 or Phase 4 items before Phase 1 has a
single real data point behind it.

---

## 18. Executive Summary

1. **What BiasMarket is today:** a working, modular-monolith,
   manual-payment-first store builder for creator commerce (K-pop merch first) —
   NestJS API, Next.js storefront/dashboard, Postgres, MinIO, Resend — with the
   full store → catalog → checkout → payment proof → review → fulfillment loop
   implemented, not stubbed.
2. **The problem being solved:** informal sellers already run commerce through
   Instagram, WhatsApp, Yape/Plin, and screenshots. BiasMarket doesn't replace
   that — it structures it, without ever touching the money.
3. **What's already working:** checkout, catalog, multi-tenant ownership
   isolation (zero IDORs found), the payment-proof review system (the strongest
   subsystem in the repo), fulfillment tracking, and a data model that already
   supports global buyer identity across stores.
4. **What's missing:** not features — consolidation. Three order-status write
   paths bypass the domain guard rails; the expiration sweep misses stalled
   partial payments; a buyer's cart never clears after checkout; core docs
   describe features that shipped days ago as unbuilt; and the cross-store buyer
   account view has a ready backend but no frontend.
5. **What to build next:** Phase 0 only — the handful of small, bounded
   correctness fixes in §15, items 1–6. Nothing else is blocking.
6. **What to explicitly postpone:** any payment-gateway abstraction, webhooks,
   marketplace payouts, subdomains, microservices, transaction-fee billing,
   themes marketplace, and advanced analytics. None of them are needed to answer
   the one open question that matters.
7. **How manual payments fit the MVP:** they _are_ the MVP's payment story, and
   they're close to production-grade already — Decimal-safe, audited, privately
   stored, dual-source. This is not the risky part of the product.
8. **When automated payments make sense:** only after Phase 4 (a chosen, cheap
   monetization experiment) shows a retained seller base actually asking for it
   — and only with legal/accounting guidance before any fund-holding design
   decision.
9. **Monetization paths:** because the platform doesn't touch the money yet,
   transaction-fee models (B/D) are currently unenforceable by construction.
   SaaS (A) and freemium (E) are the only two options implementable today; the
   choice between them should come from Phase 3 retention data, not preference.
10. **What the team should align around:** the product is closer to done than a
    typical audit at this stage would find, and the biggest open risk isn't in
    the code — it's that the team keeps building instead of putting the
    already-built loop in front of a real seller. Fix the six Phase 0 items,
    then stop building and go validate.

---

_Prepared as a fresh, code-first review — `docs/audits/` was deliberately
excluded as a source per the review brief. Every claim above is traceable to a
specific file and line; where documentation and code disagreed, code was treated
as ground truth (Rule 1)._
