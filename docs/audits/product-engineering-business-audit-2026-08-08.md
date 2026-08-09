# BiasMarket — Product, Engineering & Business Audit

**Date:** 2026-08-08 **Scope:** Full repo re-review from code (not from the
earlier same-day `audit-2026-08-08.md`, which this document deliberately does
not treat as ground truth). **Method:** 7 parallel deep-reads covering business
docs, DB schema, the `orders` module, auth/security, all other API modules, the
web app, and infra/CI/observability. Every claim below is evidence-based with
`file:line` citations from those passes.

---

## 1. What BiasMarket is today

A multi-tenant store builder for "Group Order Managers" (GOMs) — mostly LATAM
K-pop/import-merch sellers currently running commerce through Instagram DMs,
WhatsApp, Google Forms/Sheets, and manual Yape/Plin/bank transfers
(`docs/business/icp.md:7-60`). The pitch (`docs/core/product.md:12-31`) is:
launch a store in minutes, no Stripe, manual payment methods with seller-side
verification, order tracking built for group-order/import commerce rather than
in-stock retail.

Stack matches CLAUDE.md exactly: NestJS `api` (sole DB owner) + Next.js `web`
(HTTP-only client) + Prisma/Postgres, pnpm/Turborepo monorepo, `orders` module
using DDD-lite layering, everything else flat controller/service/dto.

**Important correction vs. the task brief's assumptions:** the brief describes
an in-app "buyer uploads proof of payment" flow as a built system. It isn't. The
`PaymentProof` model was **deleted today** (migration
`20260808192135_delete_payment_proof`) — it was dead schema, never written to.
The actual flow is: buyer places order → gets redirected to WhatsApp → pays
seller externally → **seller** manually records the payment (`OrderPayment`) in
the dashboard and optionally attaches a screenshot themselves via
`RegisterPaymentForm`
(`apps/web/features/orders/components/register-payment-form.tsx`). There is no
buyer-facing upload UI anywhere in `(storefront)`. This is a real
product-positioning gap, not a bug — see §7.

---

## 2. What's already built (high confidence, evidence-based)

| Area                                                                                                    | State                                               |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Multi-tenant store CRUD, slug routing, theming config                                                   | Built, solid                                        |
| Product/variant catalog, image upload w/ magic-byte validation                                          | Built, solid                                        |
| Categories, collections, store-sections (with reordering)                                               | Built, solid                                        |
| Atomic stock reservation on checkout (`FOR UPDATE`/conditional-decrement SQL)                           | Built, solid — no race condition                    |
| Cart (client-side, localStorage) → checkout → order creation                                            | Built, wired to real API                            |
| Order state machine (payment + fulfillment status), ownership-gated transitions                         | Built, mostly solid (one bug — §6)                  |
| Seller dashboard: products, orders (review/reject/advance/cancel), settings, notifications, analytics   | Built, most complete part of the app                |
| Buyer auth (`Customer` model, HMAC-signed session cookie, separate from seller better-auth)             | Built, well-isolated                                |
| Payment-config / delivery-config / pickup-points                                                        | Built (one dead field — §12)                        |
| i18n (ES/EN), frontend                                                                                  | Fully wired                                         |
| Notifications (in-app rows: low-stock/out-of-stock, order events)                                       | Built; **not emailed**, in-app only                 |
| Transactional email (Resend-backed `mailer` module)                                                     | Built, used for auth + payment-verified emails only |
| Error tracking (GlitchTip/Sentry-compatible, api + web)                                                 | Just landed today                                   |
| Env validation at boot                                                                                  | Just landed today                                   |
| Payment-proof image access control (private bucket, no presigned URLs, ownership-gated stream endpoint) | Just landed today                                   |

## 3. What's missing for a genuinely usable MVP

The gap is entirely on the **buyer's post-checkout experience**:

1. **No in-app payment instructions screen.** After order creation, the buyer
   sees a generic "order created, check email" message and (if configured) a
   WhatsApp redirect. No bank/Yape/Plin details rendered in-app
   (`apps/web/app/[locale]/(storefront)/.../checkout-page-client.tsx`).
2. **No buyer order-tracking page.**
   `find "app/[locale]/(storefront)" -iname "*order*"` returns nothing. The only
   place a buyer sees an order again is a non-clickable card on the account page
   (id/date/status/total, no detail view).
3. **No buyer-initiated proof-of-payment upload.** As above — inverts the "buyer
   submits, seller reviews" model implied by the product pitch. Today it's
   "seller manually records what buyer paid via WhatsApp," which works but is a
   materially different (and more seller-labor-intensive) product than what
   CLAUDE.md's summary implies.
