# syntax=docker/dockerfile:1
#
# Single Dockerfile for web, dev and prod share the `base`/`deps` stages.
# docker-compose.dev.yml builds target `dev`, docker-compose.yml (prod)
# builds the default final target `runtime`.

# node:26-slim no longer bundles corepack, install it pinned (not @latest)
# so pnpm resolution is reproducible across builds.
FROM node:26-slim AS base
ENV COREPACK_HOME=/usr/local/share/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g corepack@0.35.0 && corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# dev: source is bind-mounted by docker-compose.dev.yml at container start,
# which also runs the install — nothing to build here.
# ---------------------------------------------------------------------------
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3001

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
# build: compile web to a standalone Next.js output
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Turbo's own cache (task hashes/outputs) is BuildKit-cache-mounted the same
# way the pnpm store is above — without it, every build recompiles every
# workspace package from scratch even when only one file changed, since
# .turbo is gitignored/dockerignored and this stage starts from a fresh COPY.
RUN --mount=type=cache,id=turbo-cache,target=/app/.turbo \
    pnpm exec turbo run build --filter=web

# ---------------------------------------------------------------------------
# runtime: prod image, non-root. Next standalone output bundles its own
# minimal node_modules, so this stage doesn't need pnpm/corepack at all —
# start clean from node:26-slim instead of `base` to keep it lean.
# ---------------------------------------------------------------------------
FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0
RUN groupadd --gid 1001 nextjs \
    && useradd --create-home --uid 1001 --gid nextjs nextjs

COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nextjs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
