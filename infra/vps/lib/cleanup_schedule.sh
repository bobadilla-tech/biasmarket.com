#!/usr/bin/env bash
# Server-side scheduling of the 30-minute old-color cleanup window, replacing
# cd.yml's old `sleep 1800`-in-a-runner job — see
# docs/plans/2026-08-10-server-side-cleanup-scheduling-plan.md for the full
# design rationale (decisions 1-5, 9-10 are the ones most relevant here).
#
# Both functions are called from cmd_deploy right after the state_committed
# phase, always guarded by the caller (`X || log_warn "..." || true`) —
# scheduling failure must never turn an already-successful cutover into a
# reported deploy failure. That guard alone is not sufficient for
# schedule_cleanup, though: bash suppresses `errexit` for a whole function
# body when it's called as `func || fallback`, so a failing command
# mid-function would NOT abort the function early — it would just fall
# through to the final `log_info` (which essentially never fails) and return
# 0, silently defeating the caller's guard. Both functions therefore check
# every failure-prone step themselves and `return 1` explicitly rather than
# relying on the caller's `||` to catch anything buried mid-body.
#
# Expects SCHEDULED_CLEANUP_PID_FILE/_META_FILE/_LOG_FILE (lib/state.sh),
# ROOT_DIR, and log_info/log_warn (lib/log.sh) already in scope, plus
# cmd_deploy's own $sha/$current_color/$candidate_color locals — bash's
# dynamic scoping makes a caller's `local` variables visible to a function
# it calls, so these are read directly rather than passed as arguments.
# sha/current_color/candidate_color below come from cmd_deploy's dynamic
# scope; `shellcheck -x deploy.sh` (which follows the actual source chain)
# resolves them and reports nothing — this file checked in isolation cannot
# see that.
# shellcheck disable=SC2154

# Canonical launch shape — the only place this command is written out.
schedule_cleanup() {
  local pid
  : >"$SCHEDULED_CLEANUP_LOG_FILE"
  setsid bash -c '
    exec 9>&-              # close the inherited deploy-lock fd — a plain
                            # background fork duplicates fd 9 (the open
                            # deploy.lock) into the child; without this close,
                            # the 30-minute sleep would hold the same flock
                            # open for its entire runtime.
    sleep 1800
    exec "$0" --cleanup
  ' "$ROOT_DIR/deploy.sh" </dev/null >"$SCHEDULED_CLEANUP_LOG_FILE" 2>&1 &
  pid=$!
  disown
  # Written immediately after capturing $pid, before anything else that
  # could fail. If atomic_write itself then fails (e.g. disk full), the
  # background process is already running, untracked — a narrow, accepted
  # observability gap, not a correctness hazard (cmd_cleanup re-reads state
  # fresh at fire time regardless of whether anything was tracking it).
  atomic_write "$SCHEDULED_CLEANUP_PID_FILE" "$pid" \
    || { log_warn "Failed to record scheduled_cleanup.pid (pid=$pid still running, untracked)."; return 1; }
  atomic_write "$SCHEDULED_CLEANUP_META_FILE" "$(cat <<EOF
pid=$pid
scheduled_by=$sha
scheduled_at=$(date -u +%FT%TZ)
fires_at=$(date -u -d '+1800 seconds' +%FT%TZ)
candidate_color_at_schedule=$candidate_color
EOF
)" || { log_warn "Failed to record scheduled_cleanup.meta (pid=$pid still running, untracked)."; return 1; }
  log_info "Scheduled cleanup of $current_color in 1800s (pid=$pid)."
  return 0
}

cancel_scheduled_cleanup() {
  [[ -f "$SCHEDULED_CLEANUP_PID_FILE" ]] || return 0
  local pid
  pid="$(cat "$SCHEDULED_CLEANUP_PID_FILE" 2>/dev/null)" || pid=""
  # PID-reuse guard: scheduled_cleanup.pid is left in place, unmodified,
  # until the next cmd_deploy call — which per decision 6 can be well over
  # 30 minutes later if the only intervening activity is a --rollback. A
  # bare `kill -0 "$pid"` would treat "some unrelated process now has this
  # PID" as "the scheduled cleanup is still pending"; the cmdline check
  # closes that realistic case (not bulletproof, but cheap). Matched against
  # the exact deploy.sh path, not a bare "sleep" substring: schedule_cleanup
  # always passes "$ROOT_DIR/deploy.sh" as bash -c's positional $0 argument,
  # so it's present in /proc/$pid/cmdline for the whole chain's lifetime —
  # during the sleep (as that positional arg) and after the exec into
  # --cleanup (as argv[0]) alike — without the false-positive surface of
  # matching any unrelated process that merely happens to run `sleep`.
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null \
     && grep -qF "$ROOT_DIR/deploy.sh" "/proc/$pid/cmdline" 2>/dev/null; then
    log_info "Cancelling previously scheduled cleanup (pid=$pid)."
    kill -TERM "$pid" 2>/dev/null || true
  fi
  rm -f "$SCHEDULED_CLEANUP_PID_FILE" "$SCHEDULED_CLEANUP_META_FILE"
  return 0
}
