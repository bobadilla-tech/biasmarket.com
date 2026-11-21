import datetime as dt
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT = Path(__file__).parents[1] / "backup.py"
SPEC = importlib.util.spec_from_file_location("biasmarket_backup", SCRIPT)
backup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backup)


class FakeBody:
    def __init__(self, content):
        self.content = content

    def read(self, size):
        content, self.content = self.content[:size], self.content[size:]
        return content


class FakeClient:
    def __init__(self):
        self.requested_versions = []

    def get_object(self, Bucket, Key, VersionId):
        self.requested_versions.append((Bucket, Key, VersionId))
        return {
            "Body": FakeBody(b"database-snapshot-object"),
            "ETag": '"abc123"',
            "ContentType": "image/jpeg",
        }


class FakeVersionPaginator:
    def __init__(self, pages):
        self.pages = pages

    def paginate(self, **kwargs):
        return iter(self.pages)


class FakeVersionListingClient:
    def __init__(self, pages):
        self.pages = pages

    def get_paginator(self, operation):
        if operation != "list_object_versions":
            raise AssertionError(operation)
        return FakeVersionPaginator(self.pages)


class BackupVersionSelectionTests(unittest.TestCase):
    def test_restic_backup_prefix_resolves_to_unique_full_snapshot_id(self):
        full_id = "9f4e95df90138a200f9389e8b7b0fd82b0d705f48ffafa7ce5b4d9f2b71f4fa3"
        results = [
            SimpleNamespace(
                stdout='{"message_type":"summary","snapshot_id":"9f4e95df"}\n',
            ),
            SimpleNamespace(stdout=f'[{{"id":"{full_id}"}}]'),
        ]
        with patch.object(backup.subprocess, "run", side_effect=results):
            snapshot_id = backup.run_restic_backup(Path("unused-payload"))
        self.assertEqual(snapshot_id, full_id)

    def test_restic_backup_rejects_ambiguous_snapshot_prefix(self):
        short_id = "9f4e95df"
        results = [
            SimpleNamespace(
                stdout=f'{{"message_type":"summary","snapshot_id":"{short_id}"}}\n',
            ),
            SimpleNamespace(
                stdout='[{"id":"9f4e95df90138a200f9389e8b7b0fd82b0d705f48ffafa7ce5b4d9f2b71f4fa3"},'
                '{"id":"9f4e95df00138a200f9389e8b7b0fd82b0d705f48ffafa7ce5b4d9f2b71f4fa3"}]',
            ),
        ]
        with patch.object(backup.subprocess, "run", side_effect=results):
            with self.assertRaisesRegex(RuntimeError, "could not be read back"):
                backup.run_restic_backup(Path("unused-payload"))

    def test_concurrent_delete_keeps_pre_snapshot_object_version(self):
        # Timeline: pg_dump takes its MVCC snapshot, then application deletion
        # adds a marker. ListObjectVersions includes the older readable value
        # version even though that marker is now the current key state.
        created = dt.datetime(2026, 11, 20, tzinfo=dt.timezone.utc)
        client = FakeVersionListingClient(
            [
                {
                    "Versions": [
                        {
                            "Key": "products/uuid.jpg",
                            "VersionId": "upload-v1",
                            "LastModified": created,
                            "Size": 24,
                            "IsLatest": False,
                        }
                    ],
                    "DeleteMarkers": [
                        {
                            "Key": "products/uuid.jpg",
                            "VersionId": "delete-v2",
                            "LastModified": created + dt.timedelta(seconds=1),
                            "IsLatest": True,
                        }
                    ],
                }
            ]
        )
        selected = backup.list_latest_versions(client, "products")
        self.assertEqual([item["VersionId"] for item in selected], ["upload-v1"])

    def test_concurrent_upload_after_database_snapshot_is_safe_extra(self):
        created = dt.datetime(2026, 11, 20, tzinfo=dt.timezone.utc)
        inventory = [
            {
                "Key": "products/preexisting.jpg",
                "VersionId": "before-snapshot",
                "LastModified": created,
                "Size": 1,
                "IsLatest": True,
            },
            {
                "Key": "products/new-upload.jpg",
                "VersionId": "after-snapshot",
                "LastModified": created + dt.timedelta(seconds=1),
                "Size": 1,
                "IsLatest": True,
            },
        ]
        selected = backup.select_latest_object_versions(inventory)
        self.assertEqual(
            [item["Key"] for item in selected],
            ["products/new-upload.jpg", "products/preexisting.jpg"],
        )

    def test_export_requests_exact_selected_version(self):
        client = FakeClient()
        timestamp = dt.datetime(2026, 11, 20, tzinfo=dt.timezone.utc)
        selections = {
            "products": [
                {
                    "Key": "products/uuid.jpg",
                    "VersionId": "retained-version",
                    "LastModified": timestamp,
                    "Size": 24,
                }
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            payload = Path(directory)
            manifest = backup.export_objects(
                client,
                selections,
                payload,
                {("products", "products/uuid.jpg")},
            )
            object_file = payload / manifest[0]["file"]
            self.assertEqual(object_file.read_bytes(), b"database-snapshot-object")
            self.assertEqual(
                client.requested_versions,
                [("products", "products/uuid.jpg", "retained-version")],
            )
            self.assertTrue(manifest[0]["databaseReferenced"])

    def test_export_records_but_does_not_copy_unreferenced_versions(self):
        client = FakeClient()
        timestamp = dt.datetime(2026, 11, 20, tzinfo=dt.timezone.utc)
        selections = {
            "products": [
                {
                    "Key": "products/deleted-before-recovery.jpg",
                    "VersionId": "orphaned-version",
                    "LastModified": timestamp,
                    "Size": 24,
                }
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            manifest = backup.export_objects(client, selections, Path(directory), set())
        self.assertFalse(manifest[0]["databaseReferenced"])
        self.assertIsNone(manifest[0]["file"])
        self.assertEqual(client.requested_versions, [])

    def test_local_repository_requires_explicit_backup_test_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {
                "RESTIC_REPOSITORY": f"{directory}/repository",
                "RESTIC_PASSWORD": "local-test-password-that-is-long-enough-123",  # nosec B105 - fake value scoped to this unit test
                "AWS_ACCESS_KEY_ID": "fake-access",
                "AWS_SECRET_ACCESS_KEY": "fake-secret",  # nosec B105 - fake value scoped to this unit test
                "BACKUP_SOURCE_ENDPOINT": "http://minio:9000",
                "BACKUP_SOURCE_ACCESS_KEY": "fake-minio-access",
                "BACKUP_SOURCE_SECRET_KEY": "fake-minio-secret",  # nosec B105 - fake value scoped to this unit test
                "KUMA_BACKUP_PUSH_URL": "https://status.example.test/api/push/fake-token",
                "PGHOST": "postgres",
                "PGUSER": "backup_test",
                "PGPASSWORD": "fake-password",
                "PGDATABASE": "backup_test",
                "BACKUP_STAGE_DIR": f"{directory}/stage",
                "S3_BUCKET": "products",
                "S3_LOGO_BUCKET": "logos",
                "S3_PAYMENT_BUCKET": "payments",
                "S3_PUBLIC_URL": "https://cdn.biasmarket.com",
                "S3_LEGACY_PUBLIC_URLS": "https://cdn.biasmarket.com/old-path",
            }
            with patch.dict(os.environ, env, clear=True):
                with self.assertRaisesRegex(RuntimeError, "s3:https://"):
                    backup.validate_runtime()
                with self.assertRaisesRegex(RuntimeError, "backup test mode"):
                    backup.validate_runtime(allow_local_repository=True)
                os.environ["BIASMARKET_BACKUP_TEST_MODE"] = "1"
                stage, buckets = backup.validate_runtime(allow_local_repository=True)
                self.assertEqual(stage, Path(env["BACKUP_STAGE_DIR"]))
                self.assertEqual(buckets, ["products", "logos", "payments"])

    def test_parse_markdown_image_destination_without_trailing_caption(self):
        references = backup.parse_object_references(
            ["![Photo](https://cdn.biasmarket.com/products/photo.jpg),caption"],
            ["products", "logos", "payments"],
        )
        self.assertEqual(references, {("products", "photo.jpg")})

    def test_parse_current_and_path_prefixed_legacy_public_bases(self):
        with patch.dict(
            os.environ,
            {
                "S3_PUBLIC_URL": "https://cdn.biasmarket.com",
                "S3_LEGACY_PUBLIC_URLS": "https://cdn.biasmarket.com/old-path",
            },
            clear=True,
        ):
            references = backup.parse_object_references(
                [
                    "https://cdn.biasmarket.com/products/current.jpg",
                    "https://cdn.biasmarket.com/old-path/logos/legacy.jpg",
                ],
                ["products", "logos", "payments"],
            )
        self.assertEqual(
            references,
            {("products", "current.jpg"), ("logos", "legacy.jpg")},
        )

    def test_skip_malformed_url_candidates_and_keep_valid_references(self):
        references = backup.parse_object_references(
            [
                "broken https://[2001:db8::1/products/unmatched.jpg "
                "and https://cdn.biasmarket.com/products/good.jpg"
            ],
            ["products", "logos", "payments"],
        )
        self.assertEqual(references, {("products", "good.jpg")})

    def test_referenced_objects_must_have_a_readable_value_version(self):
        selections = {
            "products": [
                {"Key": "present.jpg", "Size": 4},
                {"Key": "orphan.jpg", "Size": 1000},
            ],
            "payments": [],
        }
        selected = backup.select_referenced_versions(
            {("products", "present.jpg")}, selections
        )
        self.assertEqual(selected["products"], [selections["products"][0]])
        self.assertEqual(selected["payments"], [])
        with self.assertRaisesRegex(RuntimeError, "no readable value version"):
            backup.select_referenced_versions(
                {("payments", "missing-proof.jpg")}, selections
            )


if __name__ == "__main__":
    unittest.main()
