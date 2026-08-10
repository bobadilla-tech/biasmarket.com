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
# Launches deploy.sh detached from this SSH session (systemd-run + setsid,
# backgrounded, dispatcher exits immediately) so an ordinary network blip
# between the GitHub runner and the VPS can't SIGHUP-kill a deploy mid-phase.
# The caller (cd.yml) does not wait on this SSH call for the deploy's
# outcome — it polls state/last_deploy_result over a separate connection.
set -euo pipefail

DEPLOY_ROOT="/opt/biasmarket"
cmd="${SSH_ORIGINAL_COMMAND:-}"

launch() {
  # setsid: fully detaches from this script's (and therefore sshd's)
  # controlling session. systemd-run --scope: registers the process tree
  # with systemd's cgroup manager per the plan's stated execution model.
  # --collect: let systemd garbage-collect the unit once it exits, no
  # manual `systemctl reset-failed` bookkeeping needed.
  setsid systemd-run --scope --collect --unit="$1" -- "$DEPLOY_ROOT/deploy.sh" "${@:2}" \
    >/dev/null 2>&1 </dev/null &
  disown
}

if [[ "$cmd" =~ ^deploy\.sh\ ([0-9a-f]{40})$ ]]; then
  sha="${BASH_REMATCH[1]}"
  launch "biasmarket-deploy-${sha:0:12}-$(date +%s)" "$sha"
elif [[ "$cmd" == "deploy.sh --rollback" ]]; then
  launch "biasmarket-rollback-$(date +%s)" --rollback
elif [[ "$cmd" == "deploy.sh --cleanup" ]]; then
  launch "biasmarket-cleanup-$(date +%s)" --cleanup
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
