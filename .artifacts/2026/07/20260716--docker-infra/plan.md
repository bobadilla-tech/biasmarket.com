# Docker infra (dev + prod), replicating requiems-api's `infra/` pattern

## Context

Session started from a plain bug report: `pnpm dev` on `apps/api` crashed with
`PrismaClientInitializationError: Environment variable not found: DATABASE_URL`.
Root cause was two-fold:

1. Nothing in `apps/api` ever loaded `.env` — no `dotenv/config` import, no
   `ConfigModule`. Nest CLI doesn't auto-load `.env` files, so `apps/api/.env`
   (which had the right value) was simply never read.
2. After fixing that, a second bug surfaced: Homebrew's `postgresql@17` service
   was squatting host port 5432, so Docker's `db` container (started via the old
   root `docker-compose.dev.yml`) never got its port published — the app was
   silently connecting to the native Postgres instead, which had no `biasmarket`
   role/database, producing `P1010: User was denied access`.

Both bugs traced back to the same root cause: **local dev setup was manual and
undocumented** — four separate hand-created `.env` files (root, `apps/api`,
`apps/web`, `packages/db`) that had to agree with each other and with whatever
Postgres happened to be listening on 5432, with no single source of truth.

The sibling repo `requiems-api` solves this class of problem with an `infra/`
directory holding dev and prod Docker Compose setups, where a single committed
`infra/docker/.env.example` (safe dev defaults) is loaded via `env_file:` by
every service — a fresh clone runs `docker compose up` with zero manual setup.
This session replicates that pattern here, chosen over just patching the two
immediate bugs, so the whole class of "my env doesn't match yours" issues goes
away for future dev setup.

## Decisions

- **Full parity with requiems-api**, not just a dev-only Postgres container:
  `api` and `web` are now containerized too, for both dev (hot-reload,
  bind-mounted source) and prod (multi-stage builds). Chosen over "containerize
  db only, keep running api/web via `pnpm dev`" because the whole point was to
  stop the four-`.env`-files problem for every service, not just the database.
