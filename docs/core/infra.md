# infra

Docker-based dev and prod setup for biasmarket-app, mirroring the pattern used
in `requiems-api`.

- `infra/docker/` — dev and prod Docker Compose files, Dockerfiles, and env
  defaults. See [readme.md](readme.md).
- `infra/caddy/` — reverse proxy config used only by the prod stack. See
  [caddy.md](caddy.md).

Deploying to production on Oracle Cloud? See [deploy.md](deploy.md) for the full
walkthrough (VM provisioning, firewall gotchas, secrets, DNS, verification).

## Quick start (dev)

```bash
docker compose -f infra/docker/docker-compose.dev.yml up --build
```

This is the primary, sanctioned dev workflow: Postgres, the NestJS API, and the
Next.js web app all start from one command, with zero manual `.env` setup —
`infra/docker/.env.example` is committed with working dev defaults and is loaded
automatically.

The `api` container also runs the base seed on every boot
(`apps/api/scripts/seed/run.ts`, idempotent — every fixture is upserted, so
reruns repair rather than duplicate) so the admin panel, seller dashboard, and
storefront all have real data to look at right away: two admins, two demo
sellers each with a store covering categories, collections, storefront sections,
inventory edge cases (unlimited/low/sold-out stock, reserved units, price/image
overrides, draft & expired products), and orders across every
payment/fulfillment state a seller's dashboard can show.

| Email                         | Password          | Role                                  |
| ----------------------------- | ----------------- | ------------------------------------- |
| `admin@biasmarket.dev`        | `devpassword123`  | admin                                 |
| `owner@biasmarket.dev`        | `devpassword123`  | admin                                 |
| `seed-seller1@biasmarket.dev` | `seedpassword123` | seller (owns `demo-tienda-de-camila`) |
| `seed-seller2@biasmarket.dev` | `seedpassword123` | seller (owns `demo-kpop-corner`)      |

Need another labeled demo store on top of these (e.g. to test with more data)?
Run append mode: `pnpm seed:append:dev -- --batch=<label>` — adds one more demo
seller/store namespaced by `<label>`, without touching the base fixtures above.
Rerunning with the same label repairs that batch in place; a new label adds a
separate one.

Dev-only by default — `docker-compose.dev.yml` only ever runs base mode. The
same command is also safe to run manually against prod as an explicit operator
action; see [admin-access.md](admin-access.md).

Running `pnpm dev` natively on the host (outside Docker) is possible but
**unsupported** — it only starts `api`/`web` (no Postgres, no MinIO), and
requires manually recreating your own gitignored `.env` files (root,
`apps/api/.env`, `apps/web/.env`, `packages/db/.env`) since no example template
exists for host mode — everything documented here assumes `docker:dev`.

## Known issues

- **`ERR_PNPM_BROKEN_LOCKFILE` on install.** Your global `pnpm` is probably
  newer than the pinned `10.11.0` and is silently corrupting `pnpm-lock.yaml` on
  every install (a known upstream pnpm bug, not something this repo can work
  around). Fix: `npx pnpm@10.11.0 install` instead of bare `pnpm install`. Full
  root cause:
  [pnpm-lockfile-corruption plan](../plans/2026-07-19-pnpm-lockfile-corruption.md).
- **`role "biasmarket" does not exist` / migrations hit the wrong DB.** If you
  also have a native Postgres running on the host, it can silently win the
  connection on `localhost:5432` ahead of the Docker one. Either stop the native
  Postgres, or run Prisma commands via
  `docker compose -f
  infra/docker/docker-compose.dev.yml exec api pnpm --filter @biasmarket/db
  exec prisma <command>`
  so they run inside the container against the Docker-internal `db` hostname.
- **Edited `schema.prisma`, but the API isn't picking it up.** The compose
  file's live-reload only covers application source, not schema changes that
  need a fresh `prisma generate`. Run
  `docker compose -f
  infra/docker/docker-compose.dev.yml restart api` (or a
  full `pnpm
  docker:dev` down/up) after any Prisma schema edit.
