# syntax=docker/dockerfile:1
#
# Single Dockerfile for api, dev and prod share the `base`/`deps` stages.
# docker-compose.dev.yml builds target `dev`, docker-compose.yml (prod)
# builds the default final target `runtime`.

# node:26-slim no longer bundles corepack, install it pinned (not @latest)
# so pnpm resolution is reproducible across builds.
FROM node:26-slim AS base
ENV COREPACK_HOME=/usr/local/share/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g corepack@0.35.0 && corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
# Kept at its repo-relative path so it resolves the same way whether it got
# here via this COPY (prod) or the docker-compose.dev.yml bind mount (dev).
COPY infra/docker/api-healthcheck.ts ./infra/docker/api-healthcheck.ts

# ---------------------------------------------------------------------------
# dev: source is bind-mounted by docker-compose.dev.yml at container start,
# which also runs the install — nothing to build here.
# ---------------------------------------------------------------------------
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3000

# ---------------------------------------------------------------------------
# deps: workspace install, cached by lockfile hash and a BuildKit pnpm
# store mount so unrelated code changes never re-download packages.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/utils/package.json ./packages/utils/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir=/pnpm-store

# ---------------------------------------------------------------------------
# build: compile api, then prune node_modules down to api's prod deps only
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .

# prisma generate only validates the schema's env() reference at build time,
# it never opens a connection — a syntactically valid dummy URL is enough
# (same workaround CI uses, see .github/workflows/ci.yml). The real
# DATABASE_URL is injected at container runtime via env_file.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN pnpm --filter @biasmarket/db run db:generate
# Turbo's own cache (task hashes/outputs) is BuildKit-cache-mounted the same
# way the pnpm store is above — without it, every build recompiles every
# workspace package from scratch even when only one file changed, since
# .turbo is gitignored/dockerignored and this stage starts from a fresh COPY.
RUN --mount=type=cache,id=turbo-cache,target=/app/.turbo \
    pnpm exec turbo run build --filter=api
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --prod --frozen-lockfile --filter=api... --store-dir=/pnpm-store

# ---------------------------------------------------------------------------
# runtime: prod image, non-root, only what api needs at boot (still needs
# pnpm — the CMD below shells out to it for `prisma migrate deploy`).
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --gid 1001 nestjs \
    && useradd --create-home --uid 1001 --gid nestjs nestjs

COPY --from=build --chown=nestjs:nestjs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nestjs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=nestjs:nestjs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nestjs:nestjs /app/apps/api/package.json ./apps/api/package.json
# One-off ops scripts (admin:create/admin:promote — see docs/core/admin-access.md)
# run via `docker compose exec api pnpm --filter api run admin:...`, not as
# part of the app's own boot — but that still needs the source files present
# in the runtime image, which nothing above actually copied until now.
COPY --from=build --chown=nestjs:nestjs /app/apps/api/scripts ./apps/api/scripts
COPY --from=build --chown=nestjs:nestjs /app/packages ./packages
COPY --from=build --chown=nestjs:nestjs /app/package.json ./package.json
COPY --from=build --chown=nestjs:nestjs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER nestjs
EXPOSE 3000
# Applies pending migrations on every container start — safe to run
# repeatedly since `prisma migrate deploy` is a no-op when the DB is
# already up to date. Dev's compose command does the same thing.
CMD ["sh", "-c", "pnpm --filter @biasmarket/db exec prisma migrate deploy && exec node apps/api/dist/main"]
