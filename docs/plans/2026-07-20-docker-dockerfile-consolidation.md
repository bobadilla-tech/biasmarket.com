# Docker setup: multi-target Dockerfiles, non-root images, de-duped healthcheck

## Context

Started from a general "optimize our Docker setup" ask, prompted by a pasted
AI-generated example of a generic multi-stage pnpm Dockerfile. The existing
setup (from [[2026-07-16-docker-infra]]) already had multi-stage builds and
correct layer-cache ordering, so the actual gaps were elsewhere: four
Dockerfiles (`api.Dockerfile`, `api.dev.Dockerfile`, `web.Dockerfile`,
`web.dev.Dockerfile`) each hand-repeating the same corepack/pnpm bootstrap line,
every prod container running as root, no BuildKit cache mount for the pnpm
store, and an identical inline Node healthcheck one-liner pasted byte-for-byte
into both `docker-compose.yml` and `docker-compose.dev.yml`.

A follow-up in the same session bumped `postgres:15` → `postgres:18`, found
while the user was looking at an unrelated line in `docker-compose.dev.yml` and
asking why the version was pinned so far behind — there was no version-specific
feature or migration reason for `15`, just an unbumped default.

## Decisions

- **One Dockerfile per app, not one per app per environment.** Docker has no way
  to `#include` another Dockerfile, so full de-duplication across files isn't
  possible — but a single Dockerfile _can_ define multiple named build stages
  (`FROM ... AS <name>`), and `docker build --target <name>` picks which one to
  stop at. `api.Dockerfile` and `web.Dockerfile` now each define one `base`
  stage (corepack/pnpm setup — previously copy-pasted identically into the
  `.dev.Dockerfile` variant) and branch from there into a trivial `dev` target
  and a full `deps` → `build` → `runtime` chain for prod. Compose picks the
  target: `docker-compose.dev.yml` passes `target: dev`, `docker-compose.yml`
  doesn't specify one, so it gets the default (the last stage in the file,
  `runtime`). This is why `api.dev.Dockerfile` / `web.dev.Dockerfile` are gone —
  they'd become dead weight once their one line of content (`FROM base`) lives
  inside the main file.
  - **Not pursued:** collapsing `api.Dockerfile`'s `base` and `web.Dockerfile`'s
    `base` into a _single_ shared base image. That would need building and
    publishing a `biasmarket-base` image as its own step before either app can
    build, which adds real orchestration (build ordering, a place to push it,
    cache invalidation across two unrelated apps) for a single-VM deploy that
    doesn't need it. Two Dockerfiles each defining their own `base` is a few
    duplicate lines, not a maintenance problem.

- **Runtime containers run as a non-root user** (`nestjs` / `nextjs`, uid 1001)
  instead of root, via `USER` + `--chown` on the final `COPY`s. This surfaced
  two problems that had to be found empirically before it worked, both verified
  in a throwaway test Dockerfile before touching the real one:
  1. `node:26-slim` **doesn't ship corepack anymore** (Node dropped bundling it
     a couple of majors back). The original Dockerfiles already worked around
     this with `npm install -g corepack@latest` — the instinct to "just drop
     that unpinned floating dependency for reproducibility" would have broken
     the build outright. Kept the `npm install -g corepack`, but pinned it to
     `corepack@0.35.0` instead of `@latest`, which was the actual
     reproducibility problem (a `docker build` today and one next month
     installing different corepack versions from a mutable tag).
  2. `corepack prepare --activate` writes its cache under `$HOME`, which for
     root is `/root` — mode `700`, unreadable by any other user. As `nestjs`,
     `pnpm` failed to even find its own prepared version. Fixed by setting
     `COREPACK_HOME=/usr/local/share/corepack` (world-traversable) before
     running `corepack enable`, so the cache lands somewhere the later non-root
     user can actually read.
  - `api`'s `runtime` stage still derives from `base` (it needs `pnpm` at
    container start — its `CMD` shells out to
    `pnpm ... exec prisma migrate
    deploy` before starting the server).
    `web`'s `runtime` stage does **not** derive from `base` — Next's
    `standalone` build output bundles its own minimal `node_modules` and needs
    no pnpm/corepack at all, so it starts fresh from `node:26-slim` to avoid
    carrying that weight into the final image.

- **BuildKit cache mount for the pnpm store**
  (`--mount=type=cache,id=pnpm-store,target=/pnpm-store`) on both
  `pnpm
  install` calls, with an explicit `--store-dir=/pnpm-store` flag on the
  command itself rather than relying on `PNPM_HOME`/env-var defaults to point
  pnpm at the same path — the env-var approach depends on pnpm-version behavior
  that wasn't worth trusting blindly; an explicit flag says exactly where the
  store is, matching exactly where the cache mount is. This is a real speed win
  for cold CI/build-cache-less environments (local `docker
  build` layer
  caching already covered the common case of "lockfile unchanged").

- **De-duped the healthcheck.** `docker-compose.yml` and
  `docker-compose.dev.yml` both had this exact string:
  `node -e "require('http').get(...)..."` — same reasoning as the original
  Docker infra plan ([[2026-07-16-docker-infra]]): no curl/wget in
  `node:26-slim`, and adding one just for a healthcheck means an extra installed
  package (plus its own deps/CVEs) for something Node can already do standalone.
  Pulled it out into `infra/docker/api-healthcheck.ts`, `COPY`'d into the shared
  `base` stage at its repo-relative path (`./infra/docker/api-healthcheck.ts`,
  not flattened to the repo root) — chosen specifically so the path resolves
  identically whether the file got there via that `COPY` (prod image) or via
  `docker-compose.dev.yml`'s bind mount of the whole repo over `/app` (dev
  container). Both compose files' `healthcheck.test` now just point at that one
  file.
  - Written as `.ts`, not `.js`, per this repo's rule (root `package.json` is
    `"type": "module"`, and Node 26 runs `.ts` files natively — verified
    directly, see Verification below — so there's no reason for a one-off infra
    script to be the one `.js` file in an otherwise all-TS repo).