4. **Buyer identity is per-store, not global**
   (`Customer.@@unique([storeId, phone])`) — a buyer re-registers with a
   separate password at every store. The "My Orders across stores" experience
   from the brief does not exist and cannot exist without a schema migration
   (§4).

Everything _before_ checkout (browse → cart → place order) is real and wired.
Everything _after_ checkout, from the buyer's side, is either missing or
asymmetric (seller does the work).

---

## 4. Buyer identity — architecture assessment

`Customer` (`packages/db/prisma/schema.prisma:386-403`) is scoped
`@@unique([storeId, phone])`. `Order.customerId` FKs into this per-store table.
Every API surface (`apiClient.customerAuth.login(slug, …)`, `.me(slug)`) is
store-scoped by construction.

**To support one global buyer account across stores**, the schema needs one of:

- **(a)** A new global `BuyerAccount` (phone/email as identity root) + a
  `CustomerStoreLink(buyerAccountId, storeId)` join carrying per-store extras,
  with `Order.customerId` repointed to the global id. Existing per-store
  `Customer` rows for the same phone number would need deduping/merging — a
  real, non-trivial migration, not additive.
- **(b)** Collapse `Customer` to a global `@@unique([phone])`, drop `storeId`
  from `Customer`, rely on `Order.storeId` alone for scoping. Simpler schema,
  but loses any legitimately store-specific buyer data (if that's ever wanted)
  and still requires the same dedup migration.

Either way: **this is a deliberate, scheduled migration, not a small feature.**
Recommend not touching it until traction data shows sellers/buyers actually want
cross-store identity (see §10 roadmap) — building it now is speculative.

---

## 5. Multi-tenant architecture

Path-based only (`/store/:slug`), confirmed: **no `middleware.ts` exists
anywhere in `apps/web`**, no subdomain/host-based routing code at all — not even
scaffolding. Every tenant-scoped Prisma model carries `storeId` with an index
(verified across Product, ProductVariant, Category, Collection, StoreSection,
Order, OrderItem, OrderPayment, PaymentMethodConfig, DeliveryMethodConfig,
PickupPoint, Customer, Notification, AuditLog). `ContactInquiry` is the one
deliberately-unscoped model (platform-level inbox, commented as such in schema).
No model found missing tenant scoping.

Ownership enforcement is per-service (`assertOwnership(storeId, userId)` /
`findOwned<Resource>` pattern), applied **consistently across every module** —
confirmed by the security-focused pass, no exceptions found.
`TenantMiddleware`/`AsyncLocalStorage` is explicitly documented as "never built,
not needed — per-service checks cover the same ground"
(`architecture.md:163-183`).

**Verdict: staying path-based is correct for now.** Nothing in the current
design blocks a later move to subdomains — slugs are already unique, already
indexed, already the sole tenant key in every query. The migration pain of
subdomains later is entirely in Caddy/DNS/cookie-domain config, not in the data
model or ownership layer. Do not build subdomain support before there's a seller
asking for a custom domain.

---

## 6. Orders and the order state machine

**Status values:**

- `paymentStatus`:
  `PENDING_PAYMENT → PARTIALLY_PAID / PAYMENT_SUBMITTED → VERIFIED / REJECTED`,
  plus `CANCELLED`. Terminal: `VERIFIED`, `REJECTED`, `CANCELLED`.
- `fulfillmentStatus`: `ORDERING → IN_TRANSIT → READY → COMPLETED`, strictly
  linear, no skips.
- A separate `status` (`ACTIVE`/`CANCELLED`) exists alongside `paymentStatus`,
  plus `cancellationResolution`/`releasedResolution` for bookkeeping
  (`REFUNDED`/`RETAINED`/`STORE_CREDIT` — labels only, no actual money movement,
  correct for a no-custody manual-payment model).

`PAYMENT_SUBMITTED` is a legal enum value with **no live code path setting it**
— MVP checkout redirects to WhatsApp instead of collecting in-app submission, so
this status is currently vestigial. Not a bug, just note it for whoever
eventually revisits Culqi/automated payments.

**Enforcement:** The `Order` domain entity (`domain/order.entity.ts`) is the
single source of truth for
`assertPaymentTransition`/`assertFulfillmentTransition`, used by
`ReviewPaymentUseCase` and `AdvanceFulfillmentUseCase`. Every seller-triggered
mutation calls `assertOwnership` first. This is well-tested — dedicated
VO/entity specs cover every transition and guard error.

**Two real gaps, both isolated to the cron sweep** (`orders-cron.service.ts`,
runs every 5 min via `ExpireOrdersUseCase`):

1. **Race condition (real bug):** `expire-orders.usecase.ts:50-53` writes
   `paymentStatus: CANCELLED` via a bare `tx.order.update`, with **no
   `updateMany({where:{paymentStatus:"PENDING_PAYMENT"}})` guard** — unlike
   every other transition path in this module, which all use
   optimistic-concurrency guards. If a seller approves/rejects an order in the
   window between the cron's `findMany` read and its write, cron silently
   overwrites that decision back to `CANCELLED`, and for an approved order the
   stock `reserved` count gets decremented twice (once by
   `ReviewPaymentUseCase`, once by cron), corrupting inventory counts. **Fix:**
   add the same `updateMany` guard used everywhere else in this module, ~5
   lines.
2. **Silent cancellation:** cron-expired orders write no `AuditLog` row (every
   human-triggered transition does), and never touch the separate `status`
   field, leaving `status: ACTIVE` + `paymentStatus: CANCELLED` — an
   inconsistent combination vs. seller-initiated cancellation, which sets both.

Neither is covered by a test today (the existing cron spec only asserts the
happy path). No `orders/**/*.e2e-spec.ts` exercises the full state machine end
to end, and **the whole `test:e2e` suite is not run in CI** (§13/§14) — so this
is the kind of bug that would only surface in production.

**Overall: the state machine is well-designed and mostly production-ready.**
This is the strongest-engineered part of the codebase. Fix the two cron issues
before relying on it under real concurrent load.

---

## 7. Payment proof system

There is no separate `PaymentProof` entity — it was deleted today as dead
schema. The real mechanism is `OrderPayment.imageUrl`, populated when a
**seller** uploads a screenshot while recording a payment
(`order.controller.ts:392-406`). Reading it back is properly access-controlled:
private S3/MinIO bucket, no presigned URLs, single streaming endpoint gated by
`assertOwnership` + store/order-scoped lookup (`order.controller.ts:301-323`,
hardened just today per
`docs/plans/2026-08-08-payment-proof-image-access-control-plan.md`).

Multiple payments are supported (`OrderPayment` is one-to-many off `Order`, no
count limit) — this correctly models partial/deposit payments toward
`requiredAmount`. Every payment write is inside a `$transaction` with an
`AuditLog` entry.

One real business-logic looseness: **a seller can mark `VERIFIED` on a partial
deposit** — `review-payment.usecase.ts` only blocks when `paidAmount <= 0`, not
`paidAmount >= requiredAmount`. This is a deliberate design choice per the code
comment (sellers may want to accept a deposit as "verified enough to start
production"), but worth the founders confirming it matches intent — it means
"VERIFIED" doesn't guarantee "paid in full."

**Recommended minimum robust model for manual payments — already mostly in
place:** `Order` ↔ `OrderPayment` (1:many, amount + optional image + timestamp)
↔ `AuditLog` (who/when/what). This is the right shape. The only thing missing is
the buyer-facing half of the loop (§3) — buyer self-serve upload plus seller
review, rather than seller self-recording. Whether to build that buyer-upload UI
is a product call, not an engineering one: it removes seller labor but adds a
moderation queue. **Recommend deferring** until seller feedback says manual
recording is too much friction — it's a contained, addable feature on top of the
existing `OrderPayment` model, not a rearchitecture.

---

## 8. Culqi / automated payments — foundations, not implementation

No Culqi (or any gateway) code exists anywhere in the repo — confirmed zero
hits. Docs mention Stripe/MercadoPago generically as "v2," explicitly deferred
(`roadmap.md:62-64,97`).

**What's already in the right shape for a future gateway integration:**

- `Order` ↔ `OrderPayment` is already a clean append-only ledger — a
  gateway-sourced payment is just another `OrderPayment` row with a different
  provenance.
- `AuditLog` already captures every state transition with actor/metadata — a
  webhook-triggered transition would slot into the same pattern used by
  `ReviewPaymentUseCase` today.
- `paymentStatus` already has `PAYMENT_SUBMITTED` as an unused intermediate
  state — this is exactly the state an async gateway callback would need before
  confirmation.
- Ownership/tenant scoping is already enforced at the service layer everywhere a
  payment-adjacent mutation would land.

**What does NOT exist yet and should NOT be built now:** `PaymentProvider`
abstraction, `PaymentAttempt`/idempotency-key tracking, webhook signature
verification/replay protection, refund flows, reconciliation jobs, seller
balance/payout ledgers. Building these before there's a signed gateway contract
is pure speculation — the current `OrderPayment` model doesn't block adding them
later; it just doesn't yet distinguish "manual" from "gateway-sourced" payments,
which is a one-column addition (`source: MANUAL | GATEWAY`) when the time comes,
not a redesign.

**Flag for the team, not a technical conclusion:** holding buyer funds, acting
as merchant of record, or maintaining seller balances/payouts (the second
diagram in the brief) has real regulatory weight in Peru that this audit is not
qualified to assess — get legal/accounting/payment-provider guidance before
committing to that model, independent of when the engineering work starts.

---

## 9. Monetization analysis

No monetization code or documented pricing model exists anywhere (`docs/core`,
`docs/business` — grepped, zero hits on pricing/subscription/commission). This
is a genuinely open decision.

Evaluated against the actual user (informal, price-sensitive, currently paying
$0 for Instagram+WhatsApp+Sheets):

- **A — SaaS/subscription:** High friction pre-trust. A GOM running their first
  group order has no revenue yet to justify a subscription; likely kills signups
  at the door. Works only once a seller has proven repeat volume.
- **B — Transaction fee (% of GMV):** Aligns incentive with actual usage — a
  seller pays nothing until they succeed. Fits a manual-payment model poorly
  right now because BiasMarket doesn't touch the money, so collecting a fee
  requires either a separate seller invoice/charge or waiting for automated
  payments (§8) to exist as the collection mechanism.
- **C — Hybrid:** Premature — adds pricing complexity before either lever is
  validated.
- **D — Payments monetization (take a cut of processed payments):** The most
  natural long-term model given the manual-payment starting point, but
  explicitly gated on §8 (automated payments) existing at all.
- **E — Freemium (paid advanced features):** Lowest-friction to test today —
  free tier is what exists now; a paid tier (e.g. more products, priority
  support, custom theming, analytics depth) can be bolted on without touching
  the payment/order core at all.

**Recommendation: don't decide yet.** What to measure first (this is the actual
deliverable of this section): time-to-first-order after signup, week-4 retention
(sellers still creating orders a month in), GMV per active store, and —
critically — whether sellers who stop using it cite "too basic" (→ freemium/SaaS
signal) or "too much manual work" (→ take-rate-on-automation signal, meaning §8
is the real unlock). Freemium is the only model cheap enough to instrument now
without committing to a payments roadmap.

---

## 10. MVP definition

**MUST HAVE**

- Buyer-facing payment instructions screen post-checkout (bank/Yape/Plin details
  rendered in-app, not just WhatsApp redirect)
- Buyer order-tracking page (status, what's next, is a real page — currently
  zero-effort card only)
- Fix the cron race condition (§6) before relying on the expiry sweep under real
  load
- Automated DB/MinIO backups (§13) — currently manual-only, real data-loss
  exposure

**SHOULD HAVE**

- Buyer-initiated proof-of-payment upload (removes seller labor, but only after
  manual-recording friction is confirmed as a real complaint)
- CSRF hardening on seller-dashboard mutation routes (currently relies on
  `SameSite=Lax` alone; buyer routes already got an explicit `OriginGuard`)
- e2e suite running in CI (currently local-only)
- Global rate limiting default for dashboard mutation endpoints (currently
  opt-in per module)

**NICE TO HAVE**

- Structured logging / log aggregation (currently `Logger` in 5 files +
  `docker compose logs`)
- Global buyer identity across stores (§4) — real migration, wait for demand
  signal
- Email notifications for stock alerts (currently in-app only)

**DO NOT BUILD YET**

- Subdomain/custom-domain routing
- Culqi/any payment gateway integration
- Seller balances, payouts, marketplace-of-record architecture
- Refund automation
- Advanced analytics/recommendations
- Monetization/billing infrastructure

---

## 11. Gap analysis

| Area                              | Current State                                                                      | Target State                                      | Gap                                         | Priority                   | Effort |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------- | -------------------------- | ------ |
| Authentication                    | Seller (better-auth) + buyer (custom signed-cookie) both solid, well-isolated      | Same                                              | None material                               | —                          | —      |
| Buyer accounts                    | Per-store only, real login/session/profile                                         | Global across stores                              | Schema migration + dedup                    | Low (no demand signal yet) | High   |
| Seller accounts                   | Complete, role-based, admin RBAC enforced                                          | Same                                              | None material                               | —                          | —      |
| Multi-tenancy                     | Path-based, storeId everywhere, ownership enforced per-service                     | Same (evolve to subdomains only if a seller asks) | None blocking                               | —                          | —      |
| Products/catalog                  | Full CRUD, variants, images, stock                                                 | Same                                              | None material                               | —                          | —      |
| Inventory                         | Atomic reservation, no race conditions                                             | Same                                              | None                                        | —                          | —      |
| Cart                              | Client-side, real                                                                  | Same                                              | None                                        | —                          | —      |
| Checkout                          | Real, server-recomputes prices, atomic stock                                       | In-app payment instructions after submit          | Missing screen                              | **High**                   | Low    |
| Orders (backend)                  | Well-modeled state machine, audited, mostly tested                                 | Same + cron guard fix                             | Race condition + missing audit on cron path | **High**                   | Low    |
| Orders (buyer-facing)             | Non-clickable card only                                                            | Real tracking page                                | Missing page                                | **High**                   | Medium |
| Payment proof                     | Seller-recorded, access-controlled                                                 | Optionally buyer-initiated upload                 | Missing buyer UI                            | Medium                     | Medium |
| Payment status                    | Manual only, correctly modeled                                                     | Ready to extend for gateway later                 | None blocking                               | —                          | —      |
| Shipping/fulfillment              | Linear status, pickup points, delivery config                                      | Same                                              | None material                               | —                          | —      |
| Notifications                     | In-app only                                                                        | Optional email for stock alerts                   | Missing email trigger                       | Low                        | Low    |
| Customer management (seller side) | Full CRUD via dashboard                                                            | Same                                              | None material                               | —                          | —      |
| Seller dashboard                  | Most complete part of the app                                                      | Same                                              | None material                               | —                          | —      |
| Buyer dashboard                   | Minimal (order cards only)                                                         | Real account/order center                         | See above                                   | **High**                   | Medium |
| Analytics                         | Real seller-side stats module, no hardcoded numbers                                | Same                                              | None material                               | —                          | —      |
| Search                            | Not audited in depth this pass; discovery layer exists per docs                    | —                                                 | —                                           | —                          | —      |
| File storage                      | Private buckets, access-controlled, magic-byte validated uploads                   | Same                                              | None material                               | —                          | —      |
| Security                          | Ownership pattern universal, no IDOR found; CSRF/rate-limit gaps on seller routes  | CSRF + rate-limit parity with buyer routes        | See §14                                     | Medium                     | Low    |
| Testing                           | Strong unit+e2e coverage per-module; e2e not run in CI; cron race untested         | e2e in CI                                         | Missing CI job                              | Medium                     | Low    |
| Observability                     | GlitchTip + env validation just landed; no structured logging/aggregation          | Same + logging                                    | Logging gap                                 | Low                        | Medium |
| Deployment                        | Single-VM Compose, health-gated containers, no zero-downtime, no automated backups | Automated backups minimum                         | Backup automation                           | **High**                   | Low    |
| SEO                               | Not deeply audited this pass                                                       | —                                                 | —                                           | —                          | —      |
| Performance                       | Not deeply audited this pass                                                       | —                                                 | —                                           | —                          | —      |
| Accessibility                     | Not deeply audited this pass                                                       | —                                                 | —                                           | —                          | —      |

---

## 12. Technical debt audit

**Critical (fix before/around launch):**

- Cron expiry race condition — can silently overwrite a seller's payment
  decision and double-decrement stock
  (`orders/application/expire-orders.usecase.ts:50-53`). Small fix, real
  correctness risk.
- No automated DB/MinIO backups — manual `pg_dump`/`tar` only, documented but
  not scheduled. A lost VM disk between manual backups loses all
  orders/products/payment records.

**Important (fix soon):**

- No zero-downtime deploy — `prisma migrate deploy && exec node ...` runs inline
  on container start, immediate restart on every `pnpm docker:prod`, no
  health-gated rollout. Acceptable at single-VM/single-seller-cohort scale,
  worth revisiting before heavier traffic.
- `test:e2e` not run in CI — only unit specs gate merges; the order state
  machine and OpenAPI-contract paths are e2e-checked locally at best.
- CSRF/rate-limit inconsistency between buyer routes (explicit `OriginGuard`,
  throttled) and seller-dashboard routes (neither) — seller actions are
  higher-value targets (cancel orders, approve payments, delete stores).
- Throttler config duplicated identically across 4 modules instead of one global
  default — drift risk, not a live bug.
- Possible real GlitchTip DSN committed in `infra/docker/.env.example` under a
  "safe dev defaults" banner — worth a five-minute check with whoever owns
  `issues.bobadilla.tech` on whether that's actually the production project.

**Acceptable (can stay):**

- Debug `console.log` calls in
  `apps/web/app/[locale]/(storefront)/store/[slug]/page.tsx` — noisy, not risky.
- `PaymentMethodConfig.details`/`depositPercentPickup`/`depositPercentCourier` —
  dead schema columns superseded by `Store.paymentInstructions`. Clean up
  opportunistically, not urgent.
- `PAYMENT_SUBMITTED` enum value with no live code path — harmless, will matter
  once buyer proof-submission is built.
- Sparse structured logging (`Logger` in 5 files, 2 stray `console.log` in the
  mailer) — fine at current scale, revisit if debugging production incidents
  gets painful.

---

## 13. Security review

**No IDOR or cross-tenant data-access bugs were found.** Ownership checks
(`assertOwnership(storeId, userId)`) are applied consistently across every
module; `storeId` is never client-writable in any DTO; the global
`ValidationPipe({whitelist:true, forbidNonWhitelisted:true})` closes
mass-assignment. Buyer and seller auth are two fully separate systems (different
cookies, different secrets, different guards) — a buyer session cannot reach
seller endpoints or vice versa, and `assertStoreMatch` closes a cross-store
replay of a stolen buyer token. Payment-proof images are private-bucket +
ownership-gated-stream only, no presigned URLs. Admin RBAC (`@Roles(["admin"])`)
is correctly enforced on the three admin-only endpoints, and `role` is
server-controlled, never client-writable.

**Two real, moderate-severity gaps, both about consistency rather than an active
exploit today:**

1. **CSRF — seller-dashboard mutation routes have no `Origin`/`Referer` check**,
   unlike buyer routes which got an explicit `OriginGuard` today. Mitigated by
   better-auth's default `SameSite=Lax` session cookie (blocks classic
   cross-site form POST in modern browsers), but this is inconsistent posture on
   the higher-value surface (delete store, cancel orders, approve payments).
   _Recommend:_ extend the same `OriginGuard` pattern to seller mutation routes.
