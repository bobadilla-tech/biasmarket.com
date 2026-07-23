# infra

Docker-based dev and prod setup for biasmarket-app, mirroring the pattern used
in `requiems-api`.

- `docker/` — dev and prod Docker Compose files, Dockerfiles, and env defaults.
  See `docker/readme.md`.
- `caddy/` — reverse proxy config used only by the prod stack. See
  `caddy/readme.md`.

Deploying to production on Oracle Cloud? See
[`docker/DEPLOY_ORACLE.md`](docker/DEPLOY_ORACLE.md) for the full walkthrough
(VM provisioning, firewall gotchas, secrets, DNS, verification).

## Quick start (dev)

```bash
docker compose -f infra/docker/docker-compose.dev.yml up --build
```

This is the primary, sanctioned dev workflow: Postgres, the NestJS API, and the
Next.js web app all start from one command, with zero manual `.env` setup —
`infra/docker/.env.example` is committed with working dev defaults and is loaded
automatically.

The `api` container also runs a full seed setup on every boot
(`apps/api/scripts/seed-dev.ts`, idempotent) so the admin panel, seller
dashboard, and storefront all have real data to look at right away — two
admins, two sellers each with a store and a few published products:

| Email                    | Password          | Role   |
| ------------------------- | ----------------- | ------ |
| `admin@biasmarket.dev`    | `devpassword123`  | admin  |
| `owner@biasmarket.dev`    | `devpassword123`  | admin  |
| `seller1@biasmarket.dev`  | `devpassword123`  | seller (owns `tienda-de-camila`) |
| `seller2@biasmarket.dev`  | `devpassword123`  | seller (owns `kpop-corner`) |

Dev/native only — never runs against `docker-compose.yml` (prod).

Running `pnpm dev` natively on the host (outside Docker) still works, but now
requires manually recreating your own gitignored `.env` files (root,
`apps/api/.env`, `apps/web/.env`, `packages/db/.env`) since the ones that used
to live there have been removed in favor of this setup.