- **`postgres:15` → `postgres:18`** in both compose files plus the two docs that
  mention the pinned version (`docs/spec/architecture.md`,
  `docs/spec/deploy.md`). No feature or migration reason was pinning it to 15 —
  just never bumped. Asked the user first, specifically because a **prod**
  major-version bump isn't just an image-tag edit: Postgres can't read an older
  major's on-disk data directory, so if `infra/docker/docker-compose.yml` were
  already deployed against a real volume, this would need `pg_upgrade` or a
  dump/restore, not a version string change. Confirmed nothing is deployed yet,
  so bumped both dev and prod freely with no migration step needed.

## What changed

**New:**

- `infra/docker/api-healthcheck.ts` — the de-duped healthcheck script, copied
  into both apps' `base` stage (only `api` actually uses it, since `web` has no
  healthcheck defined in compose).

**Edited:**

- `infra/docker/api.Dockerfile` — rewritten as multi-target
  (`base`/`dev`/`deps`/`build`/`runtime`), non-root `runtime` user, pnpm store
  cache mount, corepack pinned + `COREPACK_HOME` fix.
- `infra/docker/web.Dockerfile` — same multi-target pattern; `runtime` stage
  kept on bare `node:26-slim` (no pnpm needed for Next standalone output).
- `infra/docker/docker-compose.dev.yml` — `api`/`web` builds now reference
  `target: dev` on the consolidated Dockerfiles; `postgres:15` → `:18`;
  healthcheck now points at `api-healthcheck.ts` instead of an inline one-liner.
- `infra/docker/docker-compose.yml` — `postgres:15` → `:18`; same healthcheck
  script reference.
- `docs/spec/architecture.md`, `docs/spec/deploy.md` — updated the two
  `postgres:15` mentions to `:18` to match.

**Removed:**

- `infra/docker/api.dev.Dockerfile`, `infra/docker/web.dev.Dockerfile` —
  superseded by the `dev` target inside the consolidated Dockerfiles.

## Bugs hit and fixed during verification

- Assumed `npm install -g corepack@latest` in the original Dockerfiles was just
  belt-and-suspenders and tried dropping it for reproducibility. A throwaway
  test Dockerfile immediately failed with `/bin/sh: 1: corepack: not found` —
  `node:26-slim` genuinely doesn't bundle corepack. Caught before it ever
  touched the real Dockerfile; fixed by keeping the install but pinning the
  version instead.
- Same throwaway test also caught the `/root`-permissions problem (corepack
  cache unreadable by a non-root user) before it was wired into the real build —
  confirmed the fix (`COREPACK_HOME` outside `/root`) works by running
  `pnpm --version` as the non-root user inside the test image.
- **Accidentally deleted the local dev Postgres volume.** While verifying the
  `postgres:18` bump, ran
  `docker compose -f infra/docker/docker-compose.dev.yml down -v` to clean up
  after a test — the `-v` removed the project's named volumes, including
  `db_data`. Compose's own output showed the `db` container being _recreated_
  (not created fresh) right before that, meaning a container from a prior
  `pnpm docker:dev` session already existed with real local data — this wasn't a
  volume created during this session. Should have run `docker volume ls` /
  `docker ps -a` first, the same way `git status` gets checked before a
  destructive git command; didn't, and said so to the user immediately rather
  than after the fact. User confirmed the local dev data was disposable (fully
  reproducible via `prisma migrate deploy`), no irreversible loss.
- First attempt at verifying the `.ts` healthcheck ran natively (no build step,
  no flag) used a single `node -e` script that started an HTTP server and then
  spawned the healthcheck script as a child via `execFileSync` while the server
  was still holding the process open — deadlocked, had to be killed manually.
  Not a bug in the healthcheck script itself, just a bad test harness; replaced
  with two plain sequential commands (start a background server, run the script,
  check its exit code) which worked immediately.

## Verification

- Built the `runtime` target for both `api.Dockerfile` and `web.Dockerfile` end
  to end (full `deps` → `build` → `runtime` chain, not just a syntax check).
- `docker run` on the built `api` runtime image: confirmed `whoami` → `nestjs`
  (uid 1001, not root), `pnpm --version` works, `apps/api/dist/main.js` owned by
  `nestjs:nestjs`.
- `docker run` on the built `web` runtime image: confirmed `whoami` → `nextjs`,
  then actually started the container and curled it — `GET /en` → `200`, server
  log showed `Next.js ... Ready`.
- Built the `dev` target for both Dockerfiles successfully.
- `docker compose -f infra/docker/docker-compose.dev.yml config` parses clean.
  `docker-compose.yml` (prod) fails only on a missing local `.env` file
  (pre-existing, gitignored, unrelated to this change) — not a syntax or
  reference problem.
- Started the `db` service alone via dev compose on a fresh volume to confirm
  `postgres:18` boots cleanly with no migration step needed (nothing was
  deployed against the old `postgres:15` volume).
- `api-healthcheck.ts` verified two ways: directly with
  `node
  infra/docker/api-healthcheck.ts` against a dummy server (exit `0` when
  it responds, exit `1` when nothing's listening), and via Docker's actual
  `HEALTHCHECK` mechanism — ran the built image with
  `--health-cmd="node /app/infra/docker/api-healthcheck.ts"` against a dummy
  `200` response and confirmed `docker inspect .State.Health.Status` reports
  `"healthy"`.