2. **Rate limiting is opt-in per module, not global.** Buyer-facing abuse
   surfaces (register/login/checkout/contact/restock) are throttled; the entire
   seller-dashboard API surface (products, categories, collections, stats, order
   review/cancel/advance) has none. Low severity since all require a valid
   session already, but inconsistent with the discipline applied elsewhere.
   _Recommend:_ a global `APP_GUARD` default throttle, keep the tighter
   per-route limits where they already exist.

Everything else checked (mass assignment, webhook security — none exist, secrets
management, checkout price-tampering, stock-race exploitation) came back clean
with concrete evidence, not just "nothing found so far."

---

## 14. Recommended architecture

The current shape — modular monolith, `orders` as the one DDD-lite module,
everything else flat controller/service/dto, per-service ownership checks
instead of global tenant middleware — is **already the right architecture for
this stage.** Nothing here should be rewritten. Specific, minimal additions
worth planning for (not building now):

```
Global Buyer Identity        → deferred migration (§4), wait for demand signal
Seller / Store Tenancy       → already correct, no changes needed
Products                     → already correct
Orders                       → already correct, fix the two cron issues (§6)
Manual Payment Proof         → already correct, buyer-upload UI is additive, not a redesign
Order State Machine          → already correct, well-tested
Future Payment Abstraction   → OrderPayment.source: MANUAL|GATEWAY is the one column to
                                add when a gateway contract is actually signed; everything
                                else (PaymentProvider, idempotency, webhooks, refunds,
                                reconciliation) waits for that trigger, not built ahead of it
```

