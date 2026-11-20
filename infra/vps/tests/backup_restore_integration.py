#!/usr/bin/env python3
"""Disposable-container restore integration, run inside backup.Dockerfile."""

from __future__ import annotations

import hashlib
import http.client
import importlib.util
import json
import os
import re
import subprocess  # nosec B404 - only fixed executable names and argv are used below
import time
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config


BACKUP_MODULE_PATH = Path("/usr/local/libexec/biasmarket-backup.py")
BACKUP_STAGE = Path(os.environ["BACKUP_STAGE_DIR"])
RESTORE_ROOT = BACKUP_STAGE / "restored-snapshot"
SOURCE_BUCKETS = ("products", "logos", "payments")
DATABASE_NAME = "backup_ci"
MINIO_ACCESS_KEY = os.environ["BACKUP_SOURCE_ACCESS_KEY"]
MINIO_SECRET_KEY = os.environ["BACKUP_SOURCE_SECRET_KEY"]


def command(args: list[str]) -> str:
    result = subprocess.run(
        args,
        check=True,
        capture_output=True,
        text=True,
        shell=False,
    )  # nosec B603 - callers use fixed executables and arguments in disposable CI services
    return result.stdout.strip()


def set_environment(values: dict[str, str]) -> dict[str, str | None]:
    previous = {name: os.environ.get(name) for name in values}
    os.environ.update(values)
    return previous


def restore_environment(previous: dict[str, str | None]) -> None:
    for name, value in previous.items():
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value


def s3_client(endpoint: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        region_name="us-east-1",
        config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
    )


def wait_for_services() -> None:
    for attempt in range(60):
        try:
            s3_client(os.environ["BACKUP_SOURCE_ENDPOINT"]).list_buckets()
            s3_client(os.environ["RESTORE_MINIO_ENDPOINT"]).list_buckets()
            subprocess.run(
                [
                    "pg_isready",
                    "--host",
                    "postgres-source",
                    "--port",
                    "5432",
                ],
                check=True,
                capture_output=True,
                text=True,
                shell=False,
            )
            subprocess.run(
                [
                    "pg_isready",
                    "--host",
                    "postgres-restore",
                    "--port",
                    "5432",
                ],
                check=True,
                capture_output=True,
                text=True,
                shell=False,
            )
            return
        except Exception:
            if attempt == 59:
                raise
            time.sleep(1)


def seed_source() -> tuple[dict[tuple[str, str], tuple[str, str]], list[tuple[str, str]]]:
    client = s3_client(os.environ["BACKUP_SOURCE_ENDPOINT"])
    for bucket in SOURCE_BUCKETS:
        client.create_bucket(Bucket=bucket)
        client.put_bucket_versioning(
            Bucket=bucket,
            VersioningConfiguration={"Status": "Enabled"},
        )

    fixtures = {
        ("products", "product-image.txt"): (b"product-v1", b"product-v2", True),
        ("logos", "brand-logo.txt"): (b"logo-v1", b"logo-v2", False),
        ("payments", "proof.txt"): (b"proof-v1", b"proof-v2", True),
    }
    expected: dict[tuple[str, str], tuple[str, str]] = {}
    delete_after_dump: list[tuple[str, str]] = []
    for (bucket, key), (first, current, deleted) in fixtures.items():
        client.put_object(Bucket=bucket, Key=key, Body=first)
        # MinIO's LastModified metadata has second-level resolution on some
        # releases. Keep this inventory deterministic when selecting a latest
        # version from the S3 version listing.
        time.sleep(1.1)
        latest = client.put_object(Bucket=bucket, Key=key, Body=current)
        if deleted:
            delete_after_dump.append((bucket, key))
        expected[(bucket, key)] = (
            str(latest["VersionId"]),
            hashlib.sha256(current).hexdigest(),
        )

    command(
        [
            "psql", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--command",
            "CREATE TABLE restore_probe (id integer PRIMARY KEY, label text NOT NULL); "
            "INSERT INTO restore_probe VALUES (1, 'database-restored'); "
            "CREATE TABLE object_references (bucket text NOT NULL, object_key text NOT NULL); "
            "INSERT INTO object_references VALUES "
            "('products', 'product-image.txt'), ('logos', 'brand-logo.txt'), "
            "('payments', 'proof.txt');",
        ]
    )
    return expected, delete_after_dump


def run_backup() -> tuple[str, dict[tuple[str, str], tuple[str, str]]]:
    expected, delete_after_dump = seed_source()
    spec = importlib.util.spec_from_file_location("biasmarket_backup", BACKUP_MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the production backup module")
    backup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backup)

    # Exercise backup_once, object export, real pg_dump, Restic backup/verify,
    # retention, and Restic check. Only the external Kuma ping is suppressed.
    backup.send_success_heartbeat = lambda: None
    original_dump = backup.dump_postgres

    def dump_then_delete(destination: Path) -> None:
        original_dump(destination)
        source = s3_client(os.environ["BACKUP_SOURCE_ENDPOINT"])
        for bucket, key in delete_after_dump:
            marker = source.delete_object(Bucket=bucket, Key=key)
            if not marker.get("VersionId"):
                raise AssertionError(f"MinIO did not create a delete marker for {bucket}/{key}")

    backup.dump_postgres = dump_then_delete
    command(["restic", "init"])
    snapshot_id = backup.backup_once(allow_local_repository=True)
    original_password = os.environ["RESTIC_PASSWORD"]
    try:
        os.environ["RESTIC_PASSWORD"] = hashlib.sha256(
            b"incorrect-ci-test-password"
        ).hexdigest()
        wrong_password = subprocess.run(
            ["restic", "snapshots", "--json"],
            check=False,
            capture_output=True,
            text=True,
            shell=False,
        )  # nosec B603 - fixed Restic command with an intentionally wrong test password
    finally:
        os.environ["RESTIC_PASSWORD"] = original_password
    if wrong_password.returncode == 0:
        raise AssertionError("Restic repository was readable with the wrong password")
    return snapshot_id, expected


