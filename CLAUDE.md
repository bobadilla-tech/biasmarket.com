# Bias Market

Niche-first store builder for creator-led commerce (K-pop/artist merch stores
first). Manual payment-first (bank transfer, Wise, PayPal) with built-in
proof-of-payment review, no Stripe required.

Turborepo monorepo: `apps/api` (NestJS), `apps/web` (Next.js), `packages/*`
(shared db/types/ui/i18n/utils). pnpm workspaces.

## Hard rules

- **pnpm only.** Never `npm`/`yarn`. `packageManager` is pinned in root
  `package.json`, don't touch that pin without being asked.
- **Latest TypeScript, ESM only** across the repo (`"type": "module"` in every
  package). No CommonJS, no `require`. Relative imports in `apps/api` use
  explicit `.js` extensions (NodeNext resolution) even though the source is
  `.ts` — follow this pattern for new files there.
- **web never imports `packages/db` or talks to Postgres directly.** All data
  access from the frontend goes through `api` over HTTP. This is the #1 rule
  keeping multi-tenant isolation enforceable in one place. Don't import
  `@prisma/client` into `web` "just for types."
- **Every query touching tenant data filters by `storeId`.** No exceptions.
  Ownership is checked via `assertOwnership`/`findOwnedProduct`-style helpers in
  the service layer (see `apps/api/src/modules/products/products.service.ts`),
  mutations must verify the authenticated user owns the store, not just that the
  tenant-scoped query ran.

## Commands

Run from repo root; Turbo filters by package.

```bash
pnpm install                              # workspace install
pnpm dev                                  # all apps, parallel (api :3000, web :3001)
pnpm build                                # turbo run build (respects dependency graph)
pnpm lint                                 # turbo run lint
pnpm fix                                  # format changed files, then run lint
pnpm typecheck                            # turbo run typecheck
pnpm test                                 # turbo run test, all packages
pnpm db:generate                          # prisma generate (packages/db)

pnpm turbo run <task> --filter=api        # scope to one app, e.g. lint/build/test
pnpm turbo run <task> --filter=web
pnpm turbo run <task> --filter=@biasmarket/db

pnpm --filter api generate:openapi        # emit apps/api/openapi.json from live route/DTO metadata
pnpm --filter @biasmarket/types generate  # regen packages/types/generated/** from openapi.json (Orval)
```

