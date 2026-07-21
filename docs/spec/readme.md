# infra/docker

## Dev

```bash
docker compose -f infra/docker/docker-compose.dev.yml up --build
```

Brings up `db` (Postgres 15), `api` (NestJS), and `web` (Next.js). Source is
bind-mounted from the repo root so edits on the host are picked up immediately;
`node_modules` for every package each service touches lives in a named Docker
volume (never a host-mounted `node_modules`, since native binaries like Prisma's
engines are Linux-specific and the host here is macOS).

Env vars come from `.env.example` (committed, safe defaults) with an optional,
gitignored `.env.local` layered on top for personal overrides — not required to
exist.

Prisma migrations run automatically (`prisma migrate deploy`) before the api
starts.

### Hot reload across the whole workspace

Editing `apps/api` or `apps/web` directly hot-reloads on its own
(`nest build --watch` / `next dev`). Editing a shared workspace package
(`packages/db`, `i18n`, `types`, `utils`) also propagates automatically, via a
2-3 process pipeline run with `concurrently` in each service's container:

- `turbo watch build --filter=...` — rebuilds a package's `dist/` the moment its
  source changes (scoped to whichever packages that service actually imports:
  `db`/`i18n`/`types`/`utils` for `api`, `i18n`/`types` for `web`; `ui` is
  untouched since Next transpiles its raw `.tsx` directly, no build step).
- `web`: Next/Turbopack's own dev server already watches the resolved real path
  of symlinked workspace packages (pnpm symlinks resolve outside
  `node_modules`'s literal path), so a `dist/` rebuild alone is enough — no
  extra process needed.
- `api`: Nest's own `--watch` only watches its own `apps/api/src` tsconfig
  scope, so it never notices a dependency's `dist/` changing on its own. Two
  extra processes close that gap: `nest build --watch` (compile-only, no run)
  and `nodemon` watching `apps/api/dist` + every consumed package's `dist`,
  restarting `node apps/api/dist/main.js` on any change.

This relies on `apps/api/nest-cli.json` having `"deleteOutDir": false` — with it
`true`, Nest wipes the entire `dist/` directory before every incremental
rebuild, and `nodemon` can catch that directory mid-wipe and crash trying to run
a `main.js` that momentarily doesn't exist.

Data persists in the `db_data` named volume across `docker compose down`; use
`down -v` to wipe it.

## Prod

```bash
cd infra/docker
cp .env.example .env   # then fill in real secrets
docker compose -f docker-compose.yml up -d --build
```

Builds multi-stage production images for `api` and `web` (code baked in, no bind
mounts) and fronts everything with `caddy`, which is the only service that
publishes ports to the host. `api`, `web`, and `db` are reachable only on the
internal Docker network — never expose them directly in production.

`NEXT_PUBLIC_API_URL` is a Next.js build-time value (inlined into the client
bundle), so it's passed as a Docker build `arg` rather than only a runtime env
var.
