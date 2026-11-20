#!/usr/bin/env python3
"""Fetch validated Infisical snapshots into the protected VPS env cache."""

from __future__ import annotations

import argparse
import fcntl
import grp
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


DEFAULT_CONFIG = Path("/etc/biasmarket/infisical.json")
CLI_VERSION = "0.45.13"
KEY_PATTERN = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
REQUIRED_SHARED_KEYS = {
    "POSTGRES_PASSWORD",
    "DATABASE_URL",
    "REDIS_PASSWORD",
    "REDIS_URL",
    "BETTER_AUTH_SECRET",
    "CUSTOMER_ACCOUNT_TOKEN_SECRET",
    "INTERNAL_JOBS_SECRET",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "RESEND_API_KEY",
    "MONITORING_WEBHOOK_SECRET",
    "SITEMAP_INTERNAL_TOKEN",
}


class SyncError(Exception):
    pass


def report(message: str) -> None:
    print(f"biasmarket-infisical-sync: {message}", file=sys.stderr)


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:]
        match = KEY_PATTERN.match(line)
        if not match:
            raise SyncError("Infisical export contains a malformed dotenv line")
        key, value = match.groups()
        if key in values:
            raise SyncError("Infisical export contains a duplicate key")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


def expected_keys(example: Path) -> set[str]:
    return {
        match.group(1)
        for line in example.read_text(encoding="utf-8").splitlines()
        if (match := KEY_PATTERN.match(line.strip()))
    }


def validate_export(path: Path, example: Path, required: set[str]) -> None:
    values = parse_env_file(path)
    missing = expected_keys(example) - values.keys()
    if missing:
        raise SyncError(f"Infisical export is missing keys for {example.name}: {', '.join(sorted(missing))}")

    empty = {key for key in required if not values.get(key, "").strip()}
    if empty:
        raise SyncError(f"Infisical export has empty required keys: {', '.join(sorted(empty))}")

    placeholders = {key for key, value in values.items() if "REPLACE_WITH_REVIEWED_PRODUCTION_VALUE" in value}
    if placeholders:
        raise SyncError(f"Infisical export still contains template placeholders: {', '.join(sorted(placeholders))}")


def load_config(path: Path) -> dict[str, str]:
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SyncError("could not read the root-protected Infisical configuration") from exc

    required = {
        "domain",
        "project_id",
        "environment",
        "shared_path",
        "watchdog_path",
        "client_id",
        "client_secret",
        "cli_version",
    }
    if not isinstance(config, dict) or not required.issubset(config):
        raise SyncError("Infisical configuration is incomplete")
    if not all(isinstance(config[key], str) and config[key] for key in required):
        raise SyncError("Infisical configuration contains an empty or invalid field")
    parsed_domain = urllib.parse.urlsplit(config["domain"])
    if parsed_domain.scheme != "https" or not parsed_domain.hostname or parsed_domain.username or parsed_domain.password or parsed_domain.query or parsed_domain.fragment:
        raise SyncError("production Infisical domain must use HTTPS")
    if config["cli_version"] != CLI_VERSION:
        raise SyncError(f"configuration requests an unsupported Infisical CLI version; expected {CLI_VERSION}")
    return config


def verify_cli(expected_version: str) -> str:
    cli = shutil.which("infisical")
    if not cli:
        raise SyncError("Infisical CLI is not installed")
    try:
        result = subprocess.run([cli, "--version"], capture_output=True, text=True, check=False, timeout=30)
    except subprocess.TimeoutExpired as exc:
        raise SyncError("Infisical CLI version check timed out") from exc
    output = f"{result.stdout}\n{result.stderr}".strip()
    version_pattern = re.compile(rf"(?<![0-9.])v?{re.escape(expected_version)}(?![0-9.])")
    if result.returncode != 0 or not version_pattern.search(output):
        raise SyncError(f"Infisical CLI version must be {expected_version}")
    return cli


