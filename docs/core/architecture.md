# Architecture

Architecture for Bias Market: monorepo, multi-tenant backend, database, theming,
Next.js frontend, security, deployment, background jobs.

---

## 1. Monorepo Design

```
biasmarket/
  apps/
    api/                  # NestJS backend, sole owner of the database
    web/                  # Next.js frontend (storefront, dashboard, admin, marketing)
    workers/              # NestJS + BullMQ background jobs, no database access
    mobile/               # Expo Router buyer app
    sanity/               # Sanity Studio for blog content
  packages/
    db/                   # Prisma schema + generated client, migrations
    design-tokens/        # Portable store palettes + validated theme resolution
    types/                # OpenAPI-generated SDK and request/response contracts
    i18n/                 # ES/EN translation dictionaries
    query/                # Shared React Query client defaults
    queue/                # BullMQ queue names, job names, payload contracts
    utils/                # Shared pure functions
    validation/           # Shared zod schemas
  infra/                  # docker (dev), vps (production), terraform
  turbo.json / pnpm-workspace.yaml
```

**Hard boundary**: `web` never imports `packages/db` or talks to Postgres
directly. All data access goes through `api` over HTTP. This is the #1 rule that
keeps multi-tenant isolation enforceable in one place instead of two.

- `packages/types` is the OpenAPI-generated contract between API consumers and
  `api`; response/request shapes are not duplicated by hand.
- `packages/design-tokens` holds portable palette data and pure resolution
  logic. Web-only Base UI/Tailwind components stay in `apps/web/components/ui`;
  React Native consumes the tokens, not those DOM components.
- Bad pattern to avoid: importing `@prisma/client` into `web` "just for types" —
  it drags the DB boundary into the frontend bundle and tempts direct queries
  later.

### Workspace map

| Workspace                | Purpose                                      | Imported by            | Boundary rule                                |
| ------------------------ | -------------------------------------------- | ---------------------- | -------------------------------------------- |
| `apps/api`               | REST API, auth, domain logic                 | none                   | Only package that imports `db`               |
| `apps/web`               | Storefront, dashboard, admin                 | none                   | HTTP to `api` only                           |
| `apps/workers`           | Queue consumers and schedulers               | none                   | Imports `queue` only; calls `api` over HTTP  |
| `apps/mobile`            | Buyer app (Expo)                             | none                   | HTTP to `api` only                           |
| `apps/sanity`            | Blog content studio                          | none                   | Read by `web` through the Sanity client      |
| `packages/db`            | Prisma schema, client                        | `api`                  | Never imported by `web`, `mobile`, `workers` |
| `packages/types`         | Orval SDK from `openapi.json`                | `api`, `web`, `mobile` | Generated; see [ci.md](ci.md)                |
| `packages/queue`         | Queue and job contracts                      | `api`, `workers`       | Pure contracts, no business logic            |
| `packages/utils`         | Pure helpers (cart, currency, WhatsApp text) | `api`, `web`, `mobile` | No I/O                                       |
| `packages/validation`    | zod schemas for forms                        | `web`, `mobile`        | The API validates with `class-validator`     |
| `packages/design-tokens` | Palettes and theme resolution                | `web`, `mobile`        | See §5                                       |
| `packages/i18n`          | ES/EN dictionaries                           | `web`, `mobile`        | See [i18n.md](i18n.md)                       |
| `packages/query`         | React Query client defaults                  | `web`, `mobile`        | Client-side only                             |

Web UI primitives live in `apps/web/components/ui`; there is no shared UI package.

### API module catalog

Routes sit under the global `api` prefix, and prefixes below are full paths
(some controllers, such as `restock`, mount at `stores` and add the rest per
route). `/internal/*` routes are outside it. Module folders are
`apps/api/src/modules/<module>`.