No microservices case exists here — single team, single deploy target, no
independent scaling need identified anywhere in this audit. Keep the monolith.

---

## 15. Roadmap

**Phase 0 — Foundations (before more feature work)**

- Fix cron expiry race condition + missing audit log (§6) — small, high-value
- Stand up automated DB/MinIO backup (cron job or Compose service running the
  already-documented manual commands on a schedule)
- Add `test:e2e` to CI
- Extend `OriginGuard` to seller-dashboard mutation routes; add a global default
  throttle _Dependencies:_ none. _Risk if skipped:_ silent data corruption (cron
  bug), unrecoverable data loss (backups), regressions merging unnoticed (e2e).
  _Done when:_ all four shipped and covered by a test/CI check where applicable.

**Phase 1 — Chaos-Killer MVP (buyer-side completion)**

- In-app payment-instructions screen post-checkout
- Buyer order-tracking page (real detail view, not a card) _Dependencies:_ Phase
  0's backup work should land first (this phase increases real order volume).
  _Risk:_ none new — this is completing an existing, well-modeled flow. _Done
  when:_ a buyer can place an order and follow it end-to-end without WhatsApp as
  the only channel for status.

**Phase 2 — Product Polish**

- Buyer-initiated proof-of-payment upload (only if seller feedback says manual
  recording is friction)
