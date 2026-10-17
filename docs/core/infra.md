# infra

Overview of the `infra/` folder: Docker-based development plus the immutable
blue/green VPS production stack. This doc also lists the seeded dev accounts and
known dev issues.

- `infra/docker/` — development Compose file, Dockerfiles, healthcheck, and safe
  local env defaults. See [docker-dev.md](docker-dev.md) for the dev workflow
  and [docker.md](docker.md) for how the images are built.
- `infra/vps/` — the only production Compose file, deploy state machine, Caddy,
  runtime env templates, and operational scripts. See [deploy.md](deploy.md).

Deploying to production? The VPS is provisioned with Terraform from
`infra/terraform/` (see [provisioning.md](provisioning.md)). See
[deploy.md](deploy.md) and [blue-green-migrations.md](blue-green-migrations.md)
for deployment, secrets, and verification.

## Quick start (dev)

```bash
pnpm docker:dev
```

This is the primary, sanctioned dev workflow: the whole stack (see
[docker-dev.md](docker-dev.md)) starts from one command, with zero manual `.env`
setup — `infra/docker/.env.example` is committed with working dev defaults and
is loaded automatically.

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
**unsupported** — it runs every workspace's `dev` script
(`turbo run dev
--parallel`) but starts no Postgres, Redis or MinIO, and
requires manually recreating your own gitignored `.env` files (root,
`apps/api/.env`, `apps/web/.env`, `packages/db/.env`) since no example template
exists for host mode — everything documented here assumes `docker:dev`.

## Known issues

- **`ERR_PNPM_BROKEN_LOCKFILE` on install.** Your global `pnpm` is probably
  newer than the pinned `10.11.0` and is silently corrupting `pnpm-lock.yaml` on
  every install (a known upstream pnpm bug, not something this repo can work
  around). Fix: `npx pnpm@10.11.0 install` instead of bare `pnpm install`. Full
  root cause:
  [pnpm-lockfile-corruption plan](../../.artifacts/2026/07/20260719--pnpm-lockfile-corruption/plan.md).
- **`role "biasmarket" does not exist` / migrations hit the wrong DB.** If you
  also have a native Postgres running on the host, it can silently win the
  connection on `localhost:5432` ahead of the Docker one. Either stop the native
  Postgres, or run Prisma commands via
  `docker compose -f
infra/docker/docker-compose.dev.yml exec api pnpm --filter @biasmarket/db
exec prisma <command>`
  so they run inside the container against the Docker-internal `db` hostname.

## Related

- [docker-dev.md](docker-dev.md): dev workflow, hot reload, scripts.
- [provisioning.md](provisioning.md): server setup with Terraform.
- [admin-access.md](admin-access.md): admin accounts and the seed in production.
