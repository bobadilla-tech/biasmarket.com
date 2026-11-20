#!/usr/bin/env bash
# Watch for Infisical config and enable the daily timer only after the runtime
# preflight succeeds. This copy is installed root-owned by cloud-init, outside
# the synced application tree.
set -euo pipefail

ENV_FILE=/home/deploy/biasmarket/env/backup.env
OPT_OUT_FILE=/etc/biasmarket-backup-disabled

if [[ "$(id -u)" -ne 0 ]]; then
  echo "backup-setup.sh must run as root" >&2
  exit 1
fi

systemctl enable --now biasmarket-backup-setup.path

if [[ -e "$OPT_OUT_FILE" ]]; then
  systemctl disable --now biasmarket-backup.timer >/dev/null 2>&1 || true
  echo "scheduled backups remain disabled by $OPT_OUT_FILE"
  exit 0
fi

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
