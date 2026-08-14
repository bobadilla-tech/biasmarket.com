#!/usr/bin/env bash
# Server-side scheduling of the 30-minute old-color cleanup delay, replacing
# cd.yml's old `sleep 1800` runner-side wait. See
# docs/plans/2026-08-10-server-side-cleanup-scheduling-plan.md for the full
# design (decisions 1-10) — in particular why this isn't `systemd-run`
# (decision 3's polkit story, same one in ssh-deploy-dispatcher.sh's
# launch()), why the fired cleanup re-reads state fresh instead of trusting
# anything captured at schedule time (decision 4), and why `cmd_rollback`
# deliberately does not touch this schedule (decision 6). cmd_cleanup itself
# additionally refuses to act on a rollback target younger than
# CLEANUP_MIN_AGE_SECONDS (deploy.sh) — that age check, not this schedule's
# timing alone, is what actually guarantees the promised window even when
# cleanup-fallback.yml's hourly cron fires early.
#
# Both functions are called from cmd_deploy, which reads $sha and
# $current_color as its own locals — deliberately relied on here via bash's
# dynamic scoping rather than passed as arguments, matching this file's
# design doc.

# schedule_cleanup — backgrounds `sleep 1800 && deploy.sh --cleanup`,
# detached from this SSH session exactly like ssh-deploy-dispatcher.sh's
# launch(). Must be called with $sha and $current_color already set by the
# caller (cmd_deploy).
#
# Never `die`s — a full disk or similar failure here must not turn an
# already-successful cutover into a reported deploy failure (decision 5).
# Callers must still guard the call itself (`schedule_cleanup || log_warn
# ... || true`) since a bare `return 1` alone, unguarded, would still abort
# the caller under `set -e`.
schedule_cleanup() {
  local pid
  : >"$SCHEDULED_CLEANUP_LOG_FILE"
  # $DEPLOY_LOCK_FD (lib/lock.sh) is interpolated here, at schedule time in
  # THIS (parent) shell — the surrounding quotes are split around it
  # specifically so this happens while everything else in the child script
  # stays single-quoted and unexpanded, most importantly "$0" a few lines
  # down, which must NOT resolve until the `exec` inside the child, at fire
  # time (decision 3 of the design doc). Keeps the fd number a single
  # source of truth (lib/lock.sh) instead of a bare literal repeated here.
  setsid bash -c '
    exec '"$DEPLOY_LOCK_FD"'>&-  # close the inherited deploy-lock fd — a
                            # plain backgrounded fork duplicates all open
                            # fds, including the flock fd cmd_deploy holds
                            # open for its whole lifetime (lib/lock.sh) —
                            # without this close, the sleeping process
                            # would hold the deploy lock for the full 30
                            # minutes.
    sleep 1800
    exec "$0" --cleanup
  ' "$ROOT_DIR/deploy.sh" </dev/null >"$SCHEDULED_CLEANUP_LOG_FILE" 2>&1 &
  pid=$!
  disown
  # Written immediately after capturing $pid, before anything else that
  # could fail (decision 5's accepted narrow gap: if these writes fail, the
  # background process is already running, untracked, but decision 4's
  # fresh-state-read at fire time makes this an observability gap only, not
  # a correctness one).
  atomic_write "$SCHEDULED_CLEANUP_PID_FILE" "$pid" \
    || { log_warn "Failed to record scheduled_cleanup.pid (pid=$pid still running, untracked)."; return 1; }
  atomic_write "$SCHEDULED_CLEANUP_META_FILE" "$(cat <<EOF
pid=$pid
scheduled_by=$sha
scheduled_at=$(date -u +%FT%TZ)
fires_at=$(date -u -d '+1800 seconds' +%FT%TZ)
rollback_target_at_schedule=$current_color
EOF
)" || { log_warn "Failed to record scheduled_cleanup.meta (pid=$pid still running, untracked)."; return 1; }
  log_info "Scheduled cleanup of $current_color in 1800s (pid=$pid)."
  return 0
}

# cancel_scheduled_cleanup — supersedes any previously scheduled cleanup
# still pending (e.g. a second deploy landing, or a manual --force redeploy
# into the still-benched slot). Not the thing correctness depends on —
# cmd_cleanup is idempotent and re-reads state fresh at fire time regardless
# (decision 4) — this is a hygiene/efficiency optimization only, to avoid a
# needless future flock wait and a spurious no-op history.log line.
#
# The /proc/$pid/cmdline check guards against a PID-reuse hazard: this file
# is deliberately never deleted on normal completion (decision 2), so by the
# time the next cmd_deploy runs, the recorded PID may have already exited
# and been recycled by the kernel for an unrelated process. A bare `kill -0
# $pid` can't tell the difference; grepping the recycled PID's own cmdline
# for our own command shape can.
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
