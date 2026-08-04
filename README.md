# Bias Market

[![codecov](https://codecov.io/gh/bobadilla-tech/biasmarket.com/graph/badge.svg)](https://codecov.io/gh/bobadilla-tech/biasmarket.com)

Storefronts for the K-pop commerce world: GOMs, photocard sellers, album group
orders, comeback drops, and fan merch shops. Manual payment-first (bank
transfer, Wise, PayPal) with built-in proof-of-payment review, no Stripe
required.

## Stack

Next.js · NestJS · Prisma · PostgreSQL · Docker · Cloudflare R2 · JWT · Resend

## Getting started

Prereqs: Docker, Node 26, [pnpm](https://pnpm.io).

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

## Docs

- [docs/core/](docs/core/) — architecture, product spec, security & payments,
  i18n, deploy runbooks.
