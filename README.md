# Bias Market

[![codecov](https://codecov.io/gh/bobadilla-tech/biasmarket.com/graph/badge.svg)](https://codecov.io/gh/bobadilla-tech/biasmarket.com)

Niche-first store builder for creator-led commerce — starting with K-pop /
artist merch stores. Manual payment-first (bank transfer, Wise, PayPal) with
built-in proof-of-payment review, no Stripe required.

## Stack

Next.js · NestJS · Prisma · PostgreSQL · Docker · Cloudflare R2 · JWT · Resen

## Getting started

Prereqs: Docker, Node 26, [pnpm](https://pnpm.io) (version pinned via
`packageManager` in `package.json` — see the note below if your global `pnpm`
is a different major version).

```bash
pnpm docker:dev
```

This is the only sanctioned dev workflow — one command brings up Postgres, the
NestJS API, and the Next.js web app with working dev defaults, no manual `.env`
setup required. Details, seeded accounts, and hot-reload behavior:
[docs/core/infra.md](docs/core/infra.md).

> **pnpm version mismatch?** If `pnpm install`/`docker:dev` fails with
> `ERR_PNPM_BROKEN_LOCKFILE`, your global `pnpm` (check `pnpm -v`) is likely
> ahead of the pinned `10.11.0` and silently corrupting the lockfile on
> install. Run `npx pnpm@10.11.0 install` instead. Details:
> [docs/plans/2026-07-19-pnpm-lockfile-corruption.md](docs/plans/2026-07-19-pnpm-lockfile-corruption.md).

Running the apps directly on the host (`pnpm dev`) is possible but
unsupported — it starts `api`/`web` only, with no database, and needs you to
hand-build your own `.env` files. Use `pnpm docker:dev` unless you have a
specific reason not to.

## Docs

- [docs/core/](docs/core/) — architecture, product spec, security & payments,
  i18n, deploy runbooks
- [docs/plans/](docs/plans/) — record of implementation plans as work lands
