#!/usr/bin/env python3
"""Interactively configure and verify the production Infisical sync."""

from __future__ import annotations

import getpass
import json
import os
import sys
from pathlib import Path

from infisical_sync import CLI_VERSION, DEFAULT_CONFIG, atomic_write, file_lock, sync_once


ROOT = Path(__file__).resolve().parents[1]
SYSTEMD_SOURCE = ROOT / "systemd"
SYSTEMD_TARGET = Path("/etc/systemd/system")


def prompt(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{label}{suffix}: ").strip()
    return value or default


def main() -> int:
    if os.geteuid() != 0:
        print("Run this command with sudo.", file=sys.stderr)
        return 1

    print("Configure the production Infisical machine identity. The Client Secret is not echoed or passed in command-line arguments.")
    config = {
        "domain": prompt("Infisical HTTPS domain", "https://app.infisical.com").rstrip("/"),
        "project_id": prompt("Production project ID"),
        "environment": prompt("Environment slug", "prod"),
        "shared_path": prompt("Path for shared application secrets", "/"),
        "watchdog_path": prompt("Path for migration watchdog secrets", "/"),
        "client_id": prompt("Machine identity Client ID"),
        "client_secret": getpass.getpass("Machine identity Client Secret: "),
        "cli_version": CLI_VERSION,
    }
    if not all(config[key] for key in ("project_id", "environment", "client_id", "client_secret")):
        print("Project ID, environment, Client ID, and Client Secret are required.", file=sys.stderr)
        return 1

    try:
        config_dir = DEFAULT_CONFIG.parent
        config_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(config_dir, 0o700)
        with file_lock(Path("/run/lock/biasmarket-infisical-sync.lock")):
            candidate = config_dir / ".infisical.json.candidate"
            atomic_write(candidate, (json.dumps(config, indent=2) + "\n").encode(), 0o600)
            try:
                sync_once(ROOT, candidate, check_only=True, lock=False)
                old_config = DEFAULT_CONFIG.read_bytes() if DEFAULT_CONFIG.exists() else None
                atomic_write(DEFAULT_CONFIG, candidate.read_bytes(), 0o600)
                try:
                    sync_once(ROOT, DEFAULT_CONFIG, lock=False)
                except Exception:
                    if old_config is None:
                        DEFAULT_CONFIG.unlink(missing_ok=True)
                    else:
                        atomic_write(DEFAULT_CONFIG, old_config, 0o600)
                    raise
            finally:
                candidate.unlink(missing_ok=True)

        for name in ("biasmarket-infisical-sync.service", "biasmarket-infisical-sync.timer"):
            source = SYSTEMD_SOURCE / name
            target = SYSTEMD_TARGET / name
            atomic_write(target, source.read_bytes(), 0o644)
        import subprocess

        subprocess.run(["systemctl", "daemon-reload"], check=True)
        subprocess.run(["systemctl", "enable", "--now", "biasmarket-infisical-sync.timer"], check=True)
    except Exception as exc:
        print(f"Infisical bootstrap failed ({type(exc).__name__}); existing cached env files were retained when validation or sync failed.", file=sys.stderr)
        return 1

    print("Infisical sync is configured. The cached env files and checksum baseline were updated, and the sync timer is enabled.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
