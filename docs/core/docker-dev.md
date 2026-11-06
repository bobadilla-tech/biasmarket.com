# Docker dev environment

The supported local workflow: one Compose file runs the whole stack with working
defaults. Seeded accounts and known issues live in [infra.md](infra.md).

## Dev

```bash
docker compose -f infra/docker/docker-compose.dev.yml up --build
```

Brings up `db` (Postgres), `minio` with a one-shot `minio-init` that creates the
buckets, `redis`, `api` (NestJS), `workers` (BullMQ), and `web` (Next.js). The
Postgres major version is pinned by the `db` image in
[`docker-compose.dev.yml`](../../infra/docker/docker-compose.dev.yml). `api`
waits for `db`, `redis` and `minio-init`; `web` waits for `api`. Source is
bind-mounted from the repo root so edits on the host are picked up immediately;
`node_modules` for every package each service touches lives in a named Docker
volume (never a host-mounted `node_modules`, since native binaries like Prisma's
engines are Linux-specific and the host here is macOS).

Env vars come from `.env.example` (committed, safe defaults) with an optional,
gitignored `.env.local` layered on top for personal overrides — not required to
exist.

Prisma migrations run automatically (`prisma migrate deploy`) before the api
starts, followed by the idempotent base seed (`apps/api/scripts/seed/run.ts`);
see [infra.md](infra.md) for what it creates. `workers` has no database and no
seed step.

## First run: what to expect

The first `pnpm docker:dev` is slow (installs dependencies, builds workspace
packages, migrates and seeds) — expect 5–15 minutes. Give Docker Desktop at
least 8 GB of RAM. It is working when the logs settle and `web` prints `Ready`;
`web` starts last because it waits for `api` to be healthy.

| Service       | URL / port              | Notes                                                      |
| ------------- | ----------------------- | ---------------------------------------------------------- |
| `web`         | <http://localhost:3001> | Redirects to a locale, e.g. `/es`. Dashboard: `/es/login`. |
| `api`         | <http://localhost:3000> | Routes are under `/api`, e.g. `/api/health`.               |
| `minio`       | <http://localhost:9001> | Console. Login `admin` / `password123`.                    |
| `db`, `redis` | `5432`, `6379`          | Credentials in `infra/docker/.env.example`.                |

**`minio-init` showing as stopped/exited is normal.** It is a one-shot job that
creates the buckets and exits with code 0. Every other service should stay
running. Log in with the seeded accounts in [infra.md](infra.md).

## Troubleshooting

First step for almost anything odd: a clean rebuild. Gitignored `dist/` folders
are bind-mounted into the containers, so stale builds survive restarts.

```bash
pnpm docker:dev:down
rm -rf apps/api/dist apps/workers/dist packages/*/dist
pnpm docker:dev
```

- **A service exits.** Read its logs:
  `docker compose -f
infra/docker/docker-compose.dev.yml logs <api|web|workers>`.
  Docker Desktop only shows the tail; the real error is usually higher up.
- **`Module not found: Can't resolve '@biasmarket/...'` or
  `does not provide an
export named ...`.** A workspace package's `dist/` is
  missing or stale. Do the clean rebuild above. Pull latest first, older dev
  scripts did not build every package `web` imports.
- **`filewatching failed to start: waiting for cookie timed out`.** You are on
  an old `*-dev.sh` that used `turbo watch`. Pull latest.
- **Still broken after a clean rebuild.** Wipe volumes too (deletes local data):
  `docker compose -f infra/docker/docker-compose.dev.yml down -v`.
- **Install or database problems.** See "Known issues" in [infra.md](infra.md).
- **`Cannot find module '@biasmarket/utils/register'` (or another workspace
  package) while a container builds packages.** Each dev container keeps its own
  Turbo cache in a named volume (`TURBO_CACHE_DIR=/turbo-cache`) rather than the
  bind-mounted host `.turbo/`, so a host `pnpm build` (e.g. on Windows) cannot
  feed it a stale cache hit with missing `dist/` output. If you are
  upgrading from an older checkout, do the clean rebuild above and
  `docker compose -f infra/docker/docker-compose.dev.yml down -v` once so the
  old volumes are recreated.
- You do **not** need `pnpm install` or `pnpm build` on the host to run the
  Docker stack.

### Windows

`pnpm docker:dev` works from PowerShell, cmd or WSL with Docker Desktop. The
repo's `.gitattributes` forces LF on checkout (`*.sh` especially), so the
container scripts run unchanged; if you cloned before that and see
`sh: 1: ...\r: not found`, run `git add --renormalize .` or re-clone.

The root `build`, `test` and `typecheck` scripts go through
[`scripts/with-turbo-env.mjs`](../../scripts/with-turbo-env.mjs), which fills in
a dummy `DATABASE_URL` (Prisma generate only validates it) when you have not set
one, instead of a POSIX `VAR=${X:-default}` prefix that Windows shells cannot
parse. Nothing else needs the host: the Docker stack does not need a host
`pnpm install` or `pnpm build`.

### Hot reload across the whole workspace

