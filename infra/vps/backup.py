#!/usr/bin/env python3
"""Create one encrypted Restic snapshot of Postgres and versioned MinIO data."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess  # nosec B404 - used only with fixed argv and shell=False
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterable


RESTIC_HOST = "biasmarket-production"
RESTIC_TAG = "biasmarket-production"
BUCKET_ENV = ("S3_BUCKET", "S3_LOGO_BUCKET", "S3_PAYMENT_BUCKET")


def select_latest_object_versions(
    versions: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Select each key's newest non-delete version from ListObjectVersions.

    MinIO returns delete markers separately from Versions. They are deliberately
    not selected: a DB dump taken before a concurrent application delete may
    still reference the old object, which remains retrievable by VersionId.
    Application uploads use UUID object keys and never overwrite an existing
    key; older versions are therefore backups for concurrent deletes, not
    alternate application contents for the same key.
    """
    selected: dict[str, dict[str, Any]] = {}
    for version in versions:
        key = version.get("Key")
        version_id = version.get("VersionId")
        modified = version.get("LastModified")
        if (
            not isinstance(key, str)
            or not key
            or not version_id
            or modified is None
        ):
            raise ValueError("MinIO returned incomplete object-version metadata")
        previous = selected.get(key)
        if previous is None:
            selected[key] = version
            continue
        previous_modified = previous["LastModified"]
        if modified > previous_modified or (
            modified == previous_modified and version.get("IsLatest", False)
        ):
            selected[key] = version
    return [selected[key] for key in sorted(selected)]


def require_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(f"missing required environment setting: {name}")
    return value


def validate_runtime(*, allow_local_repository: bool = False) -> tuple[Path, list[str]]:
    required = [
        "RESTIC_REPOSITORY",
        "RESTIC_PASSWORD",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "BACKUP_SOURCE_ENDPOINT",
        "BACKUP_SOURCE_ACCESS_KEY",
        "BACKUP_SOURCE_SECRET_KEY",
        "KUMA_BACKUP_PUSH_URL",
        "PGHOST",
        "PGUSER",
        "PGPASSWORD",
        "PGDATABASE",
        "BACKUP_STAGE_DIR",
        *BUCKET_ENV,
    ]
    for name in required:
        require_env(name)

    if len(os.environ["RESTIC_PASSWORD"]) < 32:
        raise RuntimeError("RESTIC_PASSWORD must be at least 32 characters")
    repository = os.environ["RESTIC_REPOSITORY"]
    if allow_local_repository:
        if os.environ.get("BIASMARKET_BACKUP_TEST_MODE") != "1":
            raise RuntimeError("local Restic repositories are only allowed in backup test mode")
        if not Path(repository).is_absolute():
            raise RuntimeError("test Restic repository must be an absolute local path")
    elif not repository.startswith("s3:https://"):
        raise RuntimeError("RESTIC_REPOSITORY must use s3:https://")
    endpoint = os.environ["BACKUP_SOURCE_ENDPOINT"]
    if not endpoint.startswith(("http://", "https://")):
        raise RuntimeError("BACKUP_SOURCE_ENDPOINT must use http(s)")
    push_url = os.environ["KUMA_BACKUP_PUSH_URL"]
    if not push_url.startswith("https://") or "/api/push/" not in push_url:
        raise RuntimeError("KUMA_BACKUP_PUSH_URL must be an HTTPS Kuma push URL")
    buckets = [os.environ[name] for name in BUCKET_ENV]
    if len(set(buckets)) != len(buckets):
        raise RuntimeError("the three MinIO bucket names must be distinct")

    stage = Path(os.environ["BACKUP_STAGE_DIR"])
    stage.mkdir(mode=0o700, parents=True, exist_ok=True)
    stage.chmod(0o700)
    if stage.stat().st_uid != os.getuid():
        raise RuntimeError("BACKUP_STAGE_DIR must be owned by the backup process")
    return stage, buckets


def make_minio_client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=os.environ["BACKUP_SOURCE_ENDPOINT"],
        aws_access_key_id=os.environ["BACKUP_SOURCE_ACCESS_KEY"],
        aws_secret_access_key=os.environ["BACKUP_SOURCE_SECRET_KEY"],
        region_name=os.environ.get("BACKUP_SOURCE_REGION", "us-east-1"),
        config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
    )


