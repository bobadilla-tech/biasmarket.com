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

## 2. Backend Architecture Upgrade (DDD-lite)

Flat `controller/service/dto` per module is fine at MVP size but payments/orders
already have enough business rules (status transitions, tenant checks, proof
review) to warrant separating **what the domain allows** from **how NestJS wires
it up**. Apply DDD-lite only to `orders` and `payments` — leave `users`,
`uploads`, `themes` as simple CRUD modules. Don't apply this pattern everywhere;
that's overengineering for CRUD modules.

```
modules/
  orders/
    domain/
      order.entity.ts         # invariants: status transitions, total calc
      order-status.vo.ts      # enum + allowed-transition map
    application/
      create-order.usecase.ts
      submit-payment-proof.usecase.ts
      review-payment.usecase.ts   # admin approve/reject
    infrastructure/
      order.repository.ts     # Prisma-backed, implements domain interface
      order.controller.ts
    dto/
      create-order.dto.ts
```

Example — `order.entity.ts`:

```ts
export class Order {
  constructor(
    public readonly id: string,
    public readonly storeId: string,
    private status: OrderStatus,
  ) {}

  submitPayment(): void {
    if (this.status !== OrderStatus.PENDING_PAYMENT) {
      throw new InvalidOrderTransitionError(this.status, "PAYMENT_SUBMITTED");
    }
    this.status = OrderStatus.PAYMENT_SUBMITTED;
  }

  approvePayment(reviewerId: string): void {
    if (this.status !== OrderStatus.PAYMENT_SUBMITTED) {
      throw new InvalidOrderTransitionError(this.status, "VERIFIED");
    }
    this.status = OrderStatus.VERIFIED;
  }
}
```

Use-case orchestrates, controller stays thin:

```ts
@Injectable()
export class ReviewPaymentUseCase {
  constructor(private readonly orders: OrderRepository) {}

  async execute(
    orderId: string,
    storeId: string,
    decision: "approve" | "reject",
    reviewerId: string,
  ) {
    const order = await this.orders.findByIdForStore(orderId, storeId); // tenant check baked in
    if (!order) throw new NotFoundException();
    decision === "approve"
      ? order.approvePayment(reviewerId)
      : order.rejectPayment(reviewerId);
    await this.orders.save(order);
  }
}
```

Why: status transitions are exactly where "admin approves an already-fulfilled
order" bugs live. Putting the rule in one entity method instead of scattered
`if` checks across controllers is the payoff.

---

## 3. Multi-Tenant Design (CRITICAL)

**Rule**: every query that touches tenant data filters by `store_id`. No
exceptions, no "trusted" internal calls that skip it.

### Tenant resolution

```
Request → TenantMiddleware → resolves store_id from:
  1. /store/:slug path param            [MVP — single domain, no subdomains]
  2. JWT claim (for dashboard/admin requests, store_id bound to session)
→ attaches to AsyncLocalStorage-based RequestContext
```

```ts
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly stores: StoreRepository) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const slug = extractSlug(req); // /store/:slug path param
    const store = await this.stores.findBySlug(slug);
    if (!store) throw new NotFoundException("Store not found");
    tenantContext.run({ storeId: store.id }, () => next());
  }
}
```

- Repository layer reads `storeId` from `tenantContext`, not from a param the
  caller can forget to pass — this is what prevents a copy-pasted query from
  silently leaking cross-tenant rows.
- Admin dashboard requests: `store_id` comes from the JWT (issued after the user
  authenticates against a specific store), not the URL — prevents an admin token
  for store A being replayed with store B's slug.
- Postgres-level backstop: consider **Row-Level Security**
  (`CREATE POLICY ... USING (store_id = current_setting('app.store_id'))`) once
  the app layer is stable — defense in depth, not a replacement for the
  middleware.

### Slug strategy

- MVP scope is **`/store/:slug` only, single domain** — no subdomains, no
  wildcard DNS, no wildcard TLS cert. Keep it out of scope until there's an
  actual reason to route by subdomain.
- Reserve a slug blocklist (`www`, `api`, `admin`, `app`) at store-creation time
  regardless — cheap now, avoids a painful backfill if subdomain routing gets
  added later.

---

## 4. Database Improvements

Split the single `status` field on `Order` into three independent state machines
— order lifecycle, payment review, and fulfillment don't move in lockstep (an
order can be `VERIFIED` and still `UNFULFILLED` for days).

```prisma
model Store {
  id                  String   @id @default(cuid())
  name                String
  slug                String   @unique
  ownerId             String
  themeConfig         Json
  paymentInstructions String
  createdAt           DateTime @default(now())

  owner    User      @relation(fields: [ownerId], references: [id])
  products Product[]
  orders   Order[]

  @@index([ownerId])
}

model Order {
  id               String            @id @default(cuid())
  storeId          String
  customerEmail    String
  paymentStatus    PaymentStatus     @default(PENDING)
  fulfillmentStatus FulfillmentStatus @default(UNFULFILLED)
  totalAmount      Decimal           @db.Decimal(10, 2)
  createdAt        DateTime          @default(now())

  store Store       @relation(fields: [storeId], references: [id])
  items OrderItem[]
  proof PaymentProof?

  @@index([storeId, paymentStatus])   // admin "pending review" queue
  @@index([storeId, createdAt])       // order list, paginated
}

enum PaymentStatus {
  PENDING
  SUBMITTED
  VERIFIED
  REJECTED
}

enum FulfillmentStatus {
  UNFULFILLED
  SHIPPED
  DELIVERED
}
```

Other fixes vs. the original schema:

- `totalAmount` as `Decimal`, never `Float` — money math on floats is a real bug
  class, not theoretical.
- `Product.price` → same `Decimal` fix.
- Add `Product.storeId` composite index `@@index([storeId])` — every storefront
  product listing filters by it.
- `PaymentProof.status` → its own small enum
  (`PENDING_REVIEW | APPROVED | REJECTED`), not a free string.
- **Audit log**: add an `AuditLog` model (`actorId`, `storeId`, `action`,
  `entityType`, `entityId`, `metadata Json`, `createdAt`) written on every
  payment approve/reject and product mutation. This is the thing that saves you
  when a seller disputes "I never rejected that order" — cheap to add now,
  expensive to reconstruct later.

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
- **Queues** (v1+): payment-proof review notifications, image
  processing/resizing on upload, eventually order confirmation emails — anything
  that doesn't need to block the HTTP response. BullMQ (Redis-backed) is the
  natural fit given NestJS + Redis already in the stack.
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
