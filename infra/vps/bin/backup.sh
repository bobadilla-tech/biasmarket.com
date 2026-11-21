#!/usr/bin/env bash
# Root-owned systemd entrypoint. Installed under /usr/local/sbin so the
# deploy rsync key cannot replace code that systemd executes as root.
set -Eeuo pipefail

APP_ROOT=/home/deploy/biasmarket
COMPOSE_FILE=/etc/biasmarket-backup-compose.yml
STAGE_DIR=/var/lib/biasmarket-backup/stage
RECOVERY_MARKER=/var/lib/biasmarket-backup/container-cleanup-required
LOCK_FILE=/run/lock/biasmarket-backup.lock

if [[ "$(id -u)" -ne 0 ]]; then
  echo "backup.sh must run as root" >&2
  exit 1
fi

tag="$(cat "$APP_ROOT/state/current_sha" 2>/dev/null || true)"
if [[ ! "$tag" =~ ^[0-9a-f]{40}$ ]]; then
  echo "state/current_sha is missing or invalid; refusing to run backup" >&2
  exit 1
fi

for required_file in \
  "$APP_ROOT/env/backup.env" \
  "$APP_ROOT/env/shared.env" \
  "$COMPOSE_FILE"; do
  if [[ ! -f "$required_file" ]]; then
    echo "required backup file is missing: $required_file" >&2
    exit 1
  fi
done

read -r env_owner env_mode < <(stat -c '%u %a' "$APP_ROOT/env/backup.env")
if [[ "$env_owner" != 0 || "$env_mode" != 600 ]]; then
  echo "env/backup.env must be root-owned with mode 0600" >&2
  exit 1
fi
read -r shared_owner shared_mode < <(stat -c '%u %a' "$APP_ROOT/env/shared.env")
deploy_uid="$(id -u deploy)"
if [[ ("$shared_owner" != 0 && "$shared_owner" != "$deploy_uid") || "$shared_mode" != 600 ]]; then
  echo "env/shared.env must be root- or deploy-owned with mode 0600" >&2
  exit 1
fi

install -d -o root -g root -m 0711 "${STAGE_DIR%/stage}"
install -d -o 10001 -g 10001 -m 0700 "$STAGE_DIR"
umask 077
exec 9>"$LOCK_FILE"
if ! flock --exclusive --nonblock 9; then
  echo "a Bias Market backup is already running" >&2
  exit 75
fi
if [[ -e "$RECOVERY_MARKER" ]]; then
  echo "backup container cleanup requires operator verification; see $RECOVERY_MARKER" >&2
  exit 1
fi

container_id=""
stop_container() {
  local id="$1"
  local running
  docker stop --time 30 "$id" >/dev/null 2>&1 || true
  docker wait "$id" >/dev/null 2>&1 || true
  running="$(docker inspect --format '{{.State.Running}}' "$id" 2>/dev/null || echo unknown)"
  if [[ "$running" != false ]]; then
    return 1
  fi
  docker rm "$id" >/dev/null 2>&1 || true
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "$container_id" ]]; then
    if ! stop_container "$container_id"; then
      install -m 0600 /dev/null "$RECOVERY_MARKER"
      echo "could not confirm backup container stopped; future captures are blocked by $RECOVERY_MARKER" >&2
      status=1
    fi
    container_id=""
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

container_ids="$(docker ps -aq \
  --filter label=com.docker.compose.project=biasmarket \
  --filter label=com.docker.compose.service=backup \
  --filter label=com.docker.compose.oneoff=True)"
if [[ -n "$container_ids" ]]; then
  while IFS= read -r stale_id; do
    [[ -n "$stale_id" ]] || continue
    if ! stop_container "$stale_id"; then
      install -m 0600 /dev/null "$RECOVERY_MARKER"
      echo "could not confirm stale backup container stopped; future captures are blocked by $RECOVERY_MARKER" >&2
      exit 1
    fi
  done <<<"$container_ids"
fi
rm -rf -- "$STAGE_DIR/payload"

for service in db minio; do
  healthy=false
  for _ in {1..30}; do
    container_ids="$(docker ps -q \
      --filter label=com.docker.compose.project=biasmarket \
      --filter "label=com.docker.compose.service=$service")"
    if [[ -n "$container_ids" ]]; then
      while IFS= read -r service_id; do
        [[ -n "$service_id" ]] || continue
        health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$service_id")"
        if [[ "$health" == healthy || "$health" == running ]]; then
          healthy=true
          break
        fi
      done <<<"$container_ids"
    fi
    [[ "$healthy" == true ]] && break
    sleep 2
  done
  if [[ "$healthy" != true ]]; then
    echo "Bias Market $service service is not healthy; refusing to run backup" >&2
    exit 1
  fi
done

container_id="$(IMAGE_TAG="$tag" docker compose \
  --project-name biasmarket \
  --file "$COMPOSE_FILE" \
  --env-file "$APP_ROOT/env/shared.env" \
  run --detach backup)"
if [[ ! "$container_id" =~ ^[0-9a-f]{12,64}$ ]]; then
  echo "docker compose did not return a valid backup container ID" >&2
  exit 1
fi

container_status="$(docker wait "$container_id")"
docker rm "$container_id" >/dev/null
container_id=""
if [[ "$container_status" != 0 ]]; then
  echo "backup container exited with status $container_status" >&2
  exit "$container_status"
fi

trap - EXIT INT TERM
