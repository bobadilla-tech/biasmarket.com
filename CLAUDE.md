# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What this is

Bias Market — niche-first store builder for creator-led commerce (K-pop/artist
merch stores first). Manual payment-first (bank transfer, Wise, PayPal) with
built-in proof-of-payment review, no Stripe required.

Turborepo monorepo: `apps/api` (NestJS), `apps/web` (Next.js), `packages/*`
(shared db/types/ui/i18n/utils). pnpm workspaces.

## Hard rules

- **pnpm only.** Never `npm`/`yarn`. `packageManager` is pinned in root
  `package.json` — don't touch that pin without being asked.
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
  the service layer (see `apps/api/src/modules/products/products.service.ts`) —
  mutations must verify the authenticated user owns the store, not just that the
  tenant-scoped query ran.

## Commands

Run from repo root; Turbo filters by package.

```bash
pnpm install                              # workspace install
pnpm dev                                  # all apps, parallel (api :3000, web :3001)
pnpm build                                # turbo run build (respects dependency graph)
pnpm lint                                 # turbo run lint
pnpm typecheck                            # turbo run typecheck
pnpm test                                 # turbo run test, all packages
pnpm db:generate                          # prisma generate (packages/db)

pnpm turbo run <task> --filter=api        # scope to one app, e.g. lint/build/test
pnpm turbo run <task> --filter=web
pnpm turbo run <task> --filter=@biasmarket/db
```

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
pnpm docker:prod                          # infra/docker/docker-compose.yml, prod stack
```

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

Flat NestJS `controller/service/dto` per module today:
`modules/{stores,products,users,health}`. `docs/spec/architecture.md` describes
a DDD-lite layering (`domain/application/infrastructure`) intended for
`orders`/`payments` once those modules exist — don't apply that layering to
`users`/`uploads`/`themes`-style CRUD modules, and don't retrofit it onto
existing flat modules unless asked.

- `main.ts`: global
  `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, global
  prefix `api`, CORS locked to `WEB_URL`.
- Auth: `better-auth` via `@thallesp/nestjs-better-auth`, Prisma adapter,
  email+password, `role` field defaults to `seller`. Config in
  `src/auth/auth.config.ts`.
- No tenant-resolution middleware yet — the architecture doc's
  `TenantMiddleware`/`AsyncLocalStorage` design is aspirational; current code
  checks ownership per-request inside each service method instead.
- NestJS build is SWC-based (`nest-cli.json`: `builder: "swc"`,
  `typeCheck: false`) — `pnpm typecheck` runs `tsc --noEmit` separately from the
  build.

### Database (packages/db/prisma/schema.prisma)

Current models: `User`, `Store`, `Product`, `ProductVariant`, `Order`, plus
better-auth's `Session`/`Account`/`Verification`. Money fields are `Decimal`,
never `Float`. `Order` currently has a single `paymentStatus` +
`fulfillmentStatus` pair (not yet the fuller state machine with soft-hold/
expiration described in `docs/spec/security-payments.md` §9 — that flow is
spec'd but not implemented).

### Multi-tenancy

Tenant resolution today is per-service (`assertOwnership(storeId, userId)`
checks against `Store.ownerId`), not global middleware. Slug strategy is
`/store/:slug`, single domain, no subdomains at MVP.

### Deployment

Single Oracle Cloud VM, three containers (`api`, `web`, `db`) behind Caddy
(`infra/docker/docker-compose.yml`, `infra/caddy/Caddyfile`). Caddy does TLS
termination for two subdomains: `biasmarket.com` (web) and `api.biasmarket.com`
(api). `api` container runs `prisma migrate deploy` automatically on boot. Full
runbook: `infra/docker/DEPLOY_ORACLE.md`. Known gaps called out there: no rate
limiting wired in despite `@nestjs/throttler` being installed, no CSRF/`helmet`,
no startup env-var validation.

## Docs worth reading before large changes

- `docs/spec/architecture.md` — monorepo layout, DDD-lite plan, multi-tenant
  design, theming system, deployment/scaling path
- `docs/spec/security-payments.md` — validation rules, REST-over-tRPC rationale,
  manual payment flow state machine (spec, not yet fully built)
- `docs/spec/product.md`, `docs/spec/roadmap.md`, `docs/spec/i18n.md`
- `docs/plans/` — dated implementation-plan records as work lands
- `apps/web/AGENTS.md` — flags that the installed Next.js version has breaking
  changes vs. training data; check `node_modules/next/dist/docs/` before writing
  Next.js code