| Module               | Controller prefix                                                                     | Owning model                                                   | Where documented / notes                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `addresses`          | `stores/:slug/account/addresses`                                                      | `Address`                                                      | Buyer shipping addresses per store account                                                                                 |
| `categories`         | `stores/:storeId/categories`                                                          | `Category`                                                     | [product.md §5.9](product.md#59-seller-panel-management)                                                                   |
| `collections`        | `stores/:storeId/collections`                                                         | `Collection`                                                   | Named product groups shown as storefront sections                                                                          |
| `contact`            | `contact`                                                                             | `ContactInquiry`                                               | [admin.md](admin.md)                                                                                                       |
| `coupons`            | `admin/coupons`, `coupons/redeem`, `internal/premium`                                 | `Coupon`, `CouponRedemption`                                   | [product.md §5.11](product.md#511-plans-and-premium-coupons)                                                               |
| `couriers`           | `stores/:storeId/couriers`                                                            | `Courier`, `CourierConfig`                                     | [product.md §5.5](product.md#55-delivery-methods-seller-panel)                                                             |
| `customer-auth`      | `stores/:slug/account`, `account`                                                     | `BuyerAccount`, `CustomerStoreLink`                            | [security-payments.md §7.5](security-payments.md#75-seller-and-buyer-identity)                                             |
| `delivery-config`    | `stores/:storeId/delivery-methods`                                                    | `DeliveryMethodConfig`                                         | [product.md §5.5](product.md#55-delivery-methods-seller-panel)                                                             |
| `health`             | `health`                                                                              | none                                                           | [deploy.md](deploy.md)                                                                                                     |
| `monitoring`         | `monitoring`                                                                          | `PlatformIncident`                                             | [incident-response.md](incident-response.md)                                                                               |
| `notifications`      | `stores/:storeId/notifications`                                                       | `Notification`                                                 | Seller in-app inbox (stock and payment events)                                                                             |
| `orders`             | `stores/:storeId/orders`, `stores/:slug/checkout`, `public/orders`, `internal/orders` | `Order`, `OrderItem`, `OrderPayment`, `OrderEvent`, `Customer` | §2, [security-payments.md §9](security-payments.md#9-payment-flow-design-manual), [assisted-orders.md](assisted-orders.md) |
| `payment-config`     | `stores/:storeId/payment-methods`                                                     | `PaymentMethodConfig`                                          | [product.md §5.4](product.md#54-payment-configuration-seller-panel)                                                        |
| `pickup-points`      | `stores/:storeId/pickup-points`                                                       | `PickupPoint`                                                  | [product.md §5.5](product.md#55-delivery-methods-seller-panel)                                                             |
| `products`           | `stores/:storeId/products`, `products`                                                | `Product`, `ProductVariant`                                    | [product.md §5.2](product.md#52-product-management--crud-seller-panel)                                                     |
| `restock`            | `stores/:slug/restock-requests`, `stores/:storeId/restock-requests`                   | `RestockRequest`                                               | Buyer leaves name and phone on a sold-out item; seller reads the list                                                      |
| `stats`              | `stores/:storeId/stats`, `stores/:storeId/suggestions`                                | none (reads orders, products)                                  | Dashboard overview, analytics, suggestions                                                                                 |
| `store-sections`     | `stores/:storeId/sections`                                                            | `StoreSection`                                                 | [product.md §5.2.1](product.md#521-seller-content-conventions-seo--accessibility)                                          |
| `stores`             | `stores`, `me/stores`                                                                 | `Store`                                                        | [product.md §5.10](product.md#510-discovery-layer-public-cross-store)                                                      |
| `users`              | `admin/users`                                                                         | `User`                                                         | [admin.md](admin.md)                                                                                                       |
| `whatsapp-templates` | `stores/:storeId/whatsapp-templates`                                                  | `WhatsAppMessageTemplate`                                      | Per-store override of the WhatsApp message text, per message type                                                          |

---

## 2. Orders — DDD-lite (implemented)

✅ **Implemented for `orders` only.** The order/payment state machine has enough
business rules (three-way status transitions, tenant checks, payment
recording/review) that this module is layered
`domain/application/infrastructure` instead of flat `controller/service/dto`.
Every other module (`products`, `stores`, `payment-config`, ...) stays flat CRUD
— don't apply this layering anywhere else; that's overengineering for CRUD
modules.

Abbreviated layout (see the folders for the full list; assisted orders, public
tokens and buyer proofs are covered in
[assisted-orders.md](assisted-orders.md)):

```text
modules/
  orders/
    domain/
      order.entity.ts         # invariants: status transitions, VERIFIED gate on fulfillment
      order-status.vo.ts      # PaymentStatus/FulfillmentStatus transition tables
    application/
      create-order.usecase.ts          # public checkout → PENDING_PAYMENT + WhatsApp handoff
      create-assisted-order.usecase.ts # seller-created order with a private buyer link
      review-payment.usecase.ts        # seller approve/reject: stock, AuditLog, buyer email
      void-order-payment.usecase.ts    # annul a payment, recompute status
      buyer-payment-proof.service.ts   # buyer proof upload rules, shared by both routes
      advance-fulfillment.usecase.ts
      cancel-order.usecase.ts
      expire-orders.usecase.ts         # workers' BullMQ scheduler calls the internal sweep
      order-events.service.ts          # OrderEvent timeline
      customer-account.service.ts      # buyer phone/email account
    infrastructure/
      order.repository.ts     # Prisma-backed + assertOwnership/findRowByIdForStore
      order.controller.ts / assisted-orders.controller.ts
      checkout.controller.ts / public-order-events.controller.ts
      public-order-token.guard.ts
      customers.controller.ts / customer-account.controller.ts
    dto/
```

Example — `order.entity.ts` (payment and fulfillment are tracked separately,
transitions enforced via the VO tables — see §4; abridged):

```ts
export class Order {
  constructor(
    public readonly id: string,
    public readonly storeId: string,
    private paymentStatus: PaymentStatus,
    private fulfillmentStatus: FulfillmentStatus,
  ) {}

  approvePayment(): void {
    assertPaymentTransition(this.paymentStatus, "VERIFIED");
    this.paymentStatus = "VERIFIED";
  }

  advanceFulfillment(next: FulfillmentStatus): void {
    if (this.paymentStatus !== "VERIFIED") {
      throw new BadRequestException(
        "Order must be VERIFIED before fulfillment can advance",
      );
    }
    assertFulfillmentTransition(this.fulfillmentStatus, next);
    this.fulfillmentStatus = next;
  }
}
```

Use cases orchestrate and controllers stay thin. A use case such as
`ReviewPaymentUseCase` calls `orders.assertOwnership(storeId, userId)` first,
loads the row with `findRowByIdForStore`, builds the entity, applies the
transition, and persists it in one transaction (guarded update, stock
decrement/release, `AuditLog`, buyer email).

Why: status transitions are exactly where "admin approves an already-fulfilled
order" bugs live. Putting the rule in one entity method (backed by unit tests)
instead of scattered `if` checks across controllers is the payoff — see
[security-payments.md §9](security-payments.md#9-payment-flow-design-manual) for
the flow these rules guard.

---

## 3. Multi-Tenant Design (CRITICAL)

**Rule**: every query that touches tenant data filters by `storeId`. No
exceptions, no "trusted" internal calls that skip it.

### Tenant resolution (what's actually running)

There is **no** global `TenantMiddleware`/`AsyncLocalStorage` layer — the
middleware design below was considered and rejected for now. Tenancy is enforced
per service method, in the flat `controller/service` modules:

- Every query filters by `storeId` as a first-class part of the Prisma `where`.
- Every mutation and every by-id read re-verifies ownership **after** fetching:
  `assertOwnership(storeId, userId)` checks the caller is the `Store.ownerId`,
  then `findOwned*`/`findRowByIdForStore`-style helpers scope the actual
  read/write back to `storeId` (e.g.
  `apps/api/src/modules/orders/infrastructure/order.controller.ts` +
  `order.repository.ts`). A copy-pasted query that forgets the filter fails the
  ownership check instead of silently leaking rows.
- This pattern was audited on 2026-08-08 across the 13 tenant-scoped modules
  that existed then (`products`, `categories`, `collections`, `store-sections`,
  `payment-config`, `delivery-config`, `pickup-points`, `notifications`,
  `stats`, `orders`, `customers`, `stores`, `customer-auth`) with zero IDOR gaps
  found — `.artifacts/audits/audit-2026-08-08.md` §5, §13. Later modules and
  routes (assisted orders, public order tokens, buyer proofs, couriers, coupons)
  were not part of that audit.

Tradeoff vs. a middleware layer: tenant safety is enforced by convention (every
new service method must call the helper) rather than by a structural guarantee
that's impossible to bypass — an acceptable tradeoff at current team size (audit
§5), worth revisiting if the team grows or a method ever ships without the
helper.

### Considered and rejected for now: TenantMiddleware + AsyncLocalStorage

The original design (never built — no `TenantMiddleware` class or
`tenantContext`/`AsyncLocalStorage` usage exists anywhere in `apps/api/src`)
resolved the tenant in middleware and exposed it app-wide via an
`AsyncLocalStorage`-based `RequestContext`:

```
Request → TenantMiddleware → resolves store_id from:
  1. /store/:slug path param            [MVP — single domain, no subdomains]
  2. JWT claim (for dashboard/admin requests, store_id bound to session)
→ attaches to AsyncLocalStorage-based RequestContext
```

Not built because the per-service ownership checks above already cover the same
ground, and a context object that "reads `storeId` for you" is only as safe as
the code that consults it. The **Postgres Row-Level Security** backstop that
design floated
(`CREATE POLICY ... USING (store_id = current_setting('app.store_id'))`) is
likewise deferred: the audited app-layer checks already have zero found gaps, so
this is a "someday, not urgent" hardening step (audit §17), not a current need.

### Slug strategy

- MVP scope is **`/store/:slug` only, single domain** — no subdomains, no
  wildcard DNS, no wildcard TLS cert. Keep it out of scope until there's an
  actual reason to route by subdomain.
- A slug blocklist (`RESERVED_SLUGS` in `modules/stores/stores.service.ts`)
  rejects `www`, `api`, `admin`, `app` at store-creation time — cheap now,
  avoids a painful backfill if subdomain routing gets added later.

---

## 4. Database Improvements

The schema is `packages/db/prisma/schema.prisma`; the order status split shipped
in migration `20260720175558_add_order_flow_tables`. The `Order` snippet below
is abridged (it omits identity, access-token, tracking and cancellation columns
— read the schema for the full model). `Order` carries **three independent state
machines** that don't move in lockstep (an order can be `VERIFIED` and still
`ORDERING` for days):

```prisma
model Order {
  id                String             @id @default(cuid())
  storeId           String
  source            OrderSource        @default(MARKETPLACE) // checkout vs assisted
  paymentStatus     PaymentStatus      @default(PENDING_PAYMENT)
  fulfillmentStatus FulfillmentStatus  @default(ORDERING)
  status            OrderStatus        @default(ACTIVE)   // cancellation axis
  totalAmount       Decimal            @db.Decimal(10, 2)
  requiredAmount    Decimal            @db.Decimal(10, 2)
  expiresAt         DateTime

  payments OrderPayment[]   // seller-recorded and buyer-submitted payment rows
}

enum PaymentStatus {
  PENDING_PAYMENT
  PARTIALLY_PAID
  PAYMENT_SUBMITTED
  VERIFIED
  REJECTED
  CANCELLED
}

enum FulfillmentStatus {
  ORDERING
  IN_TRANSIT
  READY
  COMPLETED
}

enum OrderStatus {
  ACTIVE
  CANCELLED
}
```

- `paymentStatus` is the money axis — `PENDING_PAYMENT → VERIFIED/REJECTED`
  (with `PARTIALLY_PAID` in between), enforced by the transition tables in
  `order-status.vo.ts` and the entity in `order.entity.ts`. Buyer-submitted
  proofs are `OrderPayment` rows (`source: BUYER_SUBMITTED`,
  `reviewStatus: PENDING_REVIEW`) that the seller approves, rejects or voids;
  which action sets which status, including the one path into
  `PAYMENT_SUBMITTED`, is in
  [security-payments.md §9](security-payments.md#9-payment-flow-design-manual).
- `fulfillmentStatus` is the delivery axis — strictly linear
  `ORDERING → IN_TRANSIT → READY → COMPLETED`, hard-gated on
  `paymentStatus === VERIFIED` (`order.entity.ts`).
- `status` (`OrderStatus`) is the cancellation axis — `ACTIVE → CANCELLED`
  (expired soft-hold sweep or seller-cancelled), carrying the cancellation
  bookkeeping (`cancellationResolution`, `retainedAmount`, `releasedAmount`,
  `releasedResolution`) alongside.

Other properties of the current schema:

- **Money is `Decimal`, never `Float`** — `Order.totalAmount`/`requiredAmount`
  and `Product.price` are all `Decimal @db.Decimal(10, 2)`; floats for money are
  a real bug class (two precision bugs were caught and fixed in
  `apps/api/src/common/payment-summary.ts`).
- **Product indexes**: `@@index([storeId])` and `@@index([storeId, status])` —
  every storefront product listing filters by them.
- **`PaymentProof` was removed** (migration
  `20260808192135_delete_payment_proof`); proofs are `OrderPayment.imageUrl`
  rows, see the bullet above.
- **`AuditLog`** (`actorId`, `storeId`, `action`, `entityType`, `entityId`,
  `metadata Json`, `createdAt`) — written from the order and buyer-identity use
  cases (`grep auditLog.create apps/api/src` lists the call sites; action
  strings are `payment.*`, `order.*`, `fulfillment.advanced`, and identity
  erasure). It is not written on product mutations. The assisted-order actions
  are listed in [assisted-orders.md](assisted-orders.md). This is the thing that
  saves you when a seller disputes "I never rejected that order."

### Model index

| Area                | Models                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Identity            | `User`, `Session`, `Account`, `Verification` (better-auth); `BuyerAccount`, `Customer`, `CustomerStoreLink`, `Address`                   |
| Store and catalog   | `Store`, `Category`, `ProductCategory`, `Collection`, `CollectionProduct`, `StoreSection`, `Product`, `ProductVariant`, `RestockRequest` |
| Orders              | `Order`, `OrderItem`, `OrderPayment`, `OrderEvent`                                                                                       |
| Store configuration | `PaymentMethodConfig`, `DeliveryMethodConfig`, `PickupPoint`, `Courier`, `CourierConfig`, `WhatsAppMessageTemplate`                      |
| Platform            | `Coupon`, `CouponRedemption`, `ContactInquiry`, `Notification`, `AuditLog`, `PlatformIncident`                                           |

---

## 5. Theming

What exists is palette-only:

- `Store.themeConfig` (JSON on `Store`) holds a palette id and optional color
  overrides (`StoreThemeConfig` in `packages/design-tokens/src/palette.ts`).
- `packages/design-tokens` defines the built-in palettes (`STORE_PALETTES`),
  derives a custom palette from one primary color, and
  `resolveStorePalette(themeConfig)` validates the raw JSON and falls back to
  the default palette. Mobile reads the same package through its Tailwind
  config.
- `apps/web/lib/store-theme.ts` adapts the resolved palette to CSS custom
  properties (`--store-primary`, `--store-accent`, ...). Never feed raw
  `themeConfig` into `style={{ ... }}`: it is a JSON blob from a row a seller
  can edit, so it goes through the resolver first.

Planned, not built: a richer token structure (typography scale, spacing, radius,
layout presets), per-store component variants selected by name from a set
shipped in `apps/web` (never injected code), and a theme marketplace where
installing a theme copies a preset into `Store.themeConfig`.

---

## 6. Next.js Architecture

```
apps/web/app/[locale]/
  (marketing)/               # landing, blog, contact, FAQ, stores, my-purchases
  (storefront)/
    store/[slug]/            # home, product/[productId], cart, checkout,
                             # account, pedido/[token]
  (dashboard)/
    dashboard/[slug]/        # analytics, collections, customers, notifications,
                             # orders, payments, preferences, products, restock,
                             # sections, settings, shipping
    admin/                   # platform admin, see admin.md
    account/
    layout.tsx               # auth-gated
  (onboarding)/              # auth, login, onboarding, verify-email
  search/
```

- Route groups separate storefront (public, SEO-sensitive, theme-rendered) from
  dashboard (auth-gated, no theming) — different layouts, different caching
  rules, same app.
- **Data fetching**: storefront pages are SSR (Server Components fetching from
  `api` at request time) — product listings and store theme need to be fresh and
  crawlable. Dashboard pages lean client-side (React Query) — admin data changes
  fast, SEO doesn't matter, optimistic updates matter more.
- **Server actions**: fine for simple dashboard mutations (update store
  settings) as a thin wrapper that calls the `api`. Do NOT use them as a
  replacement for the NestJS API — see Security section, they're still public
  endpoints and duplicating auth/validation logic in two places is how one of
  them ends up weaker.
- **Locale**: URLs carry a locale segment (`routing.ts` configures `es`/`en`
  with next-intl's default prefix behavior; `proxy.ts` is plain
  `createMiddleware(routing)`). Storefront content renders in `Store.locale`,
  dashboard/onboarding in `User.locale`. Full strategy in [i18n.md](i18n.md).

---

## 7. Security & Validation

Details live in [security-payments.md](security-payments.md) (§7.1 passwords,
§7.2 validation, §7.3 uploads, §7.4 abuse prevention, §7.5 identity). Summary:

- **Passwords**: hashed with better-auth's `hashPassword` (salted). Seller
  credentials are better-auth `Account` rows; buyer credentials are
  `BuyerAccount.passwordHash`. Never store or log a raw password.
- **DTO validation**: `class-validator` on every controller input,
  `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` globally —
  strips/rejects unexpected fields instead of silently trusting them.
- **File upload validation** (proof-of-payment, product and logo images): size
  limits, a MIME allowlist (JPEG/PNG for proofs), and a server-side check of the
  file signature, not just the `Content-Type` header. Files are stored in MinIO
  (`apps/api/src/storage/storage.service.ts`). Image re-encoding and EXIF
  stripping are not implemented.
- **Rate limiting**: `@nestjs/throttler`, per IP on public and buyer routes and
  per user on seller routes; controls and files are listed in
  security-payments.md §7.4.
- **Server actions = public endpoints**: same DTO validation, same auth guard,
  same rate limit as REST controllers. Treating them as "internal" because
  they're called from your own frontend is the mistake — they're reachable by
  anyone who can craft the request.
- **Tenant checks are a security control, not just a data filter** — every
  mutation must verify the authenticated user owns/administers the `store_id`
  being acted on, in addition to the tenant-scoped query itself.

---

## 8. Docker / Deployment

Production runs on one Contabo Cloud VPS (x86_64) using the immutable blue/green
stack in `infra/vps/docker-compose.yml`. CI builds `api`, `web`, and `workers`
images for the exact commit SHA and pushes them to GHCR. The VPS pulls those
images; production never builds from a source checkout.

The stack has shared `db`, `redis`, `minio`, `uptime-kuma`, and `caddy`
services, plus blue/green pairs for `api`, `web`, and `workers`. Caddy
terminates TLS for `biasmarket.com`, `api.biasmarket.com`, `cdn.biasmarket.com`,
and `status.biasmarket.com`. `deploy.sh` runs migrations once against the
candidate, waits for Docker health, smoke-tests it, canary-switches Caddy, and
keeps the previous color for rollback.

See [deploy.md](deploy.md) for the operator runbook and
[blue-green-migrations.md](blue-green-migrations.md) for migration discipline
and recovery.

---

## 9. Performance & Scaling

- **Cache store config** (theme + payment instructions) — planned, not built.
  The data is read on every storefront page load and changes rarely; an
  in-memory cache per API instance would do at MVP scale, moving to Redis once
  more than one API instance runs.
- **Redis**: built and used by BullMQ (queues below). Planned on top of that:
  session/JWT blocklist for logout-everywhere, shared rate-limit counters across
  instances, and the store-config cache above.
- **Queues**: `apps/workers` (NestJS + BullMQ, Redis-backed) consumes the queues
  named in `packages/queue/src/queue-names.ts`; job names, payload schemas and
  cron constants live in `packages/queue/src/jobs/`, the processors in
  `apps/workers/src/jobs/`.

  | Queue     | What the job does                                                                                                                                        |
  | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `mailer`  | Sends one email per job (see Email delivery)                                                                                                             |
  | `orders`  | Two scheduled ticks: sweep expired `PENDING_PAYMENT` orders, and the assisted-order identity retention sweep. Each calls an internal `apps/api` endpoint |
  | `premium` | Scheduled tick that resets expired premium plans (see [product.md §5.11](product.md#511-plans-and-premium-coupons)) via an internal `apps/api` endpoint  |
  | `ping`    | Placeholder job that proves the queue pipeline works                                                                                                     |

  Pattern for scheduled work: `apps/workers` owns the schedule (BullMQ job
  schedulers, idempotent by scheduler id) and `apps/api` executes via an
  internal HTTP call, so domain logic stays in `apps/api`; `apps/workers`
  deliberately has no database access. The internal endpoints are reachable only
  over the Docker network, behind a Caddy block and a shared-secret guard
  (`InternalJobsSecretGuard`).

- **Email delivery**: `apps/api` builds the HTML at each call site and enqueues
  it through `MailerService.send()` (`apps/api/src/mailer`), so no send blocks
  an API request. `apps/workers` performs it in `MailerCore`
  (`apps/workers/src/jobs/mailer/mailer.core.ts`). `MAIL_DRIVER` selects the
  transport: `resend` sends through Resend (needs `RESEND_API_KEY` and
  `RESEND_FROM_EMAIL`); `file`, the default, writes each message as an HTML file
  under `apps/workers/.mailer-dev/` so local dev needs no credentials. Mailer
  jobs are removed on completion because the HTML can carry a live account
  action token.
- **Scaling path**: single VPS (see §8) → split DB to managed Postgres
  (Neon/Supabase/RDS) first, since it's the hardest thing to scale horizontally
  yourself → then run multiple `api` containers behind Caddy/a load balancer
  once traffic justifies it. Object storage is already MinIO behind its own
  `cdn.` hostname, so it can move to a managed S3-compatible service
  independently.

---

## 10. Risks & Tradeoffs

- **Fake payment screenshots**: manual review is inherently gameable. Mitigate
  with admin tooling (zoom/annotate proof image), audit log on every decision,
  and a "reviewed_by" requirement so accountability is traceable per admin — not
  a technical fix, an accountability one.
- **Charge disputes**: no payment processor means no chargeback protection or
  transaction record beyond what you store — buyer/seller proof images on
  `OrderPayment` plus `AuditLog` are your evidence trail, so treat them as
  append-only records (don't allow deletion, only review/status changes).
- **Scaling multi-tenant themes**: JSON-blob theming is cheap now; a
  plugin/component-override marketplace (§5) is where complexity will actually
  show up — defer it, ship token-based theming first.
- **DDD-lite scope creep**: the layered structure in §2 is worth it for
  `orders`/`payments` only. Applying it to `users`/`uploads`/`themes` is the
  overengineering trap this spec explicitly warns against — resist it.

---

## Related

- [product.md](product.md): what the modules above are for.
- [security-payments.md](security-payments.md): validation, identity, payment
  flow.
- [assisted-orders.md](assisted-orders.md): seller-created orders and private
  links.
- [deploy.md](deploy.md), [operations.md](operations.md): running the stack.
- [i18n.md](i18n.md), [ci.md](ci.md), [admin.md](admin.md).
