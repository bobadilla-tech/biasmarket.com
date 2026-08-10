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
# Never leaves the temp file behind: explicit rm after the call, exit code
# preserved.
#
# NOT `trap 'rm -f "$tmp"' RETURN` (what this used to be): that trap fires
# correctly on compose()'s own return, but then stays armed and misfires
# again on the NEXT enclosing function's return too — by which point this
# $tmp is already out of scope, raising "tmp: unbound variable" under
# set -u. Only surfaced once something called compose() from one level
# inside a small function that returns right after (smoke_api_direct/
# smoke_web_direct in lib/smoke.sh) — every other call site invokes it
# directly from cmd_deploy's/wait_for_healthy's own top-level flow.
compose() {
  local tmp rc
  tmp="$(mktemp)"

  if [[ -f "$ENV_DIR/shared.env" ]]; then
    cat "$ENV_DIR/shared.env" >"$tmp"
  fi
  printf '\nIMAGE_TAG=%s\n' "${IMAGE_TAG:?compose(): IMAGE_TAG is not set}" >>"$tmp"

  rc=0
  docker compose -f "$ROOT_DIR/docker-compose.yml" --env-file "$tmp" "$@" || rc=$?
  rm -f "$tmp"
  return "$rc"
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
