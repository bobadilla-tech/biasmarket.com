#!/usr/bin/env bash
# Blue/green deploy state machine for the Bias Market VPS stack. Lives at
# infra/vps/deploy.sh in the repo, synced to /opt/biasmarket/deploy.sh (see
# T9 provisioning + cd.yml's rsync step) — ROOT_DIR is resolved from this
# script's own location so it works from either path.
#
# Usage:
#   deploy.sh <40-hex-sha> [--force] [--i-understand-this-is-destructive]
#   deploy.sh --rollback
#   deploy.sh --cleanup
#   deploy.sh --bootstrap <40-hex-sha>
#
# Invoked either directly by an operator (all four forms) or, for the first
# three, via the restricted SSH dispatcher (see bin/ssh-deploy-dispatcher.sh)
# under `setsid`, detached from the SSH transport. See
# docs/core/blue-green-migrations.md for the full phase-by-phase writeup.
#
# NEVER `set -x` anywhere in this file or the libs it sources — several
# commands below embed secrets (DATABASE_URL with credentials) and this
# repo is public; GitHub Actions / systemd-journal logs get zero automatic
# masking for VPS-only values. `set -e` alone is fine.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
# shellcheck source=lib/log.sh
source "$ROOT_DIR/lib/log.sh"
# shellcheck source=lib/state.sh
source "$ROOT_DIR/lib/state.sh"
# shellcheck source=lib/lock.sh
source "$ROOT_DIR/lib/lock.sh"
# shellcheck source=lib/compose.sh
source "$ROOT_DIR/lib/compose.sh"
# shellcheck source=lib/caddy.sh
source "$ROOT_DIR/lib/caddy.sh"
# shellcheck source=lib/health.sh
source "$ROOT_DIR/lib/health.sh"
# shellcheck source=lib/smoke.sh
source "$ROOT_DIR/lib/smoke.sh"
# shellcheck source=lib/migrate.sh
source "$ROOT_DIR/lib/migrate.sh"

HEALTH_TIMEOUT_SECONDS=120
CANARY_WEIGHT=1        # out of 10, i.e. candidate gets 10% during the hold
CANARY_HOLD_SECONDS=30

CURRENT_SHA_FOR_RESULT=""
LAST_PHASE="init"
RUN_STARTED_AT="$(date +%s)"
PHASE_STARTED_AT="$RUN_STARTED_AT"

# Final action on every exit path, success or failure: an atomic,
# secret-free write to state/last_deploy_result (SHA, outcome, phase
# reached, timestamp — nothing from env/*.env). The CD workflow polls this
# file instead of blocking on the SSH session.
on_exit() {
  local ec=$?
  if [[ -n "$CURRENT_SHA_FOR_RESULT" ]]; then
    if [[ $ec -eq 0 ]]; then
      write_last_deploy_result "$CURRENT_SHA_FOR_RESULT" "success" "$LAST_PHASE"
    else
      write_last_deploy_result "$CURRENT_SHA_FOR_RESULT" "failure" "$LAST_PHASE"
    fi
  fi
  return $ec
}
trap on_exit EXIT

phase() {
  local now elapsed total
  now="$(date +%s)"
  elapsed=$((now - PHASE_STARTED_AT))
  total=$((now - RUN_STARTED_AT))
  LAST_PHASE="$1"
  update_lock_phase "$LAST_PHASE"
  log_info "phase: $1 phase_elapsed=${elapsed}s total_elapsed=${total}s"
  PHASE_STARTED_AT="$now"
}

teardown_candidate() {
  local color="$1"
  log_warn "Tearing down candidate color=$color"
  compose stop "api-${color}" "web-${color}" "workers-${color}" 2>/dev/null || true
  compose rm -f "api-${color}" "web-${color}" "workers-${color}" 2>/dev/null || true
}

