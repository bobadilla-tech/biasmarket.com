# syntax=docker/dockerfile:1

FROM node:26-slim AS deps
RUN npm install -g corepack@latest && corepack enable pnpm && corepack prepare pnpm@10.11.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/utils/package.json ./packages/utils/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /repo
COPY . .

# prisma generate only validates the schema's env() reference at build time,
# it never opens a connection — a syntactically valid dummy URL is enough
# (same workaround CI uses, see .github/workflows/ci.yml). The real
# DATABASE_URL is injected at container runtime via env_file.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN pnpm --filter @biasmarket/db run db:generate
RUN pnpm exec turbo run build --filter=api
RUN pnpm install --prod --frozen-lockfile --filter=api...

FROM node:26-slim AS runtime
RUN npm install -g corepack@latest && corepack enable pnpm && corepack prepare pnpm@10.11.0 --activate
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml

EXPOSE 3000
# Applies pending migrations on every container start — safe to run
# repeatedly since `prisma migrate deploy` is a no-op when the DB is
# already up to date. Dev's compose command does the same thing.
CMD ["sh", "-c", "pnpm --filter @biasmarket/db exec prisma migrate deploy && exec node apps/api/dist/main"]
