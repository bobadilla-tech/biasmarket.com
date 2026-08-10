# syntax=docker/dockerfile:1
#
# Single Dockerfile for workers, dev and prod share the `base`/`deps` stages.
# docker-compose.dev.yml builds target `dev`, docker-compose.yml (prod)
# builds the default final target `runtime`. Mirrors api.Dockerfile's shape —
# see that file's comments for the rationale behind each stage.

# node:26-slim no longer bundles corepack, install it pinned (not @latest)
# so pnpm resolution is reproducible across builds.
FROM node:26-slim AS base
ENV COREPACK_HOME=/usr/local/share/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g corepack@0.35.0 && corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
# Reused verbatim from api's healthcheck — both services expose the same
# "GET a path, check < 500" shape at /health, see api-healthcheck.ts.
COPY infra/docker/api-healthcheck.ts ./infra/docker/api-healthcheck.ts

# ---------------------------------------------------------------------------
# dev: source is bind-mounted by docker-compose.dev.yml at container start,
# which also runs the install — nothing to build here.
# ---------------------------------------------------------------------------
FROM base AS dev
ENV NODE_ENV=development
# procps provides `ps`, which tree-kill (used by `concurrently -k` in this
# service's dev command) shells out to when killing sibling processes.
# node:26-slim omits it, so tree-kill's `spawn('ps', ...)` throws an
# unhandled ENOENT and crashes the whole container the moment any watched
# process exits — not just the one it's trying to clean up after.
RUN apt-get update && apt-get install -y --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*
EXPOSE 3002

# ---------------------------------------------------------------------------
# deps: workspace install, cached by lockfile hash and a BuildKit pnpm
# store mount so unrelated code changes never re-download packages. Every
# workspace member's package.json must be present here (not just workers'
# own dependencies) — `pnpm install --frozen-lockfile` with no `--filter`
# reconciles against the whole workspace lockfile.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/workers/package.json ./apps/workers/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/queue/package.json ./packages/queue/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/utils/package.json ./packages/utils/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir=/pnpm-store

# ---------------------------------------------------------------------------
# build: compile workers (and its one workspace dependency, packages/queue),
# then prune node_modules down to workers' prod deps only. No Postgres/Prisma
# step here — apps/workers never depends on @biasmarket/db, see the plan.
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .

RUN --mount=type=cache,id=turbo-cache,target=/app/.turbo \
    pnpm exec turbo run build --filter=workers
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    CI=true pnpm install --force --offline --prod --frozen-lockfile --filter=workers... \
      --reporter=append-only --store-dir=/pnpm-store

# ---------------------------------------------------------------------------
# runtime: prod image, non-root, only what workers needs at boot — no
# migrate-on-boot step (that's api's job, workers has no database).
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --gid 1001 nestjs \
    && useradd --create-home --uid 1001 --gid nestjs nestjs

COPY --from=build --chown=nestjs:nestjs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nestjs /app/apps/workers/node_modules ./apps/workers/node_modules
COPY --from=build --chown=nestjs:nestjs /app/apps/workers/dist ./apps/workers/dist
COPY --from=build --chown=nestjs:nestjs /app/apps/workers/package.json ./apps/workers/package.json
COPY --from=build --chown=nestjs:nestjs /app/packages ./packages
COPY --from=build --chown=nestjs:nestjs /app/package.json ./package.json
COPY --from=build --chown=nestjs:nestjs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER nestjs
EXPOSE 3002
CMD ["node", "apps/workers/dist/main.js"]
