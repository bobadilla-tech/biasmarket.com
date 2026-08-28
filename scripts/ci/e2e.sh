#!/usr/bin/env bash

set -Eeuo pipefail

readonly ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
readonly NETWORK="biasmarket-e2e"
readonly MINIO_CONTAINER="biasmarket-e2e-minio"
# Digest resolved 2026-08-28: minio/minio:latest and minio/mc:latest.
readonly MINIO_IMAGE="docker.io/minio/minio:latest@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e"
readonly MC_IMAGE="docker.io/minio/mc:latest@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727"
readonly MINIO_ACCESS_KEY="e2e"
readonly MINIO_SECRET_KEY="e2e-secret-key"

WORKER_PID=""

cd "$ROOT"

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  set +e

  if [[ -n "$WORKER_PID" ]]; then
    if kill -0 "$WORKER_PID" 2>/dev/null; then
      kill "$WORKER_PID"
    fi
    wait "$WORKER_PID"
    if kill -0 "$WORKER_PID" 2>/dev/null; then
      echo "::error::Workers process $WORKER_PID did not exit after SIGTERM"
      [[ "$status" -eq 0 ]] && status=1
    fi
  fi

  if docker inspect "$MINIO_CONTAINER" >/dev/null 2>&1; then
    docker logs "$MINIO_CONTAINER" > .ci/e2e-minio.log 2>&1
    docker rm -f "$MINIO_CONTAINER" >/dev/null 2>&1
  fi
  docker network rm "$NETWORK" >/dev/null 2>&1
  rm -rf apps/workers/.mailer-dev

  exit "$status"
}
trap cleanup EXIT INT TERM

mkdir -p .ci
rm -f .ci/e2e-{api,workers,migrate,minio,openapi,suite}.log
rm -rf apps/workers/.mailer-dev

echo "Starting MinIO on the E2E-only Docker network"
docker network create "$NETWORK" > .ci/e2e-minio.log 2>&1
docker run --detach \
  --name "$MINIO_CONTAINER" \
  --network "$NETWORK" \
  --publish 9000:9000 \
  --env MINIO_ROOT_USER="$MINIO_ACCESS_KEY" \
  --env MINIO_ROOT_PASSWORD="$MINIO_SECRET_KEY" \
  "$MINIO_IMAGE" server /data --console-address ":9001" >> .ci/e2e-minio.log 2>&1

for attempt in {1..60}; do
  if curl --fail --silent http://127.0.0.1:9000/minio/health/live >/dev/null; then
    break
  fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "$MINIO_CONTAINER" 2>/dev/null)" != "true" ]]; then
    echo "::error::MinIO exited before its liveness endpoint became ready"
    exit 1
  fi
  sleep 1
  if [[ "$attempt" -eq 60 ]]; then
    echo "::error::MinIO did not become ready within 60 seconds"
    exit 1
  fi
done

run_mc() {
  docker run --rm \
    --network "$NETWORK" \
    --env "MC_HOST_ci=http://${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}@${MINIO_CONTAINER}:9000" \
    "$MC_IMAGE" "$@" >> .ci/e2e-minio.log 2>&1
}

run_mc mb --ignore-existing ci/products
run_mc mb --ignore-existing ci/logos
run_mc mb --ignore-existing ci/payments
run_mc anonymous set download ci/products
run_mc anonymous set download ci/logos

echo "Waiting for PostgreSQL and Redis service containers"
for attempt in {1..60}; do
  if pg_isready -h 127.0.0.1 -p 5432 -U ci -d ci >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "::error::PostgreSQL did not become ready within 60 seconds"
    exit 1
  fi
  sleep 1
done

for attempt in {1..60}; do
  if redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -qx PONG; then
    break
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "::error::Redis did not become ready within 60 seconds"
    exit 1
  fi
  sleep 1
done

pnpm --filter @biasmarket/db db:generate
pnpm turbo run build --filter=api --filter=workers

{
  set -euo pipefail
  test -s apps/api/openapi.json
  git ls-files --error-unmatch apps/api/openapi.json
  node apps/api/scripts/generate-openapi-spec.ts
  # Keep the generated JSON's compact-array formatting stable; the file is
  # intentionally excluded from the repo-wide Prettier pass.
  pnpm exec prettier --ignore-path /dev/null --parser json --write apps/api/openapi.json
  git diff --exit-code -- apps/api/openapi.json
} > .ci/e2e-openapi.log 2>&1

pnpm --filter @biasmarket/db exec prisma migrate deploy > .ci/e2e-migrate.log 2>&1

(
  cd "$ROOT"
  exec env \
    REDIS_URL="$REDIS_URL" \
    INTERNAL_API_URL="http://127.0.0.1:3000" \
    INTERNAL_JOBS_SECRET="$INTERNAL_JOBS_SECRET" \
    MAIL_DRIVER=file \
    E2E_DISABLE_EXPIRATION_SCHEDULERS=true \
    node apps/workers/dist/main.js
) > .ci/e2e-workers.log 2>&1 &
WORKER_PID=$!

worker_is_alive() {
  kill -0 "$WORKER_PID" 2>/dev/null
}

wait_for_worker_log() {
  local message="$1"
  for attempt in {1..60}; do
    if grep -Fq "$message" .ci/e2e-workers.log; then
      return 0
    fi
    if ! worker_is_alive; then
      echo "::error::Workers exited before logging: $message"
      cat .ci/e2e-workers.log
      exit 1
    fi
    sleep 1
  done
  echo "::error::Workers did not log readiness marker within 60 seconds: $message"
  cat .ci/e2e-workers.log
  exit 1
}

for attempt in {1..60}; do
  if curl --fail --silent http://127.0.0.1:3002/health >/dev/null; then
    break
  fi
  if ! worker_is_alive; then
    echo "::error::Workers exited before /health became ready"
    cat .ci/e2e-workers.log
    exit 1
  fi
  sleep 1
  if [[ "$attempt" -eq 60 ]]; then
    echo "::error::Workers /health did not become ready within 60 seconds"
    cat .ci/e2e-workers.log
    exit 1
  fi
done

wait_for_worker_log "orders expiration scheduler disabled (E2E_DISABLE_EXPIRATION_SCHEDULERS)"
wait_for_worker_log "premium expiration scheduler disabled (E2E_DISABLE_EXPIRATION_SCHEDULERS)"
wait_for_worker_log "MAILER worker ready"

pnpm --filter api test:e2e > .ci/e2e-suite.log 2>&1
