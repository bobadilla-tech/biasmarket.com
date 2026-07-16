# syntax=docker/dockerfile:1

FROM node:24-slim AS deps
RUN corepack enable pnpm && corepack prepare pnpm@10.11.0 --activate
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

RUN pnpm --filter @barristore/db run db:generate
RUN pnpm exec turbo run build --filter=api
RUN pnpm install --prod --frozen-lockfile --filter=api...

FROM node:24-slim AS runtime
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
CMD ["node", "apps/api/dist/main"]
