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
