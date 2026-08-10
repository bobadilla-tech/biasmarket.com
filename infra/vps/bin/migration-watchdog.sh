#!/usr/bin/env bash
# Runs every minute via infra/vps/systemd/biasmarket-migration-watchdog.timer,
# deliberately INDEPENDENT of deploy.sh itself — so a wedged deploy can't
# also silence its own alarm (decision 9 in
# docs/plans/2026-08-10-bluegreen-zero-downtime-deploy-plan.md).
#
# Pings a Kuma push monitor's heartbeat URL ONLY when
# state/migration_pending is absent, or present but younger than
# THRESHOLD_SECONDS. If migration_pending exists and is OLDER than the
# threshold (a migration applied but the deploy never finished cutting
# over), this script deliberately does nothing: the push monitor misses its
# heartbeat, Kuma's own state-transition notification fires exactly the
# same way it already does for the existing HTTP/TCP monitors (real-time
# Slack/Discord alert, configured directly in Kuma's UI — see
# docs/core/incident-response.md).
set -euo pipefail

STATE_FILE="/opt/biasmarket/state/migration_pending"
THRESHOLD_SECONDS="${MIGRATION_WATCHDOG_THRESHOLD_SECONDS:-180}"
PUSH_URL="${KUMA_MIGRATION_PUSH_URL:?Set KUMA_MIGRATION_PUSH_URL (see infra/vps/env/watchdog.env.example) — the push monitor URL created by scripts/setup-kuma.ts}"

if [[ -f "$STATE_FILE" ]]; then
  now="$(date +%s)"
  mtime="$(stat -c %Y "$STATE_FILE" 2>/dev/null || stat -f %m "$STATE_FILE")"
  age=$((now - mtime))
  if ((age >= THRESHOLD_SECONDS)); then
    # Stuck: skip the ping on purpose, let the push monitor miss its
    # heartbeat and let Kuma alert.
    exit 0
  fi
fi

curl -fsS --max-time 10 "$PUSH_URL" >/dev/null
