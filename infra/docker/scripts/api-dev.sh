#!/bin/sh
# Dev entrypoint for the `api` service (docker-compose.dev.yml). Pulled out of
# the compose file's inline `command:` because that YAML folded scalar has
# already broken the `concurrently` invocation once (silently ate `\`
# line-continuations — see docs/plans/2026-07-16-docker-infra.md) and is hard
# to edit safely. A real script gets normal shell quoting instead.
set -e

pnpm install --frozen-lockfile --filter="api..."
pnpm --filter @biasmarket/db run db:generate
pnpm --filter @biasmarket/db exec prisma migrate deploy
pnpm exec turbo run build --filter=@biasmarket/i18n --filter=@biasmarket/types --filter=@biasmarket/utils
pnpm --filter api exec node scripts/seed/run.ts
pnpm --filter api exec nest build

# `exec` hands PID 1 to concurrently directly, so `docker stop`/compose down's
# SIGTERM reaches it (and its children) immediately instead of going through
# an intermediate shell that may not forward it.
#
# Watchers, one per process concurrently supervises:
#   pkg    - rebuilds a workspace package's dist/ the moment its source changes
#   schema - re-runs `prisma generate` when schema.prisma changes, so editing
#            the schema no longer requires a manual `docker compose restart
#            api` (previously a documented, manual-only gap — see
#            docs/plans/2026-07-29-multi-point-pickup-locations.md)
#   build  - Nest's own compile-only watch (no run)
#   run    - restarts `node dist/main.js` on any dependency dist change,
#            including the regenerated Prisma client from the `schema`
#            watcher above
exec pnpm exec concurrently -k -n pkg,schema,build,run \
  "pnpm exec turbo watch build --filter=@biasmarket/i18n --filter=@biasmarket/types --filter=@biasmarket/utils" \
  "pnpm exec nodemon --watch packages/db/prisma/schema.prisma -e prisma --delay 300ms --exec \"pnpm --filter @biasmarket/db run db:generate\"" \
  "pnpm --filter api exec nest build --watch" \
  "pnpm exec nodemon --watch apps/api/dist --watch packages/i18n/dist --watch packages/types/dist --watch packages/utils/dist --watch packages/db/generated -e js,json,ts --delay 300ms --exec 'node apps/api/dist/main.js'"
