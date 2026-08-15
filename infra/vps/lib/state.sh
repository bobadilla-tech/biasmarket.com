#!/usr/bin/env bash
# State-file paths and atomic (temp-file + rename) read/write helpers.
# ROOT_DIR must already be set by the sourcing script.
#
# SC2034: every $..._DIR/$..._FILE variable below is consumed by deploy.sh and
# the other libs via `source`, not in this file — unused here is intentional.
# shellcheck disable=SC2034

STATE_DIR="$ROOT_DIR/state"
RELEASES_DIR="$ROOT_DIR/releases"
ENV_DIR="$ROOT_DIR/env"
CADDY_ACTIVE_DIR="$ROOT_DIR/caddy/active"

CURRENT_COLOR_FILE="$STATE_DIR/current_color"
CURRENT_SHA_FILE="$STATE_DIR/current_sha"
ROLLBACK_TARGET_FILE="$STATE_DIR/rollback_target"
# Epoch-seconds timestamp, written atomically alongside ROLLBACK_TARGET_FILE
# every time it's set — lets cmd_cleanup refuse to tear down a rollback
# target before its promised 30-minute window has actually elapsed,
# regardless of which caller (self-scheduled fire or cleanup-fallback.yml's
# hourly tick) invoked it.
ROLLBACK_TARGET_SET_AT_FILE="$STATE_DIR/rollback_target_set_at"
MIGRATION_PENDING_FILE="$STATE_DIR/migration_pending"
LAST_DEPLOY_RESULT_FILE="$STATE_DIR/last_deploy_result"
LOCK_FILE="$STATE_DIR/deploy.lock"
LOCK_META_FILE="$STATE_DIR/deploy.lock.meta"
SHARED_ENV_CHECKSUM_FILE="$STATE_DIR/shared_env.sha256"
SCHEDULED_CLEANUP_PID_FILE="$STATE_DIR/scheduled_cleanup.pid"
SCHEDULED_CLEANUP_META_FILE="$STATE_DIR/scheduled_cleanup.meta"
SCHEDULED_CLEANUP_LOG_FILE="$STATE_DIR/scheduled_cleanup.log"
HISTORY_LOG="$RELEASES_DIR/history.log"

mkdir -p "$STATE_DIR" "$RELEASES_DIR"

# atomic_write FILE CONTENT — never leaves a torn/partial file for a reader
# racing this write (temp file in the same directory, so the final `mv` is
# guaranteed same-filesystem and therefore atomic).
atomic_write() {
  local target="$1" content="$2"
  local tmp
  tmp="$(mktemp "${target}.XXXXXX")"
  printf '%s' "$content" >"$tmp"
  mv -f "$tmp" "$target"
}

state_read() {
  local file="$1" default="${2:-}"
  if [[ -f "$file" ]]; then cat "$file"; else printf '%s' "$default"; fi
}

other_color() {
  case "$1" in
    blue) echo green ;;
    green) echo blue ;;
    *) die "other_color: unknown color '$1'" ;;
  esac
}

# write_last_deploy_result SHA OUTCOME PHASE — the deliberately secret-free
# completion signal the CD workflow polls for (SHA, outcome, phase reached,
# timestamp — nothing from env/*.env). Written on EVERY exit path, success
# or failure, as deploy.sh's final action.
write_last_deploy_result() {
  local sha="$1" outcome="$2" phase="$3"
  local content
  content=$(cat <<EOF
sha=$sha
outcome=$outcome
phase=$phase
timestamp=$(date -u +%FT%TZ)
EOF
)
  # Keep each field on its own line.  atomic_write intentionally preserves
  # the supplied bytes, and command substitution strips the heredoc's final
  # newline, so add it explicitly for the line-oriented waiter/grep below.
  atomic_write "$LAST_DEPLOY_RESULT_FILE" "${content}"$'\n'
}

append_history() {
  local line="$1"
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$line" >>"$HISTORY_LOG"
}