def restore_and_verify(
    snapshot_id: str,
    expected: dict[tuple[str, str], tuple[str, str]],
) -> None:
    RESTORE_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not re.fullmatch(r"[0-9a-f]{64}", snapshot_id):
        raise AssertionError("Restic returned an invalid snapshot identifier")
    command(["restic", "restore", snapshot_id, "--target", str(RESTORE_ROOT)])
    payload = RESTORE_ROOT / "postgres.dump"
    manifest_path = RESTORE_ROOT / "manifest.json"
    if not payload.is_file() or not manifest_path.is_file():
        raise AssertionError("Restic restore omitted the Postgres dump or object manifest")

    previous_restore_env = set_environment(
        dict(
            PGHOST=os.environ["RESTORE_PGHOST"],
            PGPORT=os.environ["RESTORE_PGPORT"],
            PGUSER=os.environ["RESTORE_PGUSER"],
            PGPASSWORD=os.environ["RESTORE_PGPASSWORD"],
            PGDATABASE=DATABASE_NAME,
        )
    )
    command(
        [
            "pg_restore",
            "--exit-on-error",
            "--no-owner",
            "--no-acl",
            "--dbname",
            DATABASE_NAME,
            str(payload),
        ],
    )
    database_result = command(
        [
            "psql",
            "--no-psqlrc",
            "--tuples-only",
            "--no-align",
            "--command",
            "SELECT label FROM restore_probe WHERE id = 1",
        ],
    )
    if database_result != "database-restored":
        raise AssertionError(f"unexpected restored database row: {database_result!r}")

    manifest: dict[str, Any] = json.loads(manifest_path.read_text(encoding="utf-8"))
    if len(manifest["objects"]) != len(expected):
        raise AssertionError("backup exported old versions or included delete markers")
    entries = {(item["bucket"], item["key"]): item for item in manifest["objects"]}
    if set(entries) != set(expected):
        raise AssertionError(f"unexpected object set in manifest: {sorted(entries)}")

    restore_client = s3_client(os.environ["RESTORE_MINIO_ENDPOINT"])
    for bucket in SOURCE_BUCKETS:
        restore_client.create_bucket(Bucket=bucket)
        restore_client.put_bucket_versioning(
            Bucket=bucket,
            VersioningConfiguration={"Status": "Enabled"},
        )
    for bucket in ("products", "logos"):
        restore_client.put_bucket_policy(
            Bucket=bucket,
            Policy=json.dumps(
                {
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Principal": {"AWS": ["*"]},
                            "Action": ["s3:GetObject"],
                            "Resource": [f"arn:aws:s3:::{bucket}/*"],
                        }
                    ],
                }
            ),
        )

    for identity, (expected_version, expected_hash) in expected.items():
        entry = entries[identity]
        if entry["versionId"] != expected_version:
            raise AssertionError(
                f"{identity} selected version {entry['versionId']!r}, expected {expected_version!r}"
            )
        relative_file = Path(entry["file"])
        if (
            not relative_file.parts
            or relative_file.is_absolute()
            or ".." in relative_file.parts
            or relative_file.parts[0] != "objects"
        ):
            raise AssertionError("backup manifest contains an unsafe object file path")
        object_file = RESTORE_ROOT / relative_file
        contents = object_file.read_bytes()
        if hashlib.sha256(contents).hexdigest() != expected_hash:
            raise AssertionError(f"Restic restore returned the wrong bytes for {identity}")
        bucket, key = identity
        restore_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=contents,
            ContentType=entry["contentType"],
        )
        restored = restore_client.get_object(Bucket=bucket, Key=key)["Body"].read()
        if hashlib.sha256(restored).hexdigest() != expected_hash:
            raise AssertionError(f"MinIO restore returned the wrong bytes for {identity}")
        connection = http.client.HTTPConnection(
            "minio-restore", port=9000, timeout=10
        )
        try:
            connection.request("GET", f"/{bucket}/{key}")
            response = connection.getresponse()
            anonymous_status = response.status
            anonymous_body = response.read()
        finally:
            connection.close()
        if bucket in ("products", "logos"):
            if (
                anonymous_status != 200
                or hashlib.sha256(anonymous_body).hexdigest() != expected_hash
            ):
                raise AssertionError(f"public restored object is unreadable: {identity}")
        else:
            if anonymous_status != 403:
                raise AssertionError("restored payment proof is anonymously readable")

    references = command(
        [
            "psql",
            "--no-psqlrc",
            "--tuples-only",
            "--no-align",
            "--command",
            "SELECT bucket || '/' || object_key FROM object_references ORDER BY bucket, object_key",
        ],
    )
    expected_references = "\n".join(sorted(f"{bucket}/{key}" for bucket, key in expected))
    if references != expected_references:
        raise AssertionError(f"unexpected restored object references: {references!r}")
    restore_environment(previous_restore_env)


def main() -> None:
    wait_for_services()
    snapshot_id, expected = run_backup()
    restore_and_verify(snapshot_id, expected)
    print(
        "Disposable backup restore passed: Postgres rows and all three MinIO "
        "objects restored; version IDs matched, including delete-marker cases."
    )


if __name__ == "__main__":
    main()