- Email notifications for stock alerts and order status changes
- Structured logging _Dependencies:_ Phase 1 live and generating real usage to
  validate whether Phase 2's items are actually wanted.

**Phase 3 — Validation / Traction**

- Instrument: time-to-first-order, week-4 seller retention, GMV/active store,
  churn reason (too basic vs. too manual)
- Talk to 10-20 real sellers using Phase 1's completed flow _Done when:_ enough
  signal exists to pick a monetization model (§9), not before.

**Phase 4 — Monetization**

- Ship freemium tier first (cheapest to test, doesn't touch payment core)
- Revisit take-rate model only once/if automated payments (Phase 5) exist as the
  collection mechanism _Dependencies:_ Phase 3 data.

**Phase 5 — Automated Payments**

- Only after Phase 3/4 prove GMV and willingness-to-pay
- Legal/regulatory review before any custody-of-funds design (§8) — not an
  engineering decision
- Add `OrderPayment.source`, `PaymentProvider`, webhook handling, idempotency at
  this point, not earlier

**Phase 6 — Marketplace Payments/Payouts**

- Only if traction and Phase 5 justify seller balances/payouts as a real
  business need — this is the second diagram in the brief, explicitly out of
  scope until then.

---

## 16. Top 10 things to do next

1. **Fix the cron expiry race condition.** Why: silent data corruption
   (overwrites seller decisions, double-decrements stock) under real concurrent
   load. Outcome: `orders-cron` becomes trustworthy. Dependencies: none.
   Complexity: trivial (add one `updateMany` guard + `AuditLog` write, mirrors
   existing pattern in the same module).
2. **Automate DB/MinIO backups.** Why: current backup is manual-only; VM loss =
   total data loss. Outcome: scheduled, verified backup running. Dependencies:
   none. Complexity: low (script the already-documented manual commands into
   cron/Compose).
3. **Ship buyer-facing payment-instructions screen post-checkout.** Why: this is
   the single biggest gap between "order created" and a usable buyer experience.
   Outcome: buyers see how/where to pay without relying solely on WhatsApp.
   Dependencies: none, `Store.paymentInstructions` already exists. Complexity:
   low-medium (new page + component).
4. **Ship buyer order-tracking page.** Why: buyers currently can't see their own
   order status in any real way. Outcome: closes the loop the product pitch
   promises. Dependencies: none, `Order`/`OrderPayment` data already exposed via
   `CustomerProfileResponseDto`. Complexity: medium.
5. **Add `test:e2e` to CI.** Why: the order state machine (the most important
   module) is currently only e2e-tested locally, if at all, before merge.
   Outcome: regressions caught pre-merge. Dependencies: none. Complexity: low
   (wire existing suite into the CI workflow).
6. **Extend `OriginGuard` (CSRF defense) to seller-dashboard mutation routes.**
   Why: highest-value actions (cancel orders, approve payments, delete stores)
   currently rely on cookie `SameSite` alone; buyer routes already got the
   explicit fix. Outcome: consistent CSRF posture. Dependencies: none, pattern
   already exists to copy. Complexity: low.
7. **Add a global default rate-limit guard for the seller-dashboard API.** Why:
   currently zero rate limiting on most authenticated mutations. Outcome:
   consistent abuse protection. Dependencies: none. Complexity: low.
8. **Instrument the 3-4 retention/GMV metrics from §9/§15 Phase 3.** Why:
   monetization and automated-payments decisions are currently pure speculation
   without this data. Outcome: a data-backed answer to "which model, when."
   Dependencies: Phase 1 (buyer flow) live first, so usage is real. Complexity:
   low (analytics events + a dashboard query).
9. **Verify/rotate the GlitchTip DSN in `infra/docker/.env.example` if it's a
   real production endpoint.** Why: committed under a "safe dev defaults" label
   but looks like a live project ID. Outcome: either confirmed harmless or
   rotated. Dependencies: none. Complexity: trivial (5-minute check).
10. **Decide, on purpose, whether buyer-initiated proof upload is worth
    building** — don't build it speculatively; ask 5-10 sellers using the Phase
    1 flow whether manual recording is actually painful. Why: it's a real,
    contained feature (not a rearchitecture) but adds a moderation workflow —
    only build it if sellers ask. Outcome: an evidence-based yes/no instead of
    guessing. Dependencies: Phase 1 live, some real usage. Complexity: n/a (this
    is a decision task, not a build task).

---

## 17. Things we should NOT build yet

- Culqi or any payment gateway integration — no signed contract, no proven GMV
  yet
- Seller balances, payouts, marketplace-of-record architecture — regulatory
  weight this audit can't clear, and no volume to justify it
- Subdomain/custom-domain routing — no seller has asked, path-based costs
  nothing to keep
- Global buyer identity migration — real schema work with no demand signal yet
- Microservices of any kind — single team, single deploy target, no scaling case
  exists
- Refund automation — there's no custody of funds to refund
- Advanced analytics/recommendation engines — the existing stats module already
  covers what sellers need at this stage
- Subscription/SaaS billing infrastructure — freemium is cheaper to test first
  and doesn't require billing plumbing
- AI features of any kind — nothing in this audit surfaced a problem that needs
  one

---

## 18. Founder / product perspective

**Product readiness: 6/10.** The core loop (browse → buy → seller fulfills
manually) is real, not a mockup. It loses points because the buyer's half of the
loop stops cold right after checkout — no in-app payment instructions, no
tracking. That's a small amount of remaining work on a well-built foundation,
not a redesign.

**Engineering readiness: 7/10.** Ownership/tenant isolation is genuinely solid
(no IDOR found across a full pass), the order state machine is well-modeled and
mostly tested, atomic stock handling is correct. Docked for the cron race
condition, missing e2e-in-CI, and the CSRF/rate-limit inconsistency between
buyer and seller routes — all real but all small, contained fixes, not
architectural problems.

**MVP readiness: 5/10.** Held back specifically by §3/§10's buyer-side gap.
Everything the seller needs is there; what the buyer sees after paying isn't.
This is the single highest-leverage thing to close.

**Payment readiness: 7/10 for the manual model BiasMarket actually needs
today.** The `OrderPayment`/`AuditLog`/state-machine shape is exactly right and
doesn't need rework to eventually support a gateway. Not scored against
automated payments because that's explicitly not the current product.

**Monetization readiness: 2/10.** No model chosen, no metrics instrumented, no
code exists — and that's correct for this stage. Score reflects "not started,"
not "behind."

**If I were the CTO joining today, my next 30 days:** ship the buyer-side
completion (payment instructions screen + order tracking page — items #3/#4
above), fix the cron bug and get backups automated in the same sprint since
they're both small and both real risk, wire `test:e2e` into CI so the
order-state-machine module stays trustworthy as more people touch it, and start
instrumenting the retention/GMV metrics from day one of that buyer-flow release
— not after. Everything else in this document (payments, monetization, global
buyer identity, subdomains) waits for what that data says.

---

## 19. Executive summary

BiasMarket today is a real, working multi-tenant store builder for informal
LATAM sellers, with a genuinely solid backend: tenant isolation is enforced
everywhere, the order state machine is well-designed and mostly tested, stock
handling is race-safe, and buyer/seller auth are properly separated. The
seller-facing dashboard — products, orders, settings, notifications — is the
most complete part of the product and is not a stub anywhere it was checked.

The gap is specific and narrow: the buyer's experience stops being real right
after checkout. There's no in-app payment-instructions screen, no order-tracking
page, and the "proof of payment" system the pitch describes is actually
seller-recorded, not buyer-submitted — the `PaymentProof` model was deleted
today as dead schema in favor of a simpler `OrderPayment`-only flow. None of
this requires a rewrite; it's the next feature to build, not an architecture
problem.

Two things need fixing regardless of feature work: a real (if narrow) race
condition in the order-expiry cron job, and the total absence of automated
backups. Both are small fixes with outsized downside if ignored.

Manual payments fit the MVP correctly as designed — BiasMarket never holds
money, sellers verify externally-received payments, and the data model
(`OrderPayment` + `AuditLog`) is already shaped so that adding a real payment
gateway later is additive, not a rearchitecture. Automated payments (Culqi or
otherwise) should wait until there's proven GMV and — separately —
legal/regulatory guidance on custody-of-funds questions this audit isn't
qualified to answer. Monetization hasn't been decided and shouldn't be yet;
freemium is the cheapest model to test once the buyer-side flow is complete, and
the real decision should be driven by retention/GMV data the team isn't
currently collecting.

**Align around this:** finish the buyer's half of the order flow next, fix the
two operational risks (cron race, backups) alongside it, start measuring
retention and GMV the moment that ships, and defer every
payments/monetization/multi-tenancy-evolution decision in this document until
that data exists.
