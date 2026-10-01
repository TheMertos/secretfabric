"""Synchronize completed SecretFabric website-login versions into Hermes vault.

This worker is a host-side process. It reads encrypted payloads from the native
SQLite database, decrypts them in memory, writes to Hermes' encrypted VaultStore,
and emits metadata/status only. It never prints or persists secret values.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse, urlsplit

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

HERMES_AGENT_DIR = Path(os.environ.get("HERMES_AGENT_DIR", "/home/mert/.hermes/hermes-agent/agent"))


def sqlite_path_from_database_url(database_url: str) -> str:
    """Return the absolute path from a sqlite file URL.

    Args:
        database_url: DATABASE_URL value.

    Returns:
        Absolute filesystem path.

    Raises:
        ValueError: The URL is missing, relative, or not sqlite.
    """
    if not database_url.startswith("file:"):
        raise ValueError("DATABASE_URL must be a sqlite file URL")
    path = unquote(urlparse(database_url).path)
    if not path.startswith("/") or ".." in path.split("/"):
        raise ValueError("DATABASE_URL must be an absolute sqlite file path")
    return path


def connect_database(database_url: str) -> sqlite3.Connection:
    """Open the SecretFabric SQLite database with foreign keys enabled.

    Args:
        database_url: Explicit sqlite file URL.

    Returns:
        A connection that returns rows by column name.
    """
    connection = sqlite3.connect(sqlite_path_from_database_url(database_url))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def claim_next_job(connection: sqlite3.Connection) -> str | None:
    """Mark the oldest pending vault job as processing.

    Args:
        connection: Open SQLite connection.

    Returns:
        The claimed job id, or None when the queue is empty.
    """
    row = connection.execute(
        'SELECT id FROM "VaultSyncJob" WHERE status = ? ORDER BY "createdAt" ASC LIMIT 1',
        ("pending",),
    ).fetchone()
    if row is None:
        return None
    job_id = str(row["id"])
    updated = connection.execute(
        'UPDATE "VaultSyncJob" SET status = ?, attempts = attempts + 1 WHERE id = ? AND status = ?',
        ("processing", job_id, "pending"),
    )
    connection.commit()
    if updated.rowcount != 1:
        return None
    return job_id


def job_data(connection: sqlite3.Connection, job_id: str) -> tuple[str, int, str, str, bytes, bytes]:
    """Load encrypted bytes for one job without decoding them.

    Args:
        connection: Open SQLite connection.
        job_id: VaultSyncJob id.

    Returns:
        Resource id, version, type, name, ciphertext, and nonce.
    """
    row = connection.execute(
        'SELECT j."resourceId" AS resource_id, j.version, r."resourceType" AS resource_type, r.name, '
        'v."encryptedPayload" AS ciphertext, v."payloadNonce" AS nonce '
        'FROM "VaultSyncJob" j '
        'JOIN "Resource" r ON r.id = j."resourceId" '
        'JOIN "ResourceVersion" v ON v."resourceId" = j."resourceId" AND v.version = j.version '
        "WHERE j.id = ?",
        (job_id,),
    ).fetchone()
    if row is None:
        raise ValueError("vault sync job was not found")
    return str(row["resource_id"]), int(row["version"]), str(row["resource_type"]), str(row["name"]), bytes(row["ciphertext"]), bytes(row["nonce"])


def exact_origin(url: object) -> str:
    value = str(url or "").strip()
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("website URL must have an HTTP(S) origin")
    host = parsed.hostname.lower()
    port = parsed.port
    default_port = 443 if parsed.scheme == "https" else 80
    suffix = "" if port is None or port == default_port else f":{port}"
    return f"{parsed.scheme.lower()}://{host}{suffix}"


def decrypt_payload(ciphertext: bytes, nonce: bytes) -> dict:
    """Decrypt one resource version in memory.

    Args:
        ciphertext: AES-GCM ciphertext including the tag.
        nonce: AES-GCM nonce.

    Returns:
        The decoded JSON object.
    """
    key = bytes.fromhex(os.environ["ENCRYPTION_KEY"])
    raw = AESGCM(key).decrypt(nonce, ciphertext, None)
    decoded = json.loads(raw.decode("utf-8"))
    if not isinstance(decoded, dict):
        raise ValueError("resource payload is not an object")
    return decoded


def previous_vault_item(connection: sqlite3.Connection, resource_id: str) -> str | None:
    """Return the newest completed Hermes handle for a resource.

    Args:
        connection: Open SQLite connection.
        resource_id: SecretFabric resource id.

    Returns:
        The previous vault item id, if one was stored.
    """
    row = connection.execute(
        'SELECT "vaultItemId" FROM "VaultSyncJob" '
        'WHERE "resourceId" = ? AND status = ? AND "vaultItemId" IS NOT NULL '
        "ORDER BY version DESC LIMIT 1",
        (resource_id, "completed"),
    ).fetchone()
    return str(row["vaultItemId"]) if row else None


def set_vault_item(connection: sqlite3.Connection, job_id: str, item_id: str) -> None:
    """Store the Hermes handle for a job.

    Args:
        connection: Open SQLite connection.
        job_id: VaultSyncJob id.
        item_id: Hermes vault handle.
    """
    connection.execute('UPDATE "VaultSyncJob" SET "vaultItemId" = ? WHERE id = ?', (item_id, job_id))
    connection.commit()


def sync_job(connection: sqlite3.Connection, job_id: str) -> dict[str, str]:
    """Decrypt one website-login job and upsert it into Hermes vault.

    Args:
        connection: Open SQLite connection.
        job_id: VaultSyncJob id.

    Returns:
        Metadata safe to print.
    """
    resource_id, version, resource_type, name, ciphertext, nonce = job_data(connection, job_id)
    if resource_type != "website-login":
        raise ValueError("resource type is not supported by the Hermes browser vault")

    payload = decrypt_payload(ciphertext, nonce)
    # SecretFabric stores schema data under the encrypted `data` envelope.
    # Keep the worker compatible with the canonical resource shape while
    # accepting the legacy top-level shape used by older records.
    if isinstance(payload.get("data"), dict):
        payload = payload["data"]
    site = payload.get("site") or {}
    account = payload.get("account") or {}
    mfa = payload.get("mfa") or {}
    origin = exact_origin(site.get("url"))
    email = str(account.get("email") or "").strip()
    username = str(account.get("username") or "").strip()
    password = str(account.get("password") or "")
    identifier = email or username
    if not identifier or not password:
        raise ValueError("website-login lacks identifier or password")

    secret = {
        "identifier_type": "email" if email else "username",
        "identifier": identifier,
        "password": password,
    }
    totp_secret = str(mfa.get("totpSecret") or "").strip()
    if totp_secret:
        secret["otp_secret"] = totp_secret

    agent_dir = HERMES_AGENT_DIR
    root_dir = agent_dir.parent
    for import_path in (root_dir, agent_dir):
        if str(import_path) not in sys.path:
            sys.path.insert(0, str(import_path))
    from vault_store import VaultStore

    store = VaultStore()
    old_item_id = previous_vault_item(connection, resource_id)
    meta = store.add_item(
        kind="login",
        label=name,
        origin=origin,
        secret=secret,
    )
    set_vault_item(connection, job_id, meta.id)
    if old_item_id and old_item_id != meta.id:
        store.remove_item(old_item_id)
    return {"job_id": job_id, "resource_id": resource_id, "version": str(version), "handle": meta.id, "origin": origin}


def utc_now() -> str:
    """Return an ISO-8601 UTC timestamp Prisma can read back.

    Returns:
        Timestamp with millisecond precision and a Z suffix.
    """
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def mark_done(connection: sqlite3.Connection, job_id: str) -> None:
    """Mark a job completed without storing decrypted fields.

    Args:
        connection: Open SQLite connection.
        job_id: VaultSyncJob id.
    """
    connection.execute(
        'UPDATE "VaultSyncJob" SET status = ?, "processedAt" = ?, "lastError" = NULL WHERE id = ?',
        ("completed", utc_now(), job_id),
    )
    connection.commit()


def mark_failed(connection: sqlite3.Connection, job_id: str, exc: BaseException) -> None:
    """Persist only the exception class for a failed job.

    Args:
        connection: Open SQLite connection.
        job_id: VaultSyncJob id.
        exc: Failure whose message must not be stored.
    """
    connection.execute(
        'UPDATE "VaultSyncJob" SET status = ?, "lastError" = ? WHERE id = ?',
        ("failed", type(exc).__name__[:120], job_id),
    )
    connection.commit()


def run_once(connection: sqlite3.Connection) -> bool:
    """Process at most one pending job.

    Args:
        connection: Open SQLite connection.

    Returns:
        True when a job was claimed.
    """
    job_id = claim_next_job(connection)
    if not job_id:
        return False
    try:
        result = sync_job(connection, job_id)
        mark_done(connection, job_id)
        print(json.dumps({"status": "completed", **result}, ensure_ascii=False), flush=True)
    except Exception as exc:
        mark_failed(connection, job_id, exc)
        print(json.dumps({"status": "failed", "job_id": job_id, "error": type(exc).__name__}), flush=True)
    return True


def main() -> int:
    """Poll SQLite until interrupted, or process one job when --once is set.

    Returns:
        Zero after a successful poll, or 2 when required configuration is missing.
    """
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--interval", type=float, default=5.0)
    args = parser.parse_args()
    database_url = os.environ.get("DATABASE_URL", "")
    try:
        sqlite_path_from_database_url(database_url)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if not os.environ.get("ENCRYPTION_KEY"):
        print("ENCRYPTION_KEY is required", file=sys.stderr)
        return 2
    connection = connect_database(database_url)
    try:
        while True:
            processed = run_once(connection)
            if args.once:
                return 0
            if not processed:
                time.sleep(max(args.interval, 0.5))
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
