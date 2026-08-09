# Architecture

Production-grade architecture for Bias Market: monorepo, multi-tenant backend,
database, theming, Next.js frontend, security, deployment, scaling.

---

## 1. Monorepo Design

```
biasmarket/
  apps/
    api/                  # NestJS backend
    web/                  # Next.js frontend (storefront + dashboard + onboarding)
  packages/
    db/                   # Prisma schema + client, migrations
    types/                # Shared DTOs/interfaces (Order, Product, Store, Theme...)
    ui/                   # Shared React components (design system, theme-aware)
    i18n/                 # ES/EN translation dictionaries, shared by api + web
    utils/                # Shared pure functions (slugify, currency format, date utils)
  docker-compose.yml
  turbo.json / pnpm-workspace.yaml
```

**Hard boundary**: `web` never imports `packages/db` or talks to Postgres
directly. All data access goes through `api` over HTTP. This is the #1 rule that
keeps multi-tenant isolation enforceable in one place instead of two.

- `packages/types` is the contract between `api` and `web` — hand-written or
  generated from Prisma/OpenAPI, never duplicated.
- `packages/ui` holds theme-aware components only; no business logic, no
  fetching.
- Bad pattern to avoid: importing `@prisma/client` into `web` "just for types" —
  it drags the DB boundary into the frontend bundle and tempts direct queries
  later.

---

## 2. Orders — DDD-lite (implemented)

✅ **Implemented for `orders` only.** The order/payment state machine has enough
business rules (three-way status transitions, tenant checks, payment
recording/review) that this module is layered
`domain/application/infrastructure` instead of flat `controller/service/dto`.
Every other module (`products`, `stores`, `payment-config`, ...) stays flat CRUD
— don't apply this layering anywhere else; that's overengineering for CRUD
modules.

```text
modules/
  orders/
    domain/
      order.entity.ts         # invariants: status transitions, VERIFIED gate on fulfillment
      order-status.vo.ts      # PaymentStatus/FulfillmentStatus transition tables
      order.entity.spec.ts / order-status.vo.spec.ts
    application/
      create-order.usecase.ts     # public checkout → PENDING_PAYMENT + WhatsApp handoff
      review-payment.usecase.ts   # seller approve/reject: stock, AuditLog, buyer email
      advance-fulfillment.usecase.ts
      cancel-order.usecase.ts
      expire-orders.usecase.ts    # swept by orders-cron.service.ts (@Cron "*/5 * * * *")
      customer-account.service.ts # buyer phone/email account
    infrastructure/
      order.repository.ts     # Prisma-backed + assertOwnership/findRowByIdForStore
      order.controller.ts
      checkout.controller.ts
      customers.controller.ts / customer-account.controller.ts
    dto/
      create-order.dto.ts / review-payment.dto.ts / ...
```

Example — `order.entity.ts` (real shape: payment and fulfillment are tracked
separately, transitions enforced via the VO tables — see §4):

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
        "Order must be VERIFIED before fulfillment",
      );
    }
    assertFulfillmentTransition(this.fulfillmentStatus, next);
    this.fulfillmentStatus = next;
  }
}
```

Use-case orchestrates, controller stays thin; ownership is asserted before the
transition runs:

```ts
@Injectable()
export class ReviewPaymentUseCase {
  constructor(private readonly orders: OrderRepository) {}