def login(config: dict[str, str]) -> str:
    url = config["domain"].rstrip("/") + "/api/v1/auth/universal-auth/login"
    body = urllib.parse.urlencode(
        {"clientId": config["client_id"], "clientSecret": config["client_secret"]}
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None

        opener = urllib.request.build_opener(NoRedirect)
        with opener.open(request, timeout=30) as response:
            payload = json.load(response)
    except (OSError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        raise SyncError("Infisical authentication failed") from exc
    token = payload.get("accessToken") if isinstance(payload, dict) else None
    if not isinstance(token, str) or not token:
        raise SyncError("Infisical returned no access token")
    return token


def export_env(
    cli: str,
    config: dict[str, str],
    token: str,
    path: str,
    output: Path,
) -> None:
    environment = os.environ.copy()
    environment.update(
        {
            "INFISICAL_DOMAIN": config["domain"],
            "INFISICAL_TOKEN": token,
            "UMASK": "077",
        }
    )
    os.umask(0o077)
    try:
        result = subprocess.run(
            [
                cli,
                "export",
                f"--env={config['environment']}",
                f"--projectId={config['project_id']}",
                f"--path={path}",
                "--format=dotenv",
                f"--output-file={output}",
            ],
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=120,
        )
    except subprocess.TimeoutExpired as exc:
        raise SyncError("Infisical secret export timed out") from exc
    if result.returncode != 0 or not output.is_file():
        raise SyncError("Infisical secret export failed")
    os.chmod(output, 0o600)
    if output.stat().st_size == 0:
        raise SyncError("Infisical returned an empty secret export")


@contextmanager
def file_lock(path: Path, timeout_seconds: int = 300) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        deadline = time.monotonic() + timeout_seconds
        while True:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise SyncError("timed out waiting for a deployment or secret-sync lock")
                time.sleep(0.2)
        yield
    finally:
        os.close(descriptor)


def atomic_write(path: Path, content: bytes, mode: int, group_id: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp_path = Path(temp_name)
    try:
        with os.fdopen(descriptor, "wb") as target:
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        os.chmod(temp_path, mode)
        if group_id is not None:
            os.chown(temp_path, 0, group_id)
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def sync_once(root: Path, config_path: Path, check_only: bool = False, lock: bool = True) -> None:
    config = load_config(config_path)
    cli = verify_cli(config["cli_version"])
    env_dir = root / "env"
    state_dir = root / "state"
    shared_example = env_dir / "shared.env.example"
    watchdog_example = env_dir / "watchdog.env.example"
    if not shared_example.is_file() or not watchdog_example.is_file():
        raise SyncError("production env templates are missing from the VPS checkout")

    infisical_lock = file_lock(Path("/run/lock/biasmarket-infisical-sync.lock"))
    deploy_lock = file_lock(state_dir / "deploy.lock")
    with infisical_lock if lock else _noop_context():
        token = login(config)
        env_dir.mkdir(parents=True, exist_ok=True)
        stage_dir = Path(tempfile.mkdtemp(prefix=".infisical-sync-", dir=env_dir))
        os.chmod(stage_dir, 0o700)
        try:
            shared_output = stage_dir / "shared.env"
            watchdog_output = stage_dir / "watchdog.env"
            export_env(cli, config, token, config["shared_path"], shared_output)
            export_env(cli, config, token, config["watchdog_path"], watchdog_output)
            validate_export(shared_output, shared_example, REQUIRED_SHARED_KEYS)
            validate_export(
                watchdog_output,
                watchdog_example,
                {"KUMA_MIGRATION_PUSH_URL", "MIGRATION_WATCHDOG_THRESHOLD_SECONDS"},
            )
            threshold = parse_env_file(watchdog_output)["MIGRATION_WATCHDOG_THRESHOLD_SECONDS"]
            if not threshold.isdecimal() or int(threshold) < 1:
                raise SyncError("Infisical watchdog threshold must be a positive integer")
            if check_only:
                return

            try:
                group_id = grp.getgrnam("deploy").gr_gid
            except KeyError as exc:
                raise SyncError("the deploy group does not exist") from exc

            shared_hash = hashlib.sha256(shared_output.read_bytes()).hexdigest().encode() + b"\n"
            updates = {
                env_dir / "shared.env": shared_output.read_bytes(),
                env_dir / "watchdog.env": watchdog_output.read_bytes(),
                state_dir / "shared_env.sha256": shared_hash,
            }
            with deploy_lock:
                previous = {
                    path: (path.read_bytes(), stat.S_IMODE(path.stat().st_mode), path.stat().st_gid)
                    if path.exists()
                    else None
                    for path in updates
                }
                try:
                    for path, content in updates.items():
                        atomic_write(path, content, 0o640, group_id)
                except OSError:
                    for path, old in previous.items():
                        if old is None:
                            path.unlink(missing_ok=True)
                        else:
                            content, mode, old_gid = old
                            atomic_write(path, content, mode, old_gid)
                    raise
        finally:
            shutil.rmtree(stage_dir, ignore_errors=True)


@contextmanager
def _noop_context() -> Iterator[None]:
    yield


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--check", action="store_true", help="authenticate and validate exports without changing the VPS cache")
    parser.add_argument("--lock-held", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        sync_once(args.root.resolve(), args.config, check_only=args.check, lock=not args.lock_held)
    except SyncError as exc:
        report(str(exc))
        return 1
    except OSError:
        report("secret sync failed; the existing local cache was retained")
        return 1
    report("validation passed; no files changed" if args.check else "secret cache and deploy checksum updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
