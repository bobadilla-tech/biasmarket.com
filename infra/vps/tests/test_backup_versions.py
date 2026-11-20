import datetime as dt
import importlib.util
import tempfile
import unittest
from pathlib import Path


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
            manifest = backup.export_objects(client, selections, payload)
            object_file = payload / manifest[0]["file"]
            self.assertEqual(object_file.read_bytes(), b"database-snapshot-object")
            self.assertEqual(
                client.requested_versions,
                [("products", "products/uuid.jpg", "retained-version")],
            )


if __name__ == "__main__":
    unittest.main()
