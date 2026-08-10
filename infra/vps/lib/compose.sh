#!/usr/bin/env bash
# compose() — the ONLY way any script in this tree should invoke `docker
# compose` against infra/vps/docker-compose.yml. Builds a per-invocation
# temp env file (env/shared.env's contents, so ${POSTGRES_USER}-style
# compose-file interpolation resolves, plus IMAGE_TAG=<sha>) and passes it
# via --env-file. See docker-compose.yml's header comment for why this is
# needed instead of relying on Compose's default `.env` auto-discovery.
#
# IMAGE_TAG must already be exported by the caller before compose() is
# called (deploy.sh sets it once it has determined the candidate SHA).
# Never leaves the temp file behind: trapped cleanup on RETURN.

compose() {
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN

  if [[ -f "$ENV_DIR/shared.env" ]]; then
    cat "$ENV_DIR/shared.env" >"$tmp"
  fi
  printf '\nIMAGE_TAG=%s\n' "${IMAGE_TAG:?compose(): IMAGE_TAG is not set}" >>"$tmp"

  docker compose -f "$ROOT_DIR/docker-compose.yml" --env-file "$tmp" "$@"
}

# compose_running_container SERVICE — echoes the running container ID for a
# compose service, never a hardcoded container name (no service in this
# stack sets container_name:).
compose_running_container() {
  local service="$1"
  compose ps -q "$service"
}

# running_image_sha COLOR — echoes the image tag (the :sha suffix) a color's
# running api container was started with, or nothing if it has no inspectable
# container. Callers must export IMAGE_TAG first (compose() needs it even for
# `ps`). Used by --rollback so a recreate-on-recovery restores the pre-fault
# release instead of re-pulling the live (possibly faulty) tag.
running_image_sha() {
  local color="$1" cid image
  cid="$(compose_running_container "api-${color}" 2>/dev/null || true)"
  if [[ -n "$cid" ]]; then
    image="$(docker inspect --format='{{index .Config.Image}}' "$cid" 2>/dev/null || true)"
    if [[ -n "$image" ]]; then
      echo "${image##*:}"
      return 0
    fi
  fi
  return 0
}
