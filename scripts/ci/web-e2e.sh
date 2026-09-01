#!/usr/bin/env bash

# Web accessibility / responsive E2E (audit Phase 0).
#
# jsdom cannot see contrast, focus-visibility, reflow, real screen-reader
# announcement, portal theming, or nested focus — those checks run here, in a
# real browser against a real `next start` build talking to a real API.
#
# The API E2E suite still runs workers and an in-process Nest app via supertest;
# it never boots a standalone HTTP API, never serves web, and never seeds. This
# script reuses only the shared MinIO bootstrap and stands up its own stack:
#   - prisma migrate deploy + `seed:base`  (needs Postgres, provided as a CI
#     service container; DATABASE_URL etc. come from scripts/ci/load-e2e-env.sh)
#   - `node apps/api/dist/main.js` on :3000   (health-gated, torn down on exit)
#   - `next start` for apps/web on :3001      (health-gated, torn down on exit)
#   - `playwright test`  (WEB_E2E_BASE_URL is exported so the Playwright config
#     does NOT try to manage the web server itself)
#
# Browsers are installed by the workflow step before this runs (needs apt).
# MinIO is started here because this job boots a standalone API process instead
# of reusing the API E2E process.

set -Eeuo pipefail

readonly ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
readonly API_URL="http://127.0.0.1:3000"
readonly WEB_URL_LOCAL="http://127.0.0.1:3001"
source "$ROOT/scripts/ci/minio-e2e.sh"

API_PID=""
WEB_PID=""

cd "$ROOT"
mkdir -p .ci
rm -f .ci/web-e2e-api.log .ci/web-e2e-web.log

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  set +e

  for pid in "$WEB_PID" "$API_PID"; do
    [[ -z "$pid" ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      wait "$pid" 2>/dev/null
    fi
  done

  stop_minio

  exit "$status"
}
trap cleanup EXIT INT TERM

echo "--- Start MinIO and seed private proof fixture"
start_minio

wait_for_http() {
  local url="$1" name="$2" pid="$3" log="$4"
  for _ in $(seq 1 60); do
    if curl --fail --silent --output /dev/null "$url"; then
      return 0
    fi
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      echo "::error::$name exited before $url became ready"
      cat "$log"
      exit 1
    fi
    sleep 2
  done
  echo "::error::$name did not become ready at $url within 120s"
  cat "$log"
  exit 1
}

echo "--- Prisma client + schema"
pnpm --filter @biasmarket/db db:generate
pnpm --filter @biasmarket/db exec prisma migrate deploy

echo "--- Build api + web"
NEXT_PUBLIC_API_URL="http://localhost:3000" \
  pnpm turbo run build --filter=api --filter=web

echo "--- Seed base fixtures"
pnpm --filter api run seed:base

# `e2e.env.example` sets WEB_URL to `http://localhost:3001`, but this script
# serves web on `127.0.0.1` (WEB_URL_LOCAL) and Playwright drives it there — so
# the browser's `Origin` on a cross-origin auth call is `http://127.0.0.1:3001`.
# better-auth >=1.7 force-validates that Origin against `trustedOrigins` even on
# a cookieless first sign-in (its new Fetch-Metadata form-CSRF check), so
# `trustedOrigins` (derived from WEB_URL) must name the host the browser
# actually uses, not `localhost`.
echo "--- Start API on :3000"
(
  cd "$ROOT"
  exec env PORT=3000 WEB_URL="$WEB_URL_LOCAL" node apps/api/dist/main.js
) > .ci/web-e2e-api.log 2>&1 &
API_PID=$!
wait_for_http "$API_URL/api/health" "API" "$API_PID" .ci/web-e2e-api.log

echo "--- Start web on :3001"
(
  cd "$ROOT"
  exec env \
    PORT=3001 \
    NODE_ENV=production \
    NEXT_PUBLIC_API_URL="http://localhost:3000" \
    INTERNAL_API_URL="http://localhost:3000" \
    pnpm --filter web exec next start -p 3001
) > .ci/web-e2e-web.log 2>&1 &
WEB_PID=$!
wait_for_http "$WEB_URL_LOCAL/es" "Web" "$WEB_PID" .ci/web-e2e-web.log

echo "--- Playwright"
WEB_E2E_BASE_URL="$WEB_URL_LOCAL" pnpm --filter web exec playwright test