  async execute(orderId, storeId, userId, decision, reason?) {
    await this.orders.assertOwnership(storeId, userId); // tenant check
    const row = await this.orders.findRowByIdForStore(orderId, storeId);
    const entity = new Order(
      row.id,
      row.storeId,
      row.paymentStatus,
      row.fulfillmentStatus,
    );
    decision === "approve" ? entity.approvePayment() : entity.rejectPayment();
    // transaction: guarded updateMany, stock decrement/release, AuditLog, buyer email
  }
}
```

Why: status transitions are exactly where "admin approves an already-fulfilled
order" bugs live. Putting the rule in one entity method (backed by unit tests)
instead of scattered `if` checks across controllers is the payoff — see
[security-payments.md §9](security-payments.md#9-payment-flow-design-manual) for
the flow these rules guard.

---

## 3. Multi-Tenant Design (CRITICAL)

**Rule**: every query that touches tenant data filters by `store_id`. No
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
- This pattern was audited across all 13 tenant-scoped modules (`products`,
  `categories`, `collections`, `store-sections`, `payment-config`,
  `delivery-config`, `pickup-points`, `notifications`, `stats`, `orders`,
  `customers`, `stores`, `customer-auth`) with **zero IDOR gaps** —
  `docs/audits/audit-2026-08-08.md` §5, §13.

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
- Reserve a slug blocklist (`www`, `api`, `admin`, `app`) at store-creation time
  regardless — cheap now, avoids a painful backfill if subdomain routing gets
  added later.

---

## 4. Database Improvements

✅ **Implemented** — the order status split below shipped in migration
`20260720175558_add_order_flow_tables` and is the current schema
(`packages/db/prisma/schema.prisma`), not a proposal. `Order` carries **three
independent state machines** that don't move in lockstep (an order can be
`VERIFIED` and still `ORDERING` for days):

```prisma
model Order {
  id                String             @id @default(cuid())
  storeId           String
  paymentStatus     PaymentStatus      @default(PENDING_PAYMENT)
  fulfillmentStatus FulfillmentStatus  @default(ORDERING)
  status            OrderStatus        @default(ACTIVE)   // cancellation axis
  paymentRejectionReason String?
  cancellationResolution CancellationResolution?
  retainedAmount    Decimal?           @db.Decimal(10, 2)
  releasedAmount    Decimal?           @db.Decimal(10, 2)
  totalAmount       Decimal            @db.Decimal(10, 2)
  requiredAmount    Decimal            @db.Decimal(10, 2)
  expiresAt         DateTime

  payments OrderPayment[]   // the real seller-recorded payment records
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
  (with `PARTIALLY_PAID` in between; `PAYMENT_SUBMITTED` is a legal state in the
  model but no code path sets it), enforced by the transition tables in
  `order-status.vo.ts` and the entity in `order.entity.ts`, driven by the seller
  recording payments and approving/rejecting from `PENDING_PAYMENT` or
  `PARTIALLY_PAID` — see
  [security-payments.md §9](security-payments.md#9-payment-flow-design-manual).
- `fulfillmentStatus` is the delivery axis — strictly linear
  `ORDERING → IN_TRANSIT → READY → COMPLETED`, hard-gated on
  `paymentStatus === VERIFIED` (`order.entity.ts`).
- `status` (`OrderStatus`) is the cancellation axis — `ACTIVE → CANCELLED`
  (expired soft-hold sweep or seller-cancelled), carrying the cancellation
  bookkeeping (`cancellationResolution`, `retainedAmount`, `releasedAmount`,
  `releasedResolution`) alongside.

Other fixes that are in the current schema:

- **Money is `Decimal`, never `Float`** — `Order.totalAmount`/`requiredAmount`
  and `Product.price` are all `Decimal @db.Decimal(10, 2)`; floats for money are
  a real bug class (two precision bugs were caught and fixed in
  `apps/api/src/common/payment-summary.ts`).
- **Product indexes**: `@@index([storeId])` and `@@index([storeId, status])` —
  every storefront product listing filters by them.
- **`PaymentProof` was removed** — the buyer-upload model and its `ProofStatus`
  enum (`PENDING_REVIEW | APPROVED | REJECTED`) existed schema-only (never
  created anywhere in `apps/api/src`) and were deleted in migration
  `20260808192135_delete_payment_proof`; the live flow is seller-recorded
  `OrderPayment` + WhatsApp handoff, see
  [security-payments.md §9](security-payments.md#9-payment-flow-design-manual).
- **`AuditLog`** (`actorId`, `storeId`, `action`, `entityType`, `entityId`,
  `metadata Json`, `createdAt`) — written on the payment decisions that matter:
  approve/reject (`review-payment.usecase.ts`), partial payments
  (`order.controller.ts`), cancellations (`cancel-order.usecase.ts`), and
  fulfillment advances (`advance-fulfillment.usecase.ts`). This is the thing
  that saves you when a seller disputes "I never rejected that order." (Not
  written on product mutations.)

---

## 5. Theming System Upgrade

Flat `{primaryColor, font, layout}` doesn't scale past 2 themes. Move to a token
structure:

```json
{
  "colors": {
    "primary": "#FF4D6D",
    "secondary": "#1A1A2E",
    "background": "#FFFFFF",
    "text": "#111111"
  },
  "typography": {
    "fontFamily": "Inter",
    "headingScale": 1.25
  },
  "spacing": { "unit": 4 },
  "radius": { "sm": 4, "md": 8, "lg": 16 },
  "layout": "minimal"
}
```

- **Theme resolver layer** (in `packages/ui` or a `theme/` module in `web`):
  takes the raw JSON, validates against a Zod schema, fills defaults for missing
  tokens, outputs CSS custom properties (`--color-primary`, `--radius-md`, ...).
  Never let raw untrusted JSON hit
  `style={{ background: theme.colors.primary }}` without validation — it's a
  JSON blob coming from a DB row a seller can edit via the dashboard.
- Component overrides (v1+): let a store optionally override specific components
  (`ProductCard`, `Header`) by referencing a named variant already shipped in
  `packages/ui`, not by injecting arbitrary code — keeps the marketplace safe
  without a plugin sandbox.
- Theme marketplace (v1+): themes become named token presets stored server-side;
  "installing" a theme = copying a preset's JSON into `Store.themeConfig`, no
  new architecture needed.

---

## 6. Next.js Architecture

```
apps/web/app/
  (storefront)/
    store/[slug]/
      page.tsx              # store home
      products/[id]/page.tsx
      cart/page.tsx
      checkout/page.tsx
  (dashboard)/
    dashboard/[storeId]/
      orders/page.tsx
      products/page.tsx
      settings/page.tsx
    layout.tsx               # auth-gated
  (onboarding)/
    onboarding/page.tsx
```

- Route groups separate storefront (public, SEO-sensitive, theme-rendered) from
  dashboard (auth-gated, no theming) — different layouts, different caching
  rules, same app.
- **Data fetching**: storefront pages are SSR (Server Components fetching from
  `api` at request time) — product listings and store theme need to be fresh and
  crawlable. Dashboard pages can lean client-side (SWR/React Query) — admin data
  changes fast, SEO doesn't matter, optimistic updates matter more.
- **Server actions**: fine for simple dashboard mutations (update store
  settings) as a thin wrapper that calls the `api`. Do NOT use them as a
  replacement for the NestJS API — see Security section, they're still public
  endpoints and duplicating auth/validation logic in two places is how one of
  them ends up weaker.
- **Locale**: storefront renders in `Store.locale`, dashboard/onboarding render
  in `User.locale` — no URL locale prefix at MVP. Full strategy in
  [i18n.md](i18n.md).

---

## 7. Security & Validation

- **Passwords**: bcrypt, salt rounds ≥ 10, never store raw or use a fixed salt.
  `bcrypt.hash(password, 12)`.
- **DTO validation**: `class-validator` on every controller input,
  `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` globally —
  strips/rejects unexpected fields instead of silently trusting them.
- **File upload validation** (proof-of-payment): max 5MB, MIME allowlist
  (`image/jpeg`, `image/png`), verify actual file signature server-side (not
  just the `Content-Type` header — trivially spoofed), re-encode/strip EXIF
  before storing in R2.
- **Rate limiting**: `@nestjs/throttler`, IP-based, tighter limits on
  `/auth/login` and proof-upload endpoints specifically (abuse targets).
- **Server actions = public endpoints**: same DTO validation, same auth guard,
  same rate limit as REST controllers. Treating them as "internal" because
  they're called from your own frontend is the mistake — they're reachable by
  anyone who can craft the request.
- **Tenant checks are a security control, not just a data filter** — every
  mutation must verify the authenticated user owns/administers the `store_id`
  being acted on, in addition to the tenant-scoped query itself.

---

## 8. Docker / Deployment Improvements

**Target**: single Hetzner VPS, three app images (`web`, `api`, `db`) behind
Caddy. No subdomain routing at MVP (§3), so no wildcard cert needed — Caddy
still gets automatic HTTPS for the single domain via Let's Encrypt with zero
extra config, which is the main reason to pick it over nginx here (no certbot
sidecar, no manual renew cron).

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - api
      - web

  api:
    build: ./apps/api
    image: biasmarket/api
    env_file: .env
    expose:
      - "3000" # not published to host — only Caddy reaches it
    depends_on:
      - db

  web:
    build: ./apps/web
    image: biasmarket/web
    env_file: .env
    expose:
      - "3001"
    depends_on:
      - api

  db:
    image: postgres:18
    restart: always
    environment:
      POSTGRES_USER: biasmarket
      POSTGRES_PASSWORD: ${DB_PASSWORD} # never hardcode in compose file
      POSTGRES_DB: biasmarket
    expose:
      - "5432" # not published — only api reaches it
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
  caddy_data:
  caddy_config:
```

`infra/caddy/Caddyfile`:

```
biasmarket.example.com {
  handle /api/* {
    reverse_proxy api:3000
  }
  handle {
    reverse_proxy web:3001
  }
}
```

- `expose` not `ports` for `api`/`db`/`web` — reachable on the Docker network by
  Caddy but not bound to the host's public interface. Only Caddy publishes
  80/443.
- Caddy does TLS termination + auto-renewal (no certbot needed) and routes
  `/api/*` → `api`, everything else → `web`.
- `DB_PASSWORD` from `.env`, never committed, never hardcoded in the compose
  file — the original spec's `biasmarket`/`biasmarket` is a placeholder to
  replace before anything touches real data.
- R2 stays external (S3-compatible API, no container) — object storage isn't
  something you self-host on the VPS. **Not what's actually deployed today:**
  the MVP runs self-hosted MinIO instead (`docker-compose.yml`'s `minio`
  service), a deliberate shortcut — see
  [deploy.md](deploy.md#image-uploads-minio).

---

## 9. Performance & Scaling

- **Cache store config** (theme + payment instructions) — read on every
  storefront page load, changes rarely. In-memory LRU per API instance is enough
  at MVP scale; move to Redis when you run more than one API instance (needed
  for cache coherency across instances anyway).
- **Redis** (v1+): session/JWT blocklist for logout-everywhere, rate-limit
  counters shared across instances, store-config cache mentioned above.
- **Queues**: ✅ Implemented (infra only) — `apps/workers` (NestJS + BullMQ,
  Redis-backed), a shared `packages/queue` contracts package, and Redis wired
  into both dev and prod Docker stacks, see
  `docs/plans/2026-08-09-workers-infra-setup-plan.md`. Ships with one
  proof-of-pipeline "ping" job; no real job has moved off `apps/api` yet
  (payment-proof review notifications, image processing/resizing on upload,
  order confirmation emails, the order-expiration cron sweep — see the companion
  `2026-08-09-migrate-background-jobs-to-workers-plan.md`).
- **Email delivery**: Resend, via a thin `EmailService` in a `notifications`
  module — call sites send `{template, locale, data}`, never raw HTML, so every
  email stays routed through the localized templates in [i18n.md](i18n.md). MVP
  fires sends inline (signup confirmation, etc.); move to the queue above once
  send volume or retry-on-failure matters.
- **Scaling path**: single Hetzner VPS (api + web + db + Caddy via compose) →
  split DB to managed Postgres (Neon/Supabase/RDS) first, since it's the hardest
  thing to scale horizontally yourself → then split `api` into multiple
  containers behind Caddy/a load balancer once traffic justifies it → object
  storage (R2) is already externalized so it scales independently from day one.

---

## 10. Risks & Tradeoffs

- **Fake payment screenshots**: manual review is inherently gameable. Mitigate
  with admin tooling (zoom/annotate proof image), audit log on every decision,
  and a "reviewed_by" requirement so accountability is traceable per admin — not
  a technical fix, an accountability one.
- **Charge disputes**: no payment processor means no chargeback protection or
  transaction record beyond what you store — the `PaymentProof` + `AuditLog`
  pair _is_ your evidence trail, treat it as such (don't allow deletion, only
  status changes).
- **Scaling multi-tenant themes**: JSON-blob theming is cheap now; a
  plugin/component-override marketplace (§5) is where complexity will actually
  show up — defer it, ship token-based theming first.
- **DDD-lite scope creep**: the layered structure in §2 is worth it for
  `orders`/`payments` only. Applying it to `users`/`uploads`/`themes` is the
  overengineering trap this spec explicitly warns against — resist it.
