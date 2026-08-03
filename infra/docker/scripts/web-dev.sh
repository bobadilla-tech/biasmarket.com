#!/bin/sh
# Dev entrypoint for the `web` service (docker-compose.dev.yml). See
# api-dev.sh's header comment for why this lives in a script instead of an
# inline compose `command:`.
set -e

pnpm install --frozen-lockfile --filter="web..."

# `exec` hands PID 1 to concurrently directly so shutdown signals reach it
# immediately instead of going through an intermediate shell.
exec pnpm exec concurrently -k -n pkg,dev \
  "pnpm exec turbo watch build --filter=@biasmarket/i18n --filter=@biasmarket/types" \
  "pnpm --filter web run dev"