# State/reality reconciliation at the very start of every run: before
# trusting state/current_color for anything, assert it matches the actual
# live content of caddy/active/api.caddy. Closes the gap where a crash
# between the Caddy switch and the state-file write would otherwise leave
# the next run computing the wrong candidate and, on its own failure path,
# tearing down actual production.
reconcile_state_with_reality() {
  local recorded actual
  recorded="$(state_read "$CURRENT_COLOR_FILE")"
  [[ -z "$recorded" ]] && return 0 # never bootstrapped — nothing to reconcile yet

  actual="$(active_config_color "$CADDY_ACTIVE_DIR/api.caddy")"
  if [[ -z "$actual" ]]; then
    die "Cannot determine live Caddy color from caddy/active/api.caddy — refusing to proceed until resolved manually. state/current_color says '$recorded'."
  fi
  if [[ "$actual" != "$recorded" ]]; then
    die "State/reality mismatch: state/current_color='$recorded' but caddy/active/api.caddy is actually live-pointed at '$actual'. A prior run likely crashed between the Caddy switch and the state-file write. Resolve manually (confirm which color is really serving traffic) before deploying again."
  fi
}

# Owns the env/shared.env checksum assertion on every invocation — an
# accidental future regeneration (e.g. someone runs `pnpm env:init --prod`
# against this file by mistake) fails loud immediately instead of only
# being caught once. First run with no recorded baseline records one.
assert_shared_env_checksum() {
  [[ -f "$ENV_DIR/shared.env" ]] || die "env/shared.env is missing — copy it from a real production infra/docker/.env first, see env/shared.env.example."
  local actual
  actual="$(sha256sum "$ENV_DIR/shared.env" | cut -d' ' -f1)"
  if [[ ! -f "$SHARED_ENV_CHECKSUM_FILE" ]]; then
    log_warn "No recorded env/shared.env checksum yet — recording the current value as the known-good baseline (expected only on first bootstrap)."
    atomic_write "$SHARED_ENV_CHECKSUM_FILE" "$actual"
    return 0
  fi
  local expected
  expected="$(cat "$SHARED_ENV_CHECKSUM_FILE")"
  if [[ "$actual" != "$expected" ]]; then
    die "env/shared.env checksum mismatch (expected $expected, got $actual). It changed since the last recorded baseline. NEVER regenerate this file via 'pnpm env:init --prod' — see env/shared.env.example. If this is a reviewed, intentional secret rotation, update state/shared_env.sha256 by hand after confirming the new value, then re-run. Refusing to deploy."
  fi
}

