#!/usr/bin/env bash
# Install backup units, watch for Infisical config, and enable the daily timer
# only after the runtime preflight succeeds. Invoked by deploy.sh through the
# narrow sudoers rule and by systemd when backup.env is created or changed.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR=/etc/systemd/system
ENV_FILE="$ROOT_DIR/env/backup.env"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "backup-setup.sh must run as root" >&2
  exit 1
fi

for unit in \
  biasmarket-backup-config.service \
  biasmarket-backup.service \
  biasmarket-backup.timer \
  biasmarket-backup-setup.path \
  biasmarket-backup-setup.service; do
  install -o root -g root -m 0644 "$ROOT_DIR/systemd/$unit" "$UNIT_DIR/$unit"
done
systemctl daemon-reload
systemctl enable --now biasmarket-backup-setup.path

if [[ ! -f "$ENV_FILE" ]]; then
  systemctl disable --now biasmarket-backup.timer >/dev/null 2>&1 || true
  echo "env/backup.env is missing; timer remains disabled and the config watcher is active" >&2
  exit 1
fi

read -r env_owner env_mode < <(stat -c '%u %a' "$ENV_FILE")
if [[ "$env_owner" != 0 || "$env_mode" != 600 ]]; then
  systemctl disable --now biasmarket-backup.timer >/dev/null 2>&1 || true
  echo "env/backup.env must be root-owned with mode 0600; timer remains disabled" >&2
  exit 1
fi

if ! systemctl start biasmarket-backup-config.service; then
  systemctl disable --now biasmarket-backup.timer >/dev/null 2>&1 || true
  echo "backup config preflight failed; timer remains disabled" >&2
  exit 1
fi

systemctl enable --now biasmarket-backup.timer
echo "backup config preflight passed; daily timer is enabled"
