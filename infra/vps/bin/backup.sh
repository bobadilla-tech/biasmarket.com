#!/usr/bin/env bash
# Run one backup with the currently deployed backup image. The timer is a
# separate unit and must be installed/enabled explicitly after validation.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "backup.sh must run as root" >&2
  exit 1
fi

tag="$(cat "$ROOT_DIR/state/current_sha" 2>/dev/null || true)"
if [[ ! "$tag" =~ ^[0-9a-f]{40}$ ]]; then
  echo "state/current_sha is missing or invalid; refusing to run backup" >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/env/backup.env" ]]; then
  echo "env/backup.env is missing; refusing to run backup" >&2
  exit 1
fi
read -r env_owner env_mode < <(stat -c '%u %a' "$ROOT_DIR/env/backup.env")
if [[ "$env_owner" != 0 || "$env_mode" != 600 ]]; then
  echo "env/backup.env must be root-owned with mode 0600" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/state/backup-stage"
chown 10001:10001 "$ROOT_DIR/state/backup-stage"
chmod 0700 "$ROOT_DIR/state/backup-stage"

# Serialize stale-stage cleanup, capture, and final cleanup. Systemd's timer
# does not prevent an operator from starting another backup at the same time.
umask 077
exec 9>/run/lock/biasmarket-backup.lock
if ! flock --exclusive --nonblock 9; then
  echo "a Bias Market backup is already running" >&2
  exit 75
fi

# Used by compose() from lib/compose.sh.
# shellcheck disable=SC2034
IMAGE_TAG="$tag"
# shellcheck source=../lib/state.sh
# shellcheck disable=SC1091
source "$ROOT_DIR/lib/state.sh"
# shellcheck source=../lib/compose.sh
# shellcheck disable=SC1091
source "$ROOT_DIR/lib/compose.sh"
compose --profile backup run --rm backup
