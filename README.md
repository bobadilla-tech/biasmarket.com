# Bias Market

[![codecov](https://codecov.io/gh/bobadilla-tech/biasmarket.com/graph/badge.svg)](https://codecov.io/gh/bobadilla-tech/biasmarket.com)

Storefronts for the K-pop commerce world: GOMs, photocard sellers, album group
orders, comeback drops, and fan merch shops. Manual payment-first (bank
transfer, Wise, PayPal) with built-in proof-of-payment review, no Stripe
required.

## Stack

Next.js · NestJS · Prisma · PostgreSQL · Docker · Resend

## Getting started

Prerequisites: Docker, Node 24 LTS, [pnpm](https://pnpm.io).

```bash
pnpm docker:dev
```

This is the only sanctioned dev workflow, one command brings up Postgres, the
NestJS API, and the Next.js web app with working dev defaults, no manual `.env`
setup required. Details, seeded accounts, and hot-reload behavior:
[docs/core/infra.md](docs/core/infra.md).

Running the apps directly on the host (`pnpm dev`) is possible but unsupported,
it starts `api`/`web` only, with no database, and needs you to hand-build your
own `.env` files. Use `pnpm docker:dev` unless you have a specific reason not
to.

## Monorepo index

pnpm workspaces + Turborepo.

### Apps (`apps/*`)

| App                     | Description                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| [api](apps/api)         | NestJS backend. Sole owner of the database; web and mobile talk to it over HTTP. |
| [web](apps/web)         | Next.js frontend: storefronts and the seller dashboard.                          |
| [workers](apps/workers) | Background job worker (BullMQ), e.g. scheduled order expiry.                     |
| [mobile](apps/mobile)   | Expo / React Native app.                                                         |
| [sanity](apps/sanity)   | Sanity Studio for editorial content.                                             |

### Packages (`packages/*`)

| Package                                             | Description                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| [@biasmarket/db](packages/db)                       | Prisma schema and generated client.                               |
| [@biasmarket/types](packages/types)                 | Shared types and the Orval-generated API client.                  |
| [@biasmarket/validation](packages/validation)       | Shared zod schemas (checkout, payments, auth, coupons, ...).      |
| [@biasmarket/design-tokens](packages/design-tokens) | Store palette values and resolution, shared by web and mobile.    |
| [@biasmarket/i18n](packages/i18n)                   | ES/EN translation dictionaries.                                   |
| [@biasmarket/query](packages/query)                 | Shared React Query client defaults for web and mobile.            |
| [@biasmarket/queue](packages/queue)                 | BullMQ queue names and payload contracts used by api and workers. |
| [@biasmarket/utils](packages/utils)                 | Shared pure functions.                                            |

## Docs

- [docs/core/](docs/core/) — architecture, product spec, security & payments,
  i18n, deploy runbooks.