`packages/types` holds an [Orval](https://orval.dev)-generated SDK client,
grouped one namespace per migrated controller tag (`collections`, ...) —
`apps/web` uses it via `apiClient.collections.findAll(storeId)`-style calls
instead of hand-written fetch wrappers for migrated features (see
`apps/web/AGENTS.md`'s OpenAPI note for the full shape, including why a plain
generated `openapi-fetch` client was tried first and replaced). Both
`apps/api/openapi.json` and `packages/types/generated/**` are **committed**, not
build-generated — deliberately, to keep `web`'s build/typecheck independent of
`apps/api` (no turbo cross-package dependency, no live app boot needed in CI).
Regenerate both by hand after changing a migrated module's response DTOs:
`pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`,
then commit the diff.

Inside `apps/api`:

```bash
pnpm --filter api test                    # vitest run (unit, src/**/*.spec.ts)
pnpm --filter api test:watch
pnpm --filter api test:e2e                # vitest run -c vitest.config.e2e.ts (**/*.e2e-spec.ts, real AppModule)
pnpm --filter api dev                     # nest start --watch
```

To run a single test file,
`cd apps/api && pnpm exec vitest run path/to/file.spec.ts` (or without `run` to
watch). Unit tests stub `@biasmarket/db` (see `vitest.config.ts` alias) with a
fake `PrismaService` via `useValue` — they never hit a real database. Only the
e2e config boots the real `AppModule`.

Inside `apps/web`:

```bash
pnpm --filter web dev                     # next dev -p 3001
pnpm --filter web test                    # vitest run, jsdom env
```

Docker (from repo root):

```bash
pnpm docker:dev                           # infra/docker/docker-compose.dev.yml
```

Production is deployed only by the blue/green CI/CD flow described in
`docs/core/deploy.md`; use `infra/vps/deploy.sh` for a supervised manual
deployment or recovery.

CI (`.github/workflows/ci.yml`) path-filters per package and runs
lint/typecheck/build/test independently for `api`, `web`, `db`, `i18n`, `types`,
`ui`, `utils` — only changed packages (and their dependents per the filter
rules) run.

## Architecture

### Monorepo boundary

```
apps/
  api/    NestJS backend — sole owner of the database
  web/    Next.js frontend (storefront + dashboard), calls api over HTTP only
packages/
  db/     Prisma schema + generated client (packages/db/generated/prisma)
  types/  Shared DTOs/interfaces between api and web
  ui/     Shared React components (theme-aware, no business logic, no fetching)
  i18n/   ES/EN translation dictionaries, shared by api + web
  utils/  Shared pure functions
```

`packages/db` re-exports the Prisma v7 generated client from
`generated/prisma/client.ts` via `index.ts`. The Prisma engine now uses
`@prisma/adapter-pg` (driver adapter), wired in `PrismaService`.

### API structure (apps/api/src)

Flat NestJS `controller/service/dto` per module for most of
`apps/api/src/modules/*` (`stores`, `products`, `categories`, `collections`,
`store-sections`, `payment-config`, `delivery-config`, `pickup-points`,
`notifications`, `contact`, `customer-auth`, `stats`, `users`, `health`).
`orders` is the one module using the DDD-lite layering
(`domain/application/infrastructure`) described in `docs/core/architecture.md` —
it owns the payment/fulfillment state machine, which warranted the extra
structure. Don't apply that layering to CRUD-style modules, and don't retrofit
it onto existing flat modules unless asked.

- `main.ts`: global
  `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, global
  prefix `api`, CORS locked to `WEB_URL`.
- Auth: `better-auth` via `@thallesp/nestjs-better-auth`, Prisma adapter,
  email+password, `role` field defaults to `seller`. Config in
  `src/auth/auth.config.ts`. This is seller/dashboard auth only — storefront
  buyers use a separate, throttled session-cookie flow in
  `modules/customer-auth` (`Customer` model, not `User`).
- No tenant-resolution middleware yet — the architecture doc's
  `TenantMiddleware`/`AsyncLocalStorage` design is aspirational; current code
  checks ownership per-request inside each service method instead.
- NestJS build is SWC-based (`nest-cli.json`: `builder: "swc"`,
  `typeCheck: false`) — `pnpm typecheck` runs `tsc --noEmit` separately from the
  build.

### Web structure (apps/web)

App Router, no `src/` — `app/`, `components/`, `lib/`, `hooks/`, `features/` sit
at `apps/web` root. New feature work (data fetching, forms, feature-local types)
lives under `features/<name>/{schemas,api,queries,mutations,components}`; `app/`
stays routing + page composition, `components/ui` is shadcn primitives,
`components/shared` holds cross-feature
`LoadingState`/`ErrorState`/`EmptyState`. Stack: `@tanstack/react-query` for
server state (provider wired in `app/[locale]/query-provider.tsx`), `zod` for
runtime validation at the `api/` boundary, `react-hook-form` +
`@hookform/resolvers/zod` for forms. All major dashboard pages (`products`,
`settings`, `orders`) are migrated to this structure — see `apps/web/AGENTS.md`
for the full convention, including the generated OpenAPI client used by migrated
features.

### Database (packages/db/prisma/schema.prisma)

Core models: `User`, `Store`, `Product`, `ProductVariant`, `Category`,
`Collection`, `StoreSection`, `Order`, `OrderItem`, `OrderPayment`,
`PaymentProof`, `PaymentMethodConfig`, `DeliveryMethodConfig`, `PickupPoint`,
`Customer`, `ContactInquiry`, `Notification`, `AuditLog`, plus better-auth's
`Session`/`Account`/`Verification`. Money fields are `Decimal`, never `Float`.

`Order` implements the state machine from `docs/core/security-payments.md` §9:
`paymentStatus`
(`PENDING_PAYMENT → PARTIALLY_PAID/PAYMENT_SUBMITTED →
VERIFIED/REJECTED`, plus
`CANCELLED`) and `fulfillmentStatus`
(`ORDERING → IN_TRANSIT → READY → COMPLETED`) are tracked separately, an order
carries a soft-hold `expiresAt` that `expire-orders.usecase.ts` sweeps,
`OrderPayment` rows record each partial payment toward `requiredAmount`, and
`PaymentProof` holds the buyer-submitted proof image plus its own `ProofStatus`
review state. See `apps/api/src/modules/orders/domain/order-status.vo.ts` and
`order.entity.ts` for the transition rules, and `orders-cron.service.ts` for the
expiration sweep's scheduling.

### Multi-tenancy

Tenant resolution today is per-service (`assertOwnership(storeId, userId)`
checks against `Store.ownerId`), not global middleware. Slug strategy is
`/store/:slug`, single domain, no subdomains at MVP.

### Deployment

Single Oracle Cloud VM, blue/green containers for `api`, `web`, and `workers`,
plus shared `db`, `redis`, `minio`, `uptime-kuma`, and `caddy` (S3-compatible
object storage — product/logo/payment-proof images, see
`apps/api/src/storage/storage.service.ts`). Production definitions live in
`infra/vps/docker-compose.yml`; Caddy does TLS termination for `biasmarket.com`,
`api.biasmarket.com`, `cdn.biasmarket.com`, and `status.biasmarket.com`.
Migrations run in the explicit candidate phase of `infra/vps/deploy.sh`, never
automatically on container boot. Full runbook: `docs/core/deploy.md`.

## Docs worth reading before large changes

- `docs/core/architecture.md` — monorepo layout, DDD-lite plan, multi-tenant
  design, theming system, deployment/scaling path
- `docs/core/security-payments.md` — validation rules, REST-over-tRPC rationale,
  manual payment flow state machine (implemented — see the Database section
  above for where)
- `docs/core/product.md`, `docs/core/roadmap.md`, `docs/core/i18n.md`
- `docs/plans/` — dated implementation-plan records as work lands
- `apps/web/AGENTS.md` — flags that the installed Next.js version has breaking
  changes vs. training data; check `node_modules/next/dist/docs/` before writing
  Next.js code
