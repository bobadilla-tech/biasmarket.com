#!/usr/bin/env bash
# Forced command for SSH "key B" (T9/decision 10 — the deploy-invocation
# key, separate from key A which is rrsync-restricted to syncing
# infra/vps/**). Installed on the VPS deploy user's authorized_keys as:
#
#   command="/opt/biasmarket/bin/ssh-deploy-dispatcher.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... key-b-deploy
#
# $SSH_ORIGINAL_COMMAND is matched against a strict, anchored allowlist
# below and NEVER eval'd:
#   - `deploy.sh <40-hex-sha>` / `--rollback` / `--cleanup` — the three
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
# Anything else is rejected outright. Manual
# break-glass operations (--force, --i-understand-this-is-destructive,
# --bootstrap) are deliberately NOT reachable through this dispatcher — an
# operator wanting those runs deploy.sh directly from an interactive shell
# on the VPS, not over this restricted key.
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
  local errfile
  errfile="$(mktemp)"
  setsid "$DEPLOY_ROOT/deploy.sh" "$@" >/dev/null 2>"$errfile" </dev/null &
  local bg_pid=$!
  disown
  # Catches deploy.sh failing, or failing to even exec (missing/
  # non-executable file), near-instantly — e.g. an early die() before the
  # lock is attempted — instead of silently vanishing until
  # --wait-for-result's own 1500s timeout.
  sleep 2
  if ! kill -0 "$bg_pid" 2>/dev/null; then
    wait "$bg_pid"
    local rc=$?
    echo "launch failed immediately (rc=$rc) for $label:" >&2
    cat "$errfile" >&2
    rm -f "$errfile"
    exit 1
  fi
  rm -f "$errfile"
}

if [[ "$cmd" =~ ^deploy\.sh\ ([0-9a-f]{40})$ ]]; then
  sha="${BASH_REMATCH[1]}"
  launch "deploy sha=$sha" "$sha"
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
  echo "rejected: '\$SSH_ORIGINAL_COMMAND' does not match the allowlist (deploy.sh <40-hex-sha> | --rollback | --cleanup | --print-current-sha | --wait-for-result <sha> <seconds>)" >&2
  exit 1
fi

exit 0