cmd_deploy() {
  local sha="$1"
  shift || true
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "Not a 40-hex commit SHA: $sha"

  local force=false allow_destructive=false
  for arg in "$@"; do
    case "$arg" in
      --force) force=true ;;
      --i-understand-this-is-destructive) allow_destructive=true ;;
      *) die "Unknown argument: $arg" ;;
    esac
  done

  CURRENT_SHA_FOR_RESULT="$sha"

  acquire_deploy_lock "deploy:$sha"
  phase "lock_acquired"

  reconcile_state_with_reality
  phase "reconciled"

  assert_shared_env_checksum
  phase "checksum_ok"

  local current_color candidate_color rollback_target current_sha
  current_color="$(state_read "$CURRENT_COLOR_FILE")"
  [[ -n "$current_color" ]] || die "state/current_color is empty — this VPS has never been bootstrapped. Run: deploy.sh --bootstrap $sha"
  candidate_color="$(other_color "$current_color")"

  rollback_target="$(state_read "$ROLLBACK_TARGET_FILE")"
  if [[ "$rollback_target" == "$candidate_color" && "$force" != "true" ]]; then
    die "Refusing to deploy into '$candidate_color' — it is still recorded as the rollback target for a not-yet-cleaned-up prior deploy. Pass --force to override (this discards that rollback safety net)."
  fi

  current_sha="$(state_read "$CURRENT_SHA_FILE")"
  [[ "$sha" == "$current_sha" ]] && log_warn "Requested SHA equals the already-deployed SHA — proceeding anyway (idempotent re-deploy)."

  log_info "Deploying $sha into color=$candidate_color (current live color=$current_color, sha=$current_sha)"

  # Must be exported BEFORE the migration phase: it runs `compose run` against
  # the candidate's image, whose tag resolves via ${IMAGE_TAG} in the compose
  # file — exporting only below would fatally exit at the first compose call.
  export IMAGE_TAG="$sha"
  run_migration_phase "$candidate_color" "$sha" "$allow_destructive"
  phase "migrated"

  log_info "Starting candidate services (color=$candidate_color) ..."
  compose --profile "$candidate_color" up -d "api-${candidate_color}" "web-${candidate_color}" "workers-${candidate_color}"
  phase "candidate_started"

  if ! wait_for_healthy "$HEALTH_TIMEOUT_SECONDS" "api-${candidate_color}" "web-${candidate_color}" "workers-${candidate_color}"; then
    teardown_candidate "$candidate_color"
    die "Candidate ($candidate_color) failed to become healthy within ${HEALTH_TIMEOUT_SECONDS}s — torn down, $current_color untouched, no Caddy reload happened."
  fi
  phase "candidate_healthy"

  if ! retry_3x "pre-switch api ($candidate_color)" smoke_api_direct "$candidate_color" \
    || ! retry_3x "pre-switch web ($candidate_color)" smoke_web_direct "$candidate_color"; then
    teardown_candidate "$candidate_color"
    die "Pre-switch smoke tests failed — candidate torn down, $current_color untouched, no Caddy reload happened."
  fi
  phase "pre_switch_smoke_ok"

  log_info "Writing canary config: $current_color=$((10 - CANARY_WEIGHT))0%, $candidate_color=${CANARY_WEIGHT}0% ..."
  write_canary_config "$current_color" "$candidate_color" "$CANARY_WEIGHT"
  reload_caddy
  phase "canary_live"

  log_info "Holding canary for ${CANARY_HOLD_SECONDS}s before re-checking ..."
  sleep "$CANARY_HOLD_SECONDS"

  if ! retry_3x "post-canary public smoke" smoke_public_domain; then
    log_error "Post-canary public smoke test failed — reverting to 100% $current_color."
    write_active_config "$current_color"
    reload_caddy
    teardown_candidate "$candidate_color"
    die "Canary failed public smoke tests — reverted to $current_color, candidate torn down."
  fi
  phase "canary_verified"

  log_info "Canary verified — switching 100% of traffic to $candidate_color ..."
  write_active_config "$candidate_color"
  reload_caddy
  phase "full_switch"

  atomic_write "$CURRENT_COLOR_FILE" "$candidate_color"
  atomic_write "$CURRENT_SHA_FILE" "$sha"
  atomic_write "$ROLLBACK_TARGET_FILE" "$current_color"
  phase "state_committed"

  append_history "deploy sha=$sha color=$candidate_color outcome=success previous_color=$current_color"
  log_info "Deploy complete. Live color=$candidate_color sha=$sha."
  log_info "Previous color ($current_color) is left running as the rollback target — cleaned up by a later scheduled --cleanup run, or use --rollback now if something looks wrong."
}

cmd_rollback() {
  acquire_deploy_lock "rollback"
  phase "lock_acquired"
  reconcile_state_with_reality
  phase "reconciled"

  local current_color target_color
  current_color="$(state_read "$CURRENT_COLOR_FILE")"
  target_color="$(state_read "$ROLLBACK_TARGET_FILE")"
  [[ -n "$current_color" && -n "$target_color" ]] || die "No rollback target recorded — nothing to roll back to."
  [[ "$target_color" != "$current_color" ]] || die "Rollback target equals current color ($current_color) — state is inconsistent, refusing."

  CURRENT_SHA_FOR_RESULT="rollback-to-${target_color}"

  log_info "Health-checking rollback target ($target_color) before flipping traffic back to it ..."
  # compose() requires IMAGE_TAG even for the read-only `ps` inside
  # running_image_sha, so seed it with the live sha first — then replace it
  # with the target's ACTUAL image tag. A recreate-on-recovery must restore
  # the pre-fault release, never the live (possibly faulty) one.
  export IMAGE_TAG
  IMAGE_TAG="$(state_read "$CURRENT_SHA_FILE")"
  local target_sha
  target_sha="$(running_image_sha "$target_color")"
  if [[ -n "$target_sha" ]]; then
    log_info "Rollback target ($target_color) is running tag=$target_sha — will recreate from that tag if needed."
    export IMAGE_TAG="$target_sha"
  fi
  if ! wait_for_healthy 30 "api-${target_color}" "web-${target_color}" "workers-${target_color}"; then
    if [[ -z "$target_sha" ]]; then
      die "Rollback target ($target_color) has no inspectable running container — the previous release's image tag cannot be recovered, and recreating it with the live tag ($IMAGE_TAG) would just deploy the same faulty release. Restore the previous release manually (see releases/history.log), then re-run --rollback."
    fi
    log_warn "$target_color is not currently healthy — attempting to (re)start it from tag=$IMAGE_TAG before giving up."
    compose --profile "$target_color" up -d "api-${target_color}" "web-${target_color}" "workers-${target_color}" || true
    if ! wait_for_healthy "$HEALTH_TIMEOUT_SECONDS" "api-${target_color}" "web-${target_color}" "workers-${target_color}"; then
      die "Rollback target ($target_color) is unhealthy and would not come back up — refusing to flip traffic to something dead. Manual intervention required."
    fi
  fi
  phase "target_healthy"

  if ! retry_3x "rollback-target api ($target_color)" smoke_api_direct "$target_color" \
    || ! retry_3x "rollback-target web ($target_color)" smoke_web_direct "$target_color"; then
    die "Rollback target ($target_color) failed smoke tests — refusing to flip traffic to it."
  fi
  phase "target_smoke_ok"

  write_active_config "$target_color"
  reload_caddy
  phase "switched"

  atomic_write "$CURRENT_COLOR_FILE" "$target_color"
  atomic_write "$ROLLBACK_TARGET_FILE" "$current_color"

  local recovered_sha
  recovered_sha="$(running_image_sha "$target_color")"
  [[ -n "$recovered_sha" ]] && atomic_write "$CURRENT_SHA_FILE" "$recovered_sha"

  append_history "rollback color=$target_color outcome=success previous_color=$current_color"
  log_info "Rolled back to $target_color."
}

