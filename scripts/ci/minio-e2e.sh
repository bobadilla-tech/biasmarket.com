#!/usr/bin/env bash

# Shared disposable MinIO setup for the API and web E2E jobs.
# This file is sourced by the owning job script; it does not own a trap.

readonly MINIO_NETWORK="biasmarket-e2e"
readonly MINIO_CONTAINER="biasmarket-e2e-minio"
readonly MINIO_IMAGE="ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z@sha256:69b55a1c1c5dc285ce04db96689f5b2102317fc77a50680a1874ca6efd1c87f9"
readonly MINIO_ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
readonly MINIO_LOG="${MINIO_LOG:-.ci/e2e-minio.log}"

minio_run_mc() {
  docker run --rm \
    --entrypoint /usr/bin/mc \
    --network "$MINIO_NETWORK" \
    --volume "$MINIO_ROOT:/workspace:ro" \
    --env "MC_HOST_ci=http://${S3_ACCESS_KEY}:${S3_SECRET_KEY}@${MINIO_CONTAINER}:9000" \
    "$MINIO_IMAGE" "$@" >> "$MINIO_LOG" 2>&1
}

start_minio() {
  mkdir -p "$(dirname "$MINIO_LOG")"
  docker network create "$MINIO_NETWORK" > "$MINIO_LOG" 2>&1
  docker run --detach \
    --name "$MINIO_CONTAINER" \
    --network "$MINIO_NETWORK" \
    --publish 9000:9000 \
    --env MINIO_ROOT_USER="$S3_ACCESS_KEY" \
    --env MINIO_ROOT_PASSWORD="$S3_SECRET_KEY" \
    "$MINIO_IMAGE" server /data --console-address ":9001" >> "$MINIO_LOG" 2>&1

  for attempt in {1..60}; do
    if curl --fail --silent http://127.0.0.1:9000/minio/health/live >/dev/null; then
      break
    fi
    if [[ "$(docker inspect --format '{{.State.Running}}' "$MINIO_CONTAINER" 2>/dev/null)" != "true" ]]; then
      echo "::error::MinIO exited before its liveness endpoint became ready"
      return 1
    fi
    sleep 1
    if [[ "$attempt" -eq 60 ]]; then
      echo "::error::MinIO did not become ready within 60 seconds"
      return 1
    fi
  done

  minio_run_mc mb --ignore-existing "ci/$S3_BUCKET"
  minio_run_mc mb --ignore-existing "ci/$S3_LOGO_BUCKET"
  minio_run_mc mb --ignore-existing "ci/$S3_PAYMENT_BUCKET"
  minio_run_mc anonymous set download "ci/$S3_BUCKET"
  minio_run_mc anonymous set download "ci/$S3_LOGO_BUCKET"

  # Payment objects stay private. The API's authenticated streaming endpoint
  # reads this deterministic object for the seeded seller proof-lightbox case.
  minio_run_mc cp /workspace/apps/web/public/og-image.png \
    "ci/$S3_PAYMENT_BUCKET/payment-proof-fixture.png"
}

stop_minio() {
  set +e
  if docker inspect "$MINIO_CONTAINER" >/dev/null 2>&1; then
    docker logs "$MINIO_CONTAINER" > "$MINIO_LOG" 2>&1
    docker rm -f "$MINIO_CONTAINER" >/dev/null 2>&1
  fi
  docker network rm "$MINIO_NETWORK" >/dev/null 2>&1
  set -e
}