The actual `command:` each service runs lives in
[`infra/docker/scripts/api-dev.sh`](../../infra/docker/scripts/api-dev.sh),
[`web-dev.sh`](../../infra/docker/scripts/web-dev.sh) and
[`workers-dev.sh`](../../infra/docker/scripts/workers-dev.sh) — pulled out of
the compose file's inline `command:` since that YAML folded scalar previously
broke the `concurrently` invocation once already (silently ate `\`
line-continuations, see
[docker-infra plan](../../.artifacts/2026/07/20260716--docker-infra/plan.md)).
Edit those scripts, not the compose file, to change the dev process pipeline.

Editing `apps/api`, `apps/workers` or `apps/web` directly hot-reloads on its own
(`nest build --watch` / `next dev`). Editing a shared workspace package
(`packages/db`, `i18n`, `queue`, `types`, `utils`) also propagates
automatically, via a `concurrently`-run pipeline in each service's container:

- `nodemon --legacy-watch` running `turbo run build --filter=...` — rebuilds a
  package's `dist/` shortly after its source changes (scoped to whichever
  packages that service actually imports, see each `*-dev.sh`). Not
  `turbo
watch`: its daemon fails on Docker Desktop bind mounts with
  "filewatching failed to start: waiting for cookie timed out", which kills the
  container.
- `web`: Next/Turbopack's own dev server already watches the resolved real path
  of symlinked workspace packages (pnpm symlinks resolve outside
  `node_modules`'s literal path), so a `dist/` rebuild alone is enough — no
  extra process needed.
- `api`: Nest's own `--watch` only watches its own `apps/api/src` tsconfig
  scope, so it never notices a dependency's `dist/` changing on its own. Three
  extra processes close that gap:
  - `nest build --watch` (compile-only, no run)
  - `nodemon` watching `packages/db/prisma/schema.prisma`, re-running
    `prisma generate` on any change — `packages/db` has no build step of its own
    (its generated Prisma client is consumed directly as `.ts`, via Node's
    native TypeScript support), so this is the only way schema edits reach a
    running container.
  - `nodemon` watching `apps/api/dist` + every consumed package's `dist` **and**
    `packages/db/generated` (extensions `js,json,ts` — the `ts` is for
    `packages/db`'s ungenerated-to-`dist` output), restarting
    `node apps/api/dist/main.js` on any change. This is what picks up the
    regenerated Prisma client from the watcher above, so editing `schema.prisma`
    no longer needs a manual container restart.

This relies on `apps/api/nest-cli.json` having `"deleteOutDir": false` — with it
`true`, Nest wipes the entire `dist/` directory before every incremental
rebuild, and `nodemon` can catch that directory mid-wipe and crash trying to run
a `main.js` that momentarily doesn't exist.

Data persists in named volumes (`db_data`, `redis_data`, `minio_data`) across
`docker compose down`; use `down -v` to wipe them.

## Scripts

Run from the repo root. The `:dev` scripts execute inside the running `api`
container.

| Command                                          | What it does                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm docker:dev` / `pnpm docker:dev:down`       | Start (with build) or stop the dev stack.                                                 |
| `pnpm admin:create:dev` / `admin:promote:dev`    | Create an admin user, or promote an existing one. See [admin-access.md](admin-access.md). |
| `pnpm seed:base:dev` / `seed:append:dev`         | Re-run the base seed, or add a labeled demo batch.                                        |
| `pnpm dev`, `build`, `lint`, `typecheck`, `test` | Turbo tasks across the workspace.                                                         |
| `pnpm fix`                                       | Format changed files, then lint.                                                          |
| `pnpm db:generate`                               | Generate the Prisma client.                                                               |
| `pnpm kuma:setup`                                | Create the Uptime Kuma monitors (`scripts/setup-kuma.ts`).                                |
| `pnpm check:workspaces`                          | Check every workspace defines the required scripts.                                       |

Scripts defined in `apps/api/package.json` (run with `pnpm --filter api run

<script>`):

| Script                           | What it does                                                    |
| -------------------------------- | --------------------------------------------------------------- |
| `generate:openapi`               | Build the API and emit `apps/api/openapi.json`.                 |
| `admin:create`, `admin:promote`  | Admin account scripts.                                          |
| `seed:base`, `seed:append`       | Base seed, or append a labeled demo batch.                      |
| `migrate:buyer-accounts`         | Backfill buyer accounts (`scripts/migrate-buyer-accounts.ts`).  |
| `mail:test`, `queue:ping`        | Send a test email or a test queue job.                          |
| `test`, `test:cov`, `test:e2e`   | Unit tests, coverage, and e2e against the real `AppModule`.     |

After changing an API response DTO, regenerate the committed OpenAPI spec and
SDK; see "Changing the API contract" in [ci.md](ci.md).

## Production

Production is not run from `infra/docker/`. The only supported production path
is the immutable blue/green VPS stack in [`deploy.md`](deploy.md), using
`infra/vps/docker-compose.yml` and `infra/vps/deploy.sh`.

Application images are built in CI, pushed to GHCR with the commit SHA as the
tag, and pulled by the VPS deploy. See
[`blue-green-migrations.md`](blue-green-migrations.md) for manual deploy
operations and [`provisioning.md`](provisioning.md) for server setup.

## Related

- [infra.md](infra.md): seeded accounts and known issues.
- [docker.md](docker.md): how the images are built.
- [ci.md](ci.md): what CI checks.
