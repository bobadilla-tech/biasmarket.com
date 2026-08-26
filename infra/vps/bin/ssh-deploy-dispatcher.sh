#!/usr/bin/env bash
# Forced command for SSH "key B" (T9/decision 10 — the deploy-invocation
# key, separate from key A which is rrsync-restricted to syncing
# infra/vps/**). Installed on the VPS deploy user's authorized_keys as:
#
#   command="/opt/biasmarket/bin/ssh-deploy-dispatcher.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... key-b-deploy
#
# $SSH_ORIGINAL_COMMAND is matched against a strict, anchored allowlist
# below and NEVER eval'd:
#   - `deploy.sh <40-hex-sha> [--force]` / `--rollback` / `--cleanup` — the three
#     deploy-triggering shapes from the plan, launched detached (see
#     launch() below).
#   - `deploy.sh --print-current-sha` — read-only, synchronous, no lock/
#     state mutation. cd.yml's staleness guard uses this to learn what's
#     currently live before deciding whether an incoming SHA is a safe,
#     in-order deploy.
#   - `deploy.sh --wait-for-result <40-hex-sha> <1-5 digit seconds>` —
#     read-only, synchronous, blocks (server-side, cheap) until
#     state/last_deploy_result records that SHA or the timeout elapses.
#     Exists because this forced-command model can't pass through an
#     arbitrary polling shell loop over the launching SSH call — cd.yml
#     instead opens a SEPARATE SSH call for this after the (detached)
#     deploy has been launched.
# Anything else is rejected outright. The dispatcher exposes only the
# narrowly-scoped --force needed by automated rapid successive deployments;
# destructive migration override and bootstrap remain manual-only.
#
# Launches deploy.sh detached from this SSH session (setsid, backgrounded,
# dispatcher exits immediately) so an ordinary network blip between the
# GitHub runner and the VPS can't SIGHUP-kill a deploy mid-phase. The
# caller (cd.yml) does not wait on this SSH call for the deploy's outcome —
# it polls state/last_deploy_result over a separate connection.
#
# Previously wrapped in `systemd-run --scope --collect` for systemd cgroup
# registration/`systemctl status` visibility. Dropped: on this VPS,
# StartTransientUnit over a non-interactive forced-command SSH session (no
# pty, no seat) hits polkit's "Interactive authentication required" —
# scoping a polkit rules.d rule to it didn't resolve it, and systemd-run
# was never load-bearing for anything beyond the SSH-transport detachment
# setsid already provides on its own. Operator visibility into an
# in-progress run now comes from state/deploy.lock.meta's live `phase=`
# (see lib/lock.sh's update_lock_phase, and cmd_wait_for_result's
# heartbeat) instead of `systemctl status`/journald per-run grouping.
set -euo pipefail

DEPLOY_ROOT="/opt/biasmarket"
cmd="${SSH_ORIGINAL_COMMAND:-}"

launch() {
  local label="$1"
  shift
  # Fixed path under state/ (excluded from cd.yml's rsync --delete, so it
  # survives syncs) rather than mktemp — a mktemp file deleted right after
  # the 2s liveness check below throws away deploy.sh's own log_info/
  # log_error output for the rest of a real run, since the still-running
  # process keeps writing to the now-unlinked inode with nothing left to
  # read it back from. This is deploy.sh's full stderr for the most recent
  # launch, not just early-failure output — overwritten fresh each launch.
  local errfile="$DEPLOY_ROOT/state/last_launch.log"
  # Rotate one deep before truncating: a real failure's stderr otherwise
  # gets silently destroyed by whatever launches next — an unrelated
  # scheduled --cleanup fired this way mid-incident and erased the actual
  # deploy failure before it could be read back for a postmortem.
  [[ -s "$errfile" ]] && mv -f "$errfile" "${errfile}.previous"
  : >"$errfile"
  setsid "$DEPLOY_ROOT/deploy.sh" "$@" >/dev/null 2>"$errfile" </dev/null &
  local bg_pid=$!
  disown
  # Catches deploy.sh failing, or failing to even exec (missing/
  # non-executable file), near-instantly — e.g. an early die() before the
  # lock is attempted — instead of silently vanishing until
  # --wait-for-result's own 1500s timeout. A valid command such as an
  # idempotent --cleanup can also finish inside this probe, so propagate its
  # actual exit status instead of treating every quick exit as a failure.
  sleep 2
  if ! kill -0 "$bg_pid" 2>/dev/null; then
    local rc=0
    wait "$bg_pid" || rc=$?
    if ((rc != 0)); then
      echo "launch failed immediately (rc=$rc) for $label:" >&2
      cat "$errfile" >&2
      return 1
    fi
    cat "$errfile" >&2
    return 0
  fi
}

if [[ "$cmd" =~ ^deploy\.sh\ ([0-9a-f]{40})(\ --force)?$ ]]; then
  sha="${BASH_REMATCH[1]}"
  args=("$sha")
  label="deploy sha=$sha"
  if [[ -n "${BASH_REMATCH[2]}" ]]; then
    args+=(--force)
    label+=" --force"
  fi
  launch "$label" "${args[@]}"
elif [[ "$cmd" == "deploy.sh --rollback" ]]; then
  launch "rollback" --rollback
elif [[ "$cmd" == "deploy.sh --cleanup" ]]; then
  launch "cleanup" --cleanup
elif [[ "$cmd" == "deploy.sh --print-current-sha" ]]; then
  # Synchronous, not detached — the caller needs this SSH call's stdout.
  exec "$DEPLOY_ROOT/deploy.sh" --print-current-sha
elif [[ "$cmd" =~ ^deploy\.sh\ --wait-for-result\ ([0-9a-f]{40})\ ([0-9]{1,5})$ ]]; then
  # Synchronous, not detached — this SSH call is meant to block until the
  # deploy launched by a prior call finishes or the timeout elapses.
  exec "$DEPLOY_ROOT/deploy.sh" --wait-for-result "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
else
  echo "rejected: '\$SSH_ORIGINAL_COMMAND' does not match the allowlist (deploy.sh <40-hex-sha> [--force] | --rollback | --cleanup | --print-current-sha | --wait-for-result <sha> <seconds>)" >&2
  exit 1
fi

exit 0