cmd_cleanup() {
  acquire_deploy_lock "cleanup"
  phase "lock_acquired"
  reconcile_state_with_reality

  local current_color target
  current_color="$(state_read "$CURRENT_COLOR_FILE")"
  target="$(state_read "$ROLLBACK_TARGET_FILE")"
  CURRENT_SHA_FOR_RESULT="cleanup:${target:-none}"

  if [[ -z "$target" ]]; then
    log_info "No rollback_target recorded — nothing to clean up."
    return 0
  fi
  if [[ "$target" == "$current_color" ]]; then
    log_warn "rollback_target ($target) equals current_color — refusing to clean up the live color. State looks inconsistent; skipping."
    return 0
  fi

  log_info "Tearing down old color: $target"
  # compose() and the compose file both interpolate ${IMAGE_TAG:?} even for
  # stop/rm — nothing is (re)created here, so the live sha is a fine
  # placeholder, it just has to be present for the expansion to succeed.
  export IMAGE_TAG
  IMAGE_TAG="$(state_read "$CURRENT_SHA_FILE")"
  compose stop "api-${target}" "web-${target}" "workers-${target}" 2>/dev/null || true
  compose rm -f "api-${target}" "web-${target}" "workers-${target}" 2>/dev/null || true

  atomic_write "$ROLLBACK_TARGET_FILE" ""
  append_history "cleanup color=$target outcome=success"
  log_info "Cleanup complete. $target stopped and removed. No rollback target recorded until the next deploy."
}

cmd_bootstrap() {
  local sha="${1:?--bootstrap requires a 40-hex commit SHA}"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "Not a 40-hex commit SHA: $sha"

  acquire_deploy_lock "bootstrap"
  CURRENT_SHA_FOR_RESULT="$sha"
  phase "lock_acquired"

  [[ -f "$CURRENT_COLOR_FILE" ]] && die "state/current_color already exists — this VPS is already bootstrapped. Use a normal 'deploy.sh $sha' instead."

  assert_shared_env_checksum
  phase "checksum_recorded"

  local color="blue"
  log_info "Bootstrapping from scratch: infra services, then color=$color."

  export IMAGE_TAG="$sha"
  compose up -d db redis minio minio-init uptime-kuma
  if ! wait_for_healthy 120 db redis minio; then
    die "Infra services (db/redis/minio) failed to become healthy — bootstrap aborted."
  fi
  phase "infra_healthy"

  run_migration_phase "$color" "$sha" "true"
  phase "migrated"

  log_info "Starting bootstrap services for color=$color ..."
  compose --profile "$color" up -d "api-${color}" "web-${color}" "workers-${color}"
  if ! wait_for_healthy "$HEALTH_TIMEOUT_SECONDS" "api-${color}" "web-${color}" "workers-${color}"; then
    die "Bootstrap: $color failed to become healthy."
  fi
  phase "color_healthy"

  mkdir -p "$CADDY_ACTIVE_DIR"
  log_info "Writing active Caddy config for color=$color ..."
  write_active_config "$color"
  log_info "Starting Caddy ..."
  compose up -d caddy
  if reload_caddy; then
    log_info "Caddy config reload succeeded."
  else
    log_warn "Initial Caddy reload failed (expected if this is Caddy's very first boot) — it reads caddy/active/*.caddy on startup."
  fi
  phase "caddy_live"

  atomic_write "$CURRENT_COLOR_FILE" "$color"
  atomic_write "$CURRENT_SHA_FILE" "$sha"
  atomic_write "$ROLLBACK_TARGET_FILE" ""

  append_history "bootstrap sha=$sha color=$color outcome=success"
  log_info "Bootstrap complete. Live color=$color sha=$sha. The other color ($(other_color "$color")) is not running yet — the next normal deploy starts it."
}

