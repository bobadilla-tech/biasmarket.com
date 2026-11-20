#!/usr/bin/env bash
# Run the production backup path against disposable pinned Postgres and MinIO
# containers, then restore its real Restic snapshot into clean services.
set -Eeuo pipefail

ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
source "$ROOT/scripts/ci/e2e-images.sh"

RUN_SUFFIX="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"
NETWORK="biasmarket-backup-restore-${RUN_SUFFIX}"
PG_SOURCE="biasmarket-pg-source-${RUN_SUFFIX}"
PG_RESTORE="biasmarket-pg-restore-${RUN_SUFFIX}"
MINIO_SOURCE="biasmarket-minio-source-${RUN_SUFFIX}"
MINIO_RESTORE="biasmarket-minio-restore-${RUN_SUFFIX}"
CREATED_CONTAINERS=()
NETWORK_CREATED=0
PG_IMAGE="$(e2e_image_tag "$E2E_POSTGRES_REF")"
MINIO_IMAGE="$(e2e_image_tag "$E2E_MINIO_REF")"
BACKUP_IMAGE="biasmarket-backup-restore:${GITHUB_SHA:-local}"
TEMP_ROOT="$(mktemp -d "${RUNNER_TEMP:-/tmp}/biasmarket-backup-restore.XXXXXX")"
ACCESS_KEY="backup-ci-access"
SECRET_KEY="ephemeral-backup-ci-secret"
DB_PASSWORD="ephemeral-backup-ci-db-password"

cleanup() {
  local status=$?
  if ((status != 0)) && ((${#CREATED_CONTAINERS[@]} > 0)); then
    for container in "${CREATED_CONTAINERS[@]}"; do
      if docker inspect "$container" >/dev/null 2>&1; then
        echo "--- logs: $container ---" >&2
        docker logs "$container" 2>&1 | tail -80 >&2 || true
      fi
    done
  fi
  if ((${#CREATED_CONTAINERS[@]} > 0)); then
    docker rm --force --volumes "${CREATED_CONTAINERS[@]}" >/dev/null 2>&1 || true
  fi
  if ((NETWORK_CREATED)); then
    docker network rm "$NETWORK" >/dev/null 2>&1 || true
  fi
  sudo rm -rf -- "$TEMP_ROOT" || true
  exit "$status"
}
trap cleanup EXIT

e2e_ensure_image "$E2E_POSTGRES_REF"
e2e_ensure_image "$E2E_MINIO_REF"
docker build --file "$ROOT/infra/docker/backup.Dockerfile" --tag "$BACKUP_IMAGE" "$ROOT"
docker network create "$NETWORK" >/dev/null
NETWORK_CREATED=1

docker run --detach --name "$PG_SOURCE" --network "$NETWORK" --network-alias postgres-source \
  --env POSTGRES_USER=backup_ci --env "POSTGRES_PASSWORD=$DB_PASSWORD" \
  --env POSTGRES_DB=backup_ci "$PG_IMAGE" >/dev/null
CREATED_CONTAINERS+=("$PG_SOURCE")
docker run --detach --name "$PG_RESTORE" --network "$NETWORK" --network-alias postgres-restore \
  --env POSTGRES_USER=backup_ci --env "POSTGRES_PASSWORD=$DB_PASSWORD" \
  --env POSTGRES_DB=backup_ci "$PG_IMAGE" >/dev/null
CREATED_CONTAINERS+=("$PG_RESTORE")

docker run --detach --name "$MINIO_SOURCE" --network "$NETWORK" --network-alias minio-source \
  --env MINIO_ROOT_USER="$ACCESS_KEY" --env MINIO_ROOT_PASSWORD="$SECRET_KEY" \
  "$MINIO_IMAGE" server /data --console-address ":9001" >/dev/null
CREATED_CONTAINERS+=("$MINIO_SOURCE")
docker run --detach --name "$MINIO_RESTORE" --network "$NETWORK" --network-alias minio-restore \
  --env MINIO_ROOT_USER="$ACCESS_KEY" --env MINIO_ROOT_PASSWORD="$SECRET_KEY" \
  "$MINIO_IMAGE" server /data --console-address ":9001" >/dev/null
CREATED_CONTAINERS+=("$MINIO_RESTORE")

mkdir -p "$TEMP_ROOT/stage" "$TEMP_ROOT/repository"
sudo chown -R 10001:10001 "$TEMP_ROOT/stage" "$TEMP_ROOT/repository"
sudo chmod 0700 "$TEMP_ROOT/stage" "$TEMP_ROOT/repository"

docker run --rm --network "$NETWORK" --user 10001:10001 \
  --entrypoint python3 \
  --volume "$ROOT/infra/vps/tests/backup_restore_integration.py:/test/backup_restore_integration.py:ro" \
  --volume "$TEMP_ROOT/stage:/stage" \
  --volume "$TEMP_ROOT/repository:/repo" \
  --env BIASMARKET_BACKUP_TEST_MODE=1 \
  --env RESTIC_REPOSITORY=/repo \
  --env RESTIC_PASSWORD=ephemeral-restic-test-password-at-least-32-chars \
  --env AWS_ACCESS_KEY_ID=ephemeral-ci-access \
  --env AWS_SECRET_ACCESS_KEY=ephemeral-ci-secret \
  --env AWS_DEFAULT_REGION=us-east-1 \
  --env BACKUP_SOURCE_ENDPOINT="http://${MINIO_SOURCE}:9000" \
  --env BACKUP_SOURCE_ACCESS_KEY="$ACCESS_KEY" \
  --env BACKUP_SOURCE_SECRET_KEY="$SECRET_KEY" \
  --env PGHOST="$PG_SOURCE" --env PGPORT=5432 \
  --env PGUSER=backup_ci --env "PGPASSWORD=$DB_PASSWORD" --env PGDATABASE=backup_ci \
  --env BACKUP_STAGE_DIR=/stage \
  --env S3_BUCKET=products --env S3_LOGO_BUCKET=logos --env S3_PAYMENT_BUCKET=payments \
  --env KUMA_BACKUP_PUSH_URL=https://status.invalid/api/push/ephemeral-test-token \
  --env RESTORE_MINIO_ENDPOINT="http://${MINIO_RESTORE}:9000" \
  --env RESTORE_PGHOST="$PG_RESTORE" --env RESTORE_PGPORT=5432 \
  --env RESTORE_PGUSER=backup_ci --env "RESTORE_PGPASSWORD=$DB_PASSWORD" \
  --env RESTORE_PGDATABASE=backup_ci \
  "$BACKUP_IMAGE" /test/backup_restore_integration.py