- **Adapted for a single pnpm workspace.** Unlike requiems-api (polyglot, one
  self-contained repo per language/service), biasmarket-app is one pnpm/turbo
  workspace with a single root lockfile. Docker build `context:` for every image
  is the **repo root**, not the app subfolder, and workspace-package
  `node_modules` in dev containers are named Docker volumes layered over the
  bind-mounted source (never a macOS-built `node_modules` bind-mounted into a
  Linux container — Prisma's engine binaries are platform-specific).
- **Deleted the 4 old `.env` files**, replaced by one committed
  `infra/docker/.env.example`. All four were already gitignored (confirmed via
  `git ls-files`), so this wasn't a git-history change — just a workflow change.
  Running `pnpm dev` natively (outside Docker) still works but now requires
  manually recreating a local `.env`; the sanctioned primary workflow is the
  Docker stack.
- **Rotated `BETTER_AUTH_SECRET`.** The old value living in `apps/api/.env` was
  never in git, but since it was about to move into a file that _is_ committed
  (`.env.example`), it got replaced with a fresh dev-only value rather than
  carried forward.
- **Fixed a real routing bug found along the way**, rather than just noting it:
  the pre-scaffolded `infra/caddy/Caddyfile` only reverse-proxies `/api/*` to
  the api service, but every controller (`/stores`, `/users`, etc.) lived
  unprefixed — would 404 in prod. Fixed by adding `app.setGlobalPrefix('api')`
  in `apps/api/src/main.ts` (chosen over hardcoding every route into the
  Caddyfile, since the prefix approach scales automatically as new controllers
  are added) and updating the two places in `apps/web` that called the API
  directly (`apps/web/lib/api.ts`, the `create-store` page) to prefix with
  `/api`.
- **Bundled two small unrelated fixes** found during investigation, since they
  were directly load-bearing for the new Docker build to work: `packages/db`'s
  script was named `generate` but `turbo.json` declares a `db:generate` task
  (silent no-op before this) — renamed to match; and `packages/i18n`'s
  `package.json` pointed `main`/`types` at uncompiled source instead of `dist/`
  (latent bug, nothing imported it yet, but would break the moment the Docker
  build tried to resolve it).

## What changed

**New:**

- `infra/docker/docker-compose.dev.yml` — db (Postgres 15) + api (Nest,
  `--watch`) + web (Next, `next dev`), hot-reload via bind mount + per-app named
  volumes for `node_modules`. Runs `prisma generate` + `prisma migrate
  deploy`
  before the api starts.
- `infra/docker/docker-compose.yml` — prod: multi-stage built images, no source
  bind-mounts, only `caddy` publishes ports to the host.
- `infra/docker/api.Dockerfile`, `web.Dockerfile` (prod, multi-stage;
  `web.Dockerfile` uses Next's `standalone` output) and their `.dev.Dockerfile`
  counterparts (minimal — install happens at container start, not build time).
- `infra/docker/.env.example` — committed, safe dev defaults for every var every
  service needs (`DATABASE_URL`, `POSTGRES_*`, `PORT`, `BETTER_AUTH_URL`,
  `BETTER_AUTH_SECRET`, `WEB_URL`, `NEXT_PUBLIC_API_URL`).
- `infra/readme.md`, `infra/docker/readme.md`, `infra/caddy/readme.md`.
- Root `.dockerignore` (needed since build context is now the repo root).

**Edited:**

- `apps/api/src/main.ts` — `app.setGlobalPrefix('api')`.
- `apps/web/lib/api.ts`,
  `apps/web/app/(onboarding)/onboarding/create-store/page.tsx` — prefixed API
  calls with `/api`.
- `apps/web/next.config.ts` — `output: "standalone"` + `outputFileTracingRoot`
  (required for the prod web Dockerfile).
- `packages/db/package.json` — `generate` → `db:generate`.
- `packages/i18n/package.json` — `main`/`types` now point at `dist/`.
- Root `package.json` — added `build`, `lint`, `db:generate`, `docker:dev`,
  `docker:dev:down`, `docker:prod` convenience scripts.

**Removed:**

- Root `docker-compose.dev.yml` (superseded by `infra/docker/`).
- `.env`, `apps/api/.env`, `apps/web/.env`, `packages/db/.env`.
- `infra/docker/.gitkeep`, `infra/caddy/.gitkeep`.

**Not touched (flagged only):** `cookies.txt` at repo root and
`apps/api/cookies.txt` are tracked in git — leftover curl session cookies,
should be `git rm`'d and gitignored in a follow-up, out of scope here.

## Bugs hit and fixed during verification

Two problems only surfaced once the stack actually ran, not during planning:

- `node:24-slim` doesn't ship `wget` — the api healthcheck (originally
  `wget -qO- ...`) always failed with exit 127. Switched to a Node `http.get`
  one-liner (same trick requiems-api uses for its worker healthchecks).
- Once `setGlobalPrefix('api')` was live, the api's own root route moved from
  `/` to `/api` — and better-auth's global auth guard returns 401 there
  (unauthenticated), not 200. The healthcheck was checking for exactly 200;
  changed to accept any non-5xx status, since a 401 still proves the server is
  up and routing correctly.

Also, mid-session, an external linter/hook was actively editing several
`package.json` files (adding `typecheck`/`test` scripts, `@types/node`, a
`build` script for `packages/db`) — each edit put `pnpm-lock.yaml` briefly out
of sync with `--frozen-lockfile`, requiring a `pnpm install` on the host before
the containers could rebuild.

## Verification

Full dev stack brought up from a clean state
(`docker compose -f infra/docker/docker-compose.dev.yml up --build`):

- `db`, `api`, `web` all reach `healthy`/running state.
- All 5 existing Prisma migrations applied automatically.
- `GET /api` → 401 (proves the server is alive and behind the auth guard as
  expected, not a failure).
- `GET /` (web) → 200.
- CORS preflight from `http://localhost:3001` to `/api/stores` → allowed.
- `POST /api/auth/sign-up/email` → 200 with a session cookie set.
- Data survives a plain `docker compose down` / `up` (tested by re-querying the
  signed-up user after a restart).
- Both prod Dockerfiles (`api.Dockerfile`, `web.Dockerfile`) build clean via
  `docker compose -f infra/docker/docker-compose.yml build`.

## Follow-up: hot reload for shared workspace packages

The initial dev setup only hot-reloaded each app's own source tree
(`apps/api/src`, `apps/web`) — editing a shared workspace package
(`packages/db`, `i18n`, `types`, `utils`) did nothing, confirmed by actually
editing `packages/utils` in the running stack and observing no reaction, then
manually rebuilding its `dist/` and still observing no reaction. Root cause,
found empirically rather than assumed:

- Nothing rebuilt a workspace package's `dist/` on source change — install at
  container start builds once, no watcher.
- Even with `dist/` rebuilt, `nest start --watch`'s watcher only covers
  `apps/api`'s own tsconfig scope, so it never restarts on a dependency's
  `dist/` changing.

Fix, added to both `docker-compose.dev.yml` service commands via `concurrently`:

- `turbo watch build --filter=...` keeps each service's actually-consumed
  packages' `dist/` fresh on source change (`db`/`i18n`/`types`/`utils` for
  `api`; `i18n`/`types` for `web` — `ui` needs nothing, Next transpiles its raw
  `.tsx` directly).
- `web` needed no further change — verified empirically (temporarily wired a
  probe import into `apps/web/app/page.tsx`, edited a package's compiled output
  directly) that Next/Turbopack's own dev server already watches the real,
  symlink-resolved path of workspace packages and hot-reloads on its own.
- `api` needed two more processes: `nest build --watch` (compile-only) and
  `nodemon` watching `apps/api/dist` plus every consumed package's `dist`,
  restarting `node apps/api/dist/main.js` on any change — `nest start --watch`
  itself was replaced for this reason.

Two bugs surfaced while wiring this, both fixed:

- YAML's `>` (folded) scalar silently swallows trailing `\` line-continuations
  in a multi-line shell command — the intended `concurrently "..." "..." "..."`
  invocation was actually being read by `sh` as several separate, malformed
  statements (`sh: ...: not found`). Fixed by keeping each `concurrently`
  invocation on a single line rather than manually wrapping it.
- `apps/api/nest-cli.json` had `"deleteOutDir": true`, which wipes the entire
  `dist/` directory before every incremental rebuild — `nodemon` would sometimes
  catch that directory mid-wipe and crash trying to run a `main.js` that
  momentarily didn't exist (`MODULE_NOT_FOUND`). Set to `false`.

Verified end-to-end with a temporary `@Public() GET /api/probe` endpoint in
`apps/api/src/app.controller.ts` calling `slugify` from `@biasmarket/utils`:
edited `packages/utils/index.ts` in the running stack, watched `turbo watch`
rebuild it and `nodemon` restart `api` on its own, and confirmed the response
changed accordingly — then reverted both the probe endpoint and the test edit.
