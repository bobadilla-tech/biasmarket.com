#!/usr/bin/env python3
"""Create one encrypted Restic snapshot of Postgres and versioned MinIO data."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess  # nosec B404 - used only with fixed argv and shell=False
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote, urlsplit


RESTIC_HOST = "biasmarket-production"
RESTIC_TAG = "biasmarket-production"
BUCKET_ENV = ("S3_BUCKET", "S3_LOGO_BUCKET", "S3_PAYMENT_BUCKET")
MARKDOWN_LINK_RE = re.compile(
    r"!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+['\"][^)]*['\"])?\s*\)"
)
URL_RE = re.compile(r"https?://[^\s\"'<>]+")


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
        "S3_PUBLIC_URL",
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
    public_bases = [os.environ["S3_PUBLIC_URL"]]
    public_bases.extend(
        base.strip()
        for base in os.environ.get("S3_LEGACY_PUBLIC_URLS", "").split(",")
        if base.strip()
    )
    for base in public_bases:
        parsed = urlsplit(base)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.query
            or parsed.fragment
        ):
            raise RuntimeError(
                "S3 public URL bases must be absolute http(s) URLs without query or fragment"
            )

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


def select_referenced_versions(
    database_references: set[tuple[str, str]],
    selections: dict[str, list[dict[str, Any]]],
) -> dict[str, list[dict[str, Any]]]:
    inventory = {
        (bucket, version["Key"])
        for bucket, versions in selections.items()
        for version in versions
    }
    if database_references - inventory:
        raise RuntimeError(
            "database snapshot references MinIO objects with no readable value version"
        )
    return {
        bucket: [
            version
            for version in versions
            if (bucket, version["Key"]) in database_references
        ]
        for bucket, versions in selections.items()
    }


DATABASE_REFERENCE_QUERY = r'''
SELECT value FROM (
  SELECT "logoUrl" AS value FROM "Store"
  UNION ALL SELECT "bannerUrl" FROM "Store"
  UNION ALL SELECT "publicOwnerAvatarUrl" FROM "Store"
  UNION ALL SELECT "aboutMarkdown" FROM "Store"
  UNION ALL SELECT unnest("images") FROM "Product"
  UNION ALL SELECT "imageOverride" FROM "ProductVariant"
  UNION ALL SELECT "imageUrl" FROM "Category"
  UNION ALL SELECT "imageUrl" FROM "StoreReference"
  UNION ALL SELECT "content"::text FROM "StoreSection"
  UNION ALL SELECT "details"::text FROM "PaymentMethodConfig"
  UNION ALL SELECT "packedPhotoUrl" FROM "Order"
  UNION ALL SELECT "imageUrl" FROM "OrderPayment"
) AS object_reference_values
WHERE value IS NOT NULL;
'''


def parse_object_references(
    values: Iterable[str], buckets: list[str]
) -> set[tuple[str, str]]:
    references: set[tuple[str, str]] = set()
    known_buckets = set(buckets)
    public_bases = [os.environ.get("S3_PUBLIC_URL", "https://cdn.biasmarket.com")]
    public_bases.extend(
        base.strip()
        for base in os.environ.get("S3_LEGACY_PUBLIC_URLS", "").split(",")
        if base.strip()
    )
    parsed_bases = []
    for base in public_bases:
        parsed = urlsplit(base)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            parsed_bases.append(
                (parsed.scheme.lower(), parsed.netloc.lower(), parsed.path.rstrip("/"))
            )
    parsed_bases.sort(key=lambda item: len(item[2]), reverse=True)
    for value in values:
        markdown_matches = list(MARKDOWN_LINK_RE.finditer(value))
        candidates = [match.group(1) or match.group(2) for match in markdown_matches]
        remaining = MARKDOWN_LINK_RE.sub(" ", value)
        candidates.extend(URL_RE.findall(remaining))
        for candidate in candidates:
            candidate = candidate.rstrip(".,;]")
            try:
                parsed_url = urlsplit(candidate)
            except ValueError:
                # User-authored Markdown may contain malformed IPv6 URLs.
                # One bad candidate must not fail an otherwise valid backup.
                continue
            if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
                continue
            base_path = None
            for scheme, netloc, path in parsed_bases:
                if (
                    parsed_url.scheme.lower() == scheme
                    and parsed_url.netloc.lower() == netloc
                    and (
                        not path
                        or parsed_url.path == path
                        or parsed_url.path.startswith(f"{path}/")
                    )
                ):
                    base_path = path
                    break
            if base_path is None:
                continue
            remainder = (
                parsed_url.path[len(base_path) :] if base_path else parsed_url.path
            )
            path_parts = [part for part in remainder.split("/") if part]
            if len(path_parts) < 2:
                continue
            bucket = unquote(path_parts[0])
            key = unquote("/".join(path_parts[1:]))
            if bucket in known_buckets and key:
                references.add((bucket, key))
    return references


def dump_postgres(destination: Path) -> set[tuple[str, str]]:
    if destination.name != "postgres.dump":
        raise ValueError("Postgres dump destination must use its fixed filename")
    # Keep the exported MVCC snapshot alive while pg_dump and the reference
    # query consume it. That makes the manifest's reference flags describe
    # the exact database recovery point, independent of MinIO/database clocks.
    snapshot = subprocess.Popen(  # nosec B603 - fixed argv and shell=False
        ["psql", "--no-psqlrc", "--quiet", "--tuples-only", "--no-align"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        shell=False,
    )
    assert snapshot.stdin is not None and snapshot.stdout is not None
    snapshot.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n")
    snapshot.stdin.write("SELECT pg_export_snapshot();\n")
    snapshot.stdin.flush()
    snapshot_id = snapshot.stdout.readline().strip()
    if not re.fullmatch(r"[0-9A-Fa-f-]+", snapshot_id):
        snapshot.kill()
        raise RuntimeError("Postgres did not export a valid backup snapshot")
    try:
        subprocess.run(  # nosec B603 - fixed argv and shell=False
            [
                "pg_dump", "--format=custom", "--no-owner", "--no-acl",
                f"--snapshot={snapshot_id}", "--file=postgres.dump",
            ],
            cwd=destination.parent,
            check=True,
            shell=False,
        )
        references_result = subprocess.run(  # nosec B603 - fixed psql query
            [
                "psql", "--no-psqlrc", "--tuples-only", "--no-align",
                "--set", "ON_ERROR_STOP=1", "--command",
                f"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; "
                f"SET TRANSACTION SNAPSHOT '{snapshot_id}'; "
                f"{DATABASE_REFERENCE_QUERY}",
            ],
            check=True,
            capture_output=True,
            text=True,
            shell=False,
        )
        references = parse_object_references(
            references_result.stdout.splitlines(), [os.environ[name] for name in BUCKET_ENV]
        )
    finally:
        snapshot.stdin.write("ROLLBACK;\n\\q\n")
        snapshot.stdin.flush()
        snapshot.wait(timeout=30)
    if destination.stat().st_size == 0:
        raise RuntimeError("Postgres dump is empty")
    return references


def safe_object_name(bucket: str, key: str) -> str:
    bucket_id = hashlib.sha256(bucket.encode("utf-8")).hexdigest()
    digest = hashlib.sha256(f"{bucket}\0{key}".encode("utf-8")).hexdigest()
    return f"objects/{bucket_id}/{digest}"


def export_objects(
    client: Any,
    selections: dict[str, list[dict[str, Any]]],
    payload: Path,
    database_references: set[tuple[str, str]],
) -> list[dict[str, Any]]:
    objects_dir = payload / "objects"
    objects_dir.mkdir(mode=0o700)
    manifest: list[dict[str, Any]] = []

    for bucket, versions in selections.items():
        for version in versions:
            key = version["Key"]
            referenced = (bucket, key) in database_references
            if not referenced:
                # Keep the disposition in the manifest for auditability, but
                # do not copy orphaned/deleted bytes into the Restic payload.
                manifest.append(
                    {
                        "bucket": bucket,
                        "key": key,
                        "versionId": version["VersionId"],
                        "file": None,
                        "size": int(version.get("Size", 0)),
                        "etag": version.get("ETag", "").strip('"'),
                        "contentType": version.get(
                            "ContentType", "application/octet-stream"
                        ),
                        "lastModified": version["LastModified"]
                        .astimezone(dt.timezone.utc)
                        .isoformat(),
                        "databaseReferenced": False,
                    }
                )
                continue
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
                    "databaseReferenced": referenced,
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
    matching_ids = [
        item_id for item_id in existing_ids if item_id.startswith(snapshot_id)
    ]
    if len(matching_ids) != 1:
        raise RuntimeError(
            "Restic snapshot could not be read back "
            f"(snapshot_id={snapshot_id}, expected_host={RESTIC_HOST}, "
            f"expected_tag={RESTIC_TAG}, returned_ids={existing_ids[:10]})"
        )
    return matching_ids[0]


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

    # Export candidates after the MVCC snapshot. The manifest records which
    # candidate keys were referenced by that exact snapshot; restore skips
    # unreferenced keys, including objects deleted before the recovery point.
    database_bytes = pg_database_size()
    ensure_capacity(stage_root, database_bytes, {})

    payload.mkdir(mode=0o700)
    try:
        database_references = dump_postgres(payload / "postgres.dump")
        # List versions after pg_dump. The database snapshot is fixed before
        # listing begins: every referenced key was uploaded before its row
        # committed. UUID keys are immutable, so later uploads are extras;
        # concurrent deletes leave the referenced value version addressable.
        selections = {bucket: list_latest_versions(client, bucket) for bucket in buckets}
        referenced_selections = select_referenced_versions(database_references, selections)
        ensure_capacity(stage_root, 0, referenced_selections)
        manifest = export_objects(client, selections, payload, database_references)
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
