#!/bin/sh
# Dev entrypoint for the `web` service (docker-compose.dev.yml). See
# api-dev.sh's header comment for why this lives in a script instead of an
# inline compose `command:`.
set -e

pnpm install --frozen-lockfile --filter="web..."

# `turbo watch` is deliberately not used for the pkg watcher: its daemon dies
# on Docker Desktop bind mounts ("filewatching failed to start: waiting for
# cookie timed out"), and `concurrently -k` then takes the whole container
# down. nodemon --legacy-watch polls, which works on every host FS.
#
# `exec` hands PID 1 to concurrently directly so shutdown signals reach it
# immediately instead of going through an intermediate shell.
exec pnpm exec concurrently -k -n pkg,dev \
  "pnpm exec nodemon --legacy-watch --ignore '**/dist/**' --ignore '**/node_modules/**' -e ts,json --delay 300ms --watch packages/i18n --watch packages/types --exec \"pnpm exec turbo run build --filter=@biasmarket/i18n --filter=@biasmarket/types\"" \
  "pnpm --filter web run dev"