# Read-only, no lock, no state mutation — lets cd.yml's staleness guard
# (decision 1b: `git merge-base --is-ancestor` needs to know what's
# currently live before deciding whether the incoming SHA is a safe,
# in-order deploy) read state/current_sha over the same restricted
# dispatcher key used for real deploys, without widening that key to a
# general-purpose `cat`. Prints nothing (exit 0) if never bootstrapped.
cmd_print_current_sha() {
  state_read "$CURRENT_SHA_FILE"
  echo
}

# cmd_wait_for_result SHA TIMEOUT_SECONDS — synchronous, no lock. Polls
# state/last_deploy_result until it records the given SHA, then prints it
# and exits 0 (outcome=success) or 1 (outcome=failure), or exits 2 on
# timeout. This exists so cd.yml can block on a SEPARATE SSH call from the
# one that launched the (detached, backgrounded) deploy — the forced-command
# SSH dispatcher (bin/ssh-deploy-dispatcher.sh) can't pass through an
# arbitrary polling shell loop, only literal, allowlisted deploy.sh
# invocations, so the polling logic has to live here instead.
cmd_wait_for_result() {
  local sha="${1:?--wait-for-result requires a SHA}"
  local timeout="${2:-1500}"
  local start last_heartbeat
  start="$(date +%s)"
  last_heartbeat="$start"
  while true; do
    if [[ -f "$LAST_DEPLOY_RESULT_FILE" ]] && grep -q "^sha=${sha}$" "$LAST_DEPLOY_RESULT_FILE"; then
      cat "$LAST_DEPLOY_RESULT_FILE"
      grep -q "^outcome=success$" "$LAST_DEPLOY_RESULT_FILE" && exit 0
      exit 1
    fi
    local now
    now="$(date +%s)"
    # Heartbeat every 15s: proves the SSH channel is alive (bytes flowing,
    # not just relying on ServerAlive keepalives) and tells an operator
    # watching the CD log which phase a stuck deploy is actually in,
    # instead of dead air until the 1500s timeout.
    if ((now - last_heartbeat >= 15)); then
      local phase
      phase="$( [[ -f "$LOCK_META_FILE" ]] && grep '^phase=' "$LOCK_META_FILE" | cut -d= -f2- )"
      echo "waiting ... elapsed=$((now - start))s phase=${phase:-unknown}"
      last_heartbeat="$now"
    fi
    if ((now - start >= timeout)); then
      echo "timed out after ${timeout}s waiting for a result for sha=${sha}" >&2
      exit 2
    fi
    sleep 5
  done
}

main() {
  case "${1:-}" in
    --rollback) cmd_rollback ;;
    --cleanup) cmd_cleanup ;;
    --print-current-sha) cmd_print_current_sha ;;
    --wait-for-result)
      shift
      cmd_wait_for_result "${1:-}" "${2:-}"
      ;;
    --bootstrap)
      shift
      cmd_bootstrap "${1:-}"
      ;;
    -h | --help | "")
      cat >&2 <<EOF
Usage:
  deploy.sh <40-hex-sha> [--force] [--i-understand-this-is-destructive]
  deploy.sh --rollback
  deploy.sh --cleanup
  deploy.sh --print-current-sha
  deploy.sh --wait-for-result <40-hex-sha> [timeout-seconds]
  deploy.sh --bootstrap <40-hex-sha>
EOF
      [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && exit 0
      exit 1
      ;;
    *)
      cmd_deploy "$@"
      ;;
  esac
}

main "$@"
