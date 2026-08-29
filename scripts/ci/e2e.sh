#!/usr/bin/env bash

set -Eeuo pipefail

readonly ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
readonly NETWORK="biasmarket-e2e"
readonly MINIO_CONTAINER="biasmarket-e2e-minio"
# Digest resolved 2026-08-28: ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z.
# The GHCR image includes both the MinIO server and the mc client binary.
readonly MINIO_IMAGE="ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z@sha256:69b55a1c1c5dc285ce04db96689f5b2102317fc77a50680a1874ca6efd1c87f9"

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
  --env MINIO_ROOT_USER="$S3_ACCESS_KEY" \
  --env MINIO_ROOT_PASSWORD="$S3_SECRET_KEY" \
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
    --entrypoint /usr/bin/mc \
    --network "$NETWORK" \
    --env "MC_HOST_ci=http://${S3_ACCESS_KEY}:${S3_SECRET_KEY}@${MINIO_CONTAINER}:9000" \
    "$MINIO_IMAGE" "$@" >> .ci/e2e-minio.log 2>&1
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
  if (exec 3<>/dev/tcp/127.0.0.1/6379) 2>/dev/null; then
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
  bash scripts/ci/check-openapi-drift.sh
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
