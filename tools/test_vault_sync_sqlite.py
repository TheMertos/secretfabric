import os
import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_sync_worker import connect_database, mark_failed, sqlite_path_from_database_url


class SqlitePathTests(unittest.TestCase):
    def test_requires_absolute_sqlite_url(self) -> None:
        path = sqlite_path_from_database_url("file:/var/lib/secretfabric/secretfabric.sqlite")
        self.assertEqual(path, "/var/lib/secretfabric/secretfabric.sqlite")
        with self.assertRaises(ValueError):
            sqlite_path_from_database_url("postgresql://secretfabric:secret-password@127.0.0.1/secretfabric")
        with self.assertRaises(ValueError):
            sqlite_path_from_database_url("file:./secretfabric.sqlite")

    def test_failed_job_stores_exception_class_only(self) -> None:
        database = Path(os.environ.get("TMPDIR", "/tmp")) / "secretfabric-worker-test.sqlite"
        if database.exists():
            database.unlink()
        connection = sqlite3.connect(database)
        connection.execute(
            'CREATE TABLE "VaultSyncJob" (id TEXT PRIMARY KEY, status TEXT, "lastError" TEXT, attempts INTEGER)'
        )
        connection.execute('INSERT INTO "VaultSyncJob" (id, status, attempts) VALUES (?, ?, ?)', ("job-1", "processing", 1))
        connection.commit()
        connection.close()
        opened = connect_database(f"file:{database}")
        try:
            mark_failed(opened, "job-1", ValueError("plaintext-payload-must-not-be-stored"))
            row = opened.execute('SELECT status, "lastError" FROM "VaultSyncJob"').fetchone()
            self.assertEqual(row["status"], "failed")
            self.assertEqual(row["lastError"], "ValueError")
            self.assertNotIn("plaintext", row["lastError"])
        finally:
            opened.close()
            database.unlink()


if __name__ == "__main__":
    unittest.main()