def assert_versioning_and_access(client: Any, buckets: list[str]) -> None:
    for bucket in buckets:
        status = client.get_bucket_versioning(Bucket=bucket).get("Status")
        if status != "Enabled":
            raise RuntimeError(f"source bucket {bucket} must have versioning enabled")
        # Check permissions before creating a database dump.
        client.list_object_versions(Bucket=bucket, MaxKeys=1)


def list_latest_versions(client: Any, bucket: str) -> list[dict[str, Any]]:
    paginator = client.get_paginator("list_object_versions")
    versions: list[dict[str, Any]] = []
    for page in paginator.paginate(Bucket=bucket, PaginationConfig={"PageSize": 1000}):
        versions.extend(page.get("Versions", []))
    return select_latest_object_versions(versions)


def pg_database_size() -> int:
    result = subprocess.run(  # nosec B603 - fixed argv and shell=False
        [
            "psql",
            "--no-psqlrc",
            "--tuples-only",
            "--no-align",
            "--command",
            "SELECT pg_database_size(current_database())",
        ],
        check=True,
        capture_output=True,
        text=True,
        shell=False,
    )
    return int(result.stdout.strip())


def ensure_capacity(
    stage: Path,
    database_bytes: int,
    selections: dict[str, list[dict[str, Any]]],
) -> None:
    object_bytes = sum(
        int(version.get("Size", 0))
        for bucket_versions in selections.values()
        for version in bucket_versions
    )
    estimated = database_bytes + object_bytes
    safety_margin = max(1024**3, estimated // 5)
    free = shutil.disk_usage(stage).free
    if free < estimated + safety_margin:
        raise RuntimeError(
            "insufficient backup staging space for the estimated database and object data"
        )


def dump_postgres(destination: Path) -> None:
    if destination.name != "postgres.dump":
        raise ValueError("Postgres dump destination must use its fixed filename")
    subprocess.run(  # nosec B603 - fixed argv and shell=False
        [
            "pg_dump",
            "--format=custom",
            "--no-owner",
            "--no-acl",
            "--file=postgres.dump",
        ],
        cwd=destination.parent,
        check=True,
        shell=False,
    )
    if destination.stat().st_size == 0:
        raise RuntimeError("Postgres dump is empty")


def safe_object_name(bucket: str, key: str) -> str:
    bucket_id = hashlib.sha256(bucket.encode("utf-8")).hexdigest()
    digest = hashlib.sha256(f"{bucket}\0{key}".encode("utf-8")).hexdigest()
    return f"objects/{bucket_id}/{digest}"


def export_objects(
    client: Any,
    selections: dict[str, list[dict[str, Any]]],
    payload: Path,
) -> list[dict[str, Any]]:
    objects_dir = payload / "objects"
    objects_dir.mkdir(mode=0o700)
    manifest: list[dict[str, Any]] = []

    for bucket, versions in selections.items():
        for version in versions:
            key = version["Key"]
            relative_name = safe_object_name(bucket, key)
            destination = payload / relative_name
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            response = client.get_object(
                Bucket=bucket,
                Key=key,
                VersionId=version["VersionId"],
            )
            with destination.open("wb") as output:
                body = response["Body"]
                while True:
                    chunk = body.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
            if destination.stat().st_size != int(version.get("Size", 0)):
                raise RuntimeError("downloaded object version size did not match MinIO metadata")
            manifest.append(
                {
                    "bucket": bucket,
                    "key": key,
                    "versionId": version["VersionId"],
                    "file": relative_name,
                    "size": destination.stat().st_size,
                    "etag": response.get("ETag", "").strip('"'),
                    "contentType": response.get("ContentType", "application/octet-stream"),
                    "lastModified": version["LastModified"].astimezone(dt.timezone.utc).isoformat(),
                }
            )
    return manifest


def run_restic_backup(payload: Path) -> str:
    completed = subprocess.run(  # nosec B603 - fixed argv and shell=False
        [
            "restic",
            "backup",
            "--json",
            "--host",
            RESTIC_HOST,
            "--tag",
            RESTIC_TAG,
            ".",
        ],
        cwd=payload,
        check=True,
        capture_output=True,
        text=True,
        shell=False,
    )
    summary = None
    for line in completed.stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("message_type") == "summary":
            summary = event
    snapshot_id = (summary or {}).get("snapshot_id")
    if not snapshot_id:
        raise RuntimeError("Restic did not report a completed snapshot")
    snapshots = subprocess.run(  # nosec B603 - fixed argv and shell=False
        [
            "restic",
            "snapshots",
            "--json",
        ],
        check=True,
        capture_output=True,
        text=True,
        shell=False,
    )
    try:
        existing_snapshots = json.loads(snapshots.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("Restic returned invalid snapshot metadata") from error
    existing_ids = [
        item.get("id")
        for item in existing_snapshots
        if isinstance(item.get("id"), str)
    ]
    if snapshot_id not in existing_ids:
        raise RuntimeError(
            "Restic snapshot could not be read back "
            f"(snapshot_id={snapshot_id}, expected_host={RESTIC_HOST}, "
            f"expected_tag={RESTIC_TAG}, returned_ids={existing_ids[:10]})"
        )
    return snapshot_id


def prune_restic() -> None:
    subprocess.run(  # nosec B603 - fixed argv and shell=False
        [
            "restic",
            "forget",
            "--group-by",
            "host,tags",
            "--tag",
            RESTIC_TAG,
            "--keep-daily",
            "30",
            "--keep-monthly",
            "12",
            "--prune",
        ],
        check=True,
        capture_output=True,
        text=True,
        shell=False,
    )
    subprocess.run(  # nosec B603 - fixed argv and shell=False
        ["restic", "check"],
        check=True,
        capture_output=True,
        text=True,
        shell=False,
    )


def send_success_heartbeat() -> None:
    try:
        request = urllib.request.Request(
            os.environ["KUMA_BACKUP_PUSH_URL"],
            method="GET",
        )
        opener = urllib.request.build_opener(_NoRedirectHandler)
        with opener.open(request, timeout=10) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError("Kuma backup heartbeat failed")
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("Kuma backup heartbeat failed") from None


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def backup_once(*, allow_local_repository: bool = False) -> str:
    stage_root, buckets = validate_runtime(allow_local_repository=allow_local_repository)
    client = make_minio_client()
    assert_versioning_and_access(client, buckets)
    payload = stage_root / "payload"
    # Recover space after a host kill/power loss before making a free-space
    # estimate; the previous run's finally block may not have executed.
    if payload.exists():
        shutil.rmtree(payload)

    # Object keys are UUID-based and immutable in StorageService. Capturing
    # after pg_dump safely includes objects uploaded before the DB snapshot,
    # even if a key is concurrently deleted after that snapshot: versioning
    # retains its value version and delete markers are not selected. Uploads
    # after the DB snapshot may be harmless extras. Do not change this to a
    # timestamp cutoff without proving database/MinIO clock alignment.
    selections = {bucket: list_latest_versions(client, bucket) for bucket in buckets}
    database_bytes = pg_database_size()
    ensure_capacity(stage_root, database_bytes, selections)

    payload.mkdir(mode=0o700)
    try:
        dump_postgres(payload / "postgres.dump")
        # List versions after pg_dump. The database snapshot is fixed before
        # listing begins: every referenced key was uploaded before its row
        # committed. UUID keys are immutable, so later uploads are extras;
        # concurrent deletes leave the referenced value version addressable.
        selections = {bucket: list_latest_versions(client, bucket) for bucket in buckets}
        actual_object_bytes = sum(
            int(version.get("Size", 0))
            for bucket_versions in selections.values()
            for version in bucket_versions
        )
        remaining = shutil.disk_usage(stage_root).free
        if remaining < actual_object_bytes + max(1024**3, actual_object_bytes // 5):
            raise RuntimeError("insufficient staging space for MinIO object export")
        manifest = export_objects(client, selections, payload)
        manifest_path = payload / "manifest.json"
        manifest_path.write_text(
            json.dumps(
                {
                    "format": 1,
                    "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "sourceBuckets": buckets,
                    "databaseFormat": "pg_dump-custom",
                    "objects": manifest,
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        manifest_path.chmod(0o600)
        snapshot_id = run_restic_backup(payload)
        prune_restic()
        send_success_heartbeat()
        return snapshot_id
    finally:
        shutil.rmtree(payload, ignore_errors=True)


def main() -> int:
    try:
        snapshot_id = backup_once()
    except Exception as exc:
        # Exception strings from third-party clients may contain endpoints or
        # object keys. Emit only the type; systemd journals must not expose
        # credentials or payment object identifiers.
        print(f"backup failed ({type(exc).__name__})", file=sys.stderr)
        return 1
    print(f"backup complete snapshot={snapshot_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
