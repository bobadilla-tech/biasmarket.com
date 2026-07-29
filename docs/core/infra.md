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

The `api` container also runs the base seed on every boot
(`apps/api/scripts/seed/run.ts`, idempotent — every fixture is upserted, so
reruns repair rather than duplicate) so the admin panel, seller dashboard, and
storefront all have real data to look at right away: two admins, two demo
sellers each with a store covering categories, collections, storefront
sections, inventory edge cases (unlimited/low/sold-out stock, reserved units,
price/image overrides, draft & expired products), and orders across every
payment/fulfillment state a seller's dashboard can show.

| Email                         | Password           | Role                                  |
| ------------------------------ | ------------------- | -------------------------------------- |
| `admin@biasmarket.dev`         | `devpassword123`    | admin                                  |
| `owner@biasmarket.dev`         | `devpassword123`    | admin                                  |
| `seed-seller1@biasmarket.dev`  | `seedpassword123`   | seller (owns `demo-tienda-de-camila`)  |
| `seed-seller2@biasmarket.dev`  | `seedpassword123`   | seller (owns `demo-kpop-corner`)       |

Need another labeled demo store on top of these (e.g. to test with more
data)? Run append mode: `pnpm seed:append:dev -- --batch=<label>` — adds one
more demo seller/store namespaced by `<label>`, without touching the base
fixtures above. Rerunning with the same label repairs that batch in place; a
new label adds a separate one.

Dev-only by default — `docker-compose.dev.yml` only ever runs base mode. The
same command is also safe to run manually against prod as an explicit
operator action; see [admin-access.md](admin-access.md).

Running `pnpm dev` natively on the host (outside Docker) still works, but now
requires manually recreating your own gitignored `.env` files (root,
`apps/api/.env`, `apps/web/.env`, `packages/db/.env`) since the ones that used
to live there have been removed in favor of this setup.
