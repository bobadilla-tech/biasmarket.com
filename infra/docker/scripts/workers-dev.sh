#!/bin/sh
# Dev entrypoint for the `workers` service (docker-compose.dev.yml). Mirrors
# api-dev.sh's shape, scoped down to what workers actually needs — no
# database, no seed step, one workspace dependency (packages/queue).
set -e

pnpm install --frozen-lockfile --filter="workers..."
pnpm exec turbo run build --filter=@biasmarket/queue
pnpm --filter workers exec nest build

# `exec` hands PID 1 to concurrently directly, so `docker stop`/compose down's
# SIGTERM reaches it (and its children) immediately instead of going through
# an intermediate shell that may not forward it.
#
# Watchers, one per process concurrently supervises:
#   pkg   - rebuilds packages/queue's dist/ the moment its source changes
#   build - Nest's own compile-only watch (no run)
#   run   - restarts `node dist/main.js` on any dependency dist change
exec pnpm exec concurrently -k -n pkg,build,run \
  "pnpm exec turbo watch build --filter=@biasmarket/queue" \
  "pnpm --filter workers exec nest build --watch" \
  "pnpm exec nodemon --watch apps/workers/dist --watch packages/queue/dist -e js,json,ts --delay 300ms --exec 'node apps/workers/dist/main.js'"
