#!/usr/bin/env bash

# Disposable PostgreSQL + Redis (Valkey) for the API and web E2E jobs,
# published on the same localhost ports the former `services:` containers
# used (DATABASE_URL/REDIS_URL in e2e.env.example are unchanged).
#
# To run the gate on a machine that already has Postgres/Redis on the default
# ports, set E2E_POSTGRES_PORT / E2E_REDIS_PORT (host ports; defaults 5432 and
# 6379). start_datastores rewrites the port in the exported DATABASE_URL /
# REDIS_URL so later steps in the same script connect to the right place.
# This file is sourced by the owning job script; it does not own a trap.

source "${GITHUB_WORKSPACE:-$(pwd)}/scripts/ci/e2e-images.sh"

readonly E2E_POSTGRES_CONTAINER="biasmarket-e2e-postgres"
readonly E2E_REDIS_CONTAINER="biasmarket-e2e-redis"
readonly E2E_POSTGRES_PORT="${E2E_POSTGRES_PORT:-5432}"
readonly E2E_REDIS_PORT="${E2E_REDIS_PORT:-6379}"

start_datastores() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed -E "s#(@[^/:?]+):[0-9]+/#\\1:${E2E_POSTGRES_PORT}/#")"
    export DATABASE_URL
  fi
  if [[ -n "${REDIS_URL:-}" ]]; then
    REDIS_URL="$(printf '%s' "$REDIS_URL" | sed -E "s#(://[^/:?@]+):[0-9]+\$#\\1:${E2E_REDIS_PORT}#")"
    export REDIS_URL
  fi

  e2e_ensure_image "$E2E_POSTGRES_REF"
  e2e_ensure_image "$E2E_REDIS_REF"

  docker run --detach \
    --name "$E2E_POSTGRES_CONTAINER" \
    --publish "${E2E_POSTGRES_PORT}:5432" \
    --env POSTGRES_USER=ci \
    --env POSTGRES_PASSWORD=ci \
    --env POSTGRES_DB=ci \
    "$(e2e_image_tag "$E2E_POSTGRES_REF")" >/dev/null

  docker run --detach \
    --name "$E2E_REDIS_CONTAINER" \
    --publish "${E2E_REDIS_PORT}:6379" \
    "$(e2e_image_tag "$E2E_REDIS_REF")" >/dev/null

  # Probe from inside the containers so the host needs no client tools. The
  # postgres entrypoint restarts the server once after init, so require the
  # TCP listener (-h 127.0.0.1), which only comes up on the final start.
  for attempt in {1..60}; do
    if docker exec "$E2E_POSTGRES_CONTAINER" pg_isready -h 127.0.0.1 -U ci -d ci >/dev/null 2>&1; then
      break
    fi
    if [[ "$attempt" -eq 60 ]]; then
      echo "::error::PostgreSQL did not become ready within 60 seconds"
      docker logs "$E2E_POSTGRES_CONTAINER" 2>&1 | tail -50
      return 1
    fi
    sleep 1
  done

  for attempt in {1..60}; do
    if [[ "$(docker exec "$E2E_REDIS_CONTAINER" redis-cli ping 2>/dev/null)" == "PONG" ]]; then
      break
    fi
    if [[ "$attempt" -eq 60 ]]; then
      echo "::error::Redis did not become ready within 60 seconds"
      docker logs "$E2E_REDIS_CONTAINER" 2>&1 | tail -50
      return 1
    fi
    sleep 1
  done
}

stop_datastores() {
  docker rm -f "$E2E_POSTGRES_CONTAINER" "$E2E_REDIS_CONTAINER" >/dev/null 2>&1 || true
}
