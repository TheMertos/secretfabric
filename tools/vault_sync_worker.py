"""Synchronize completed SecretFabric website-login versions into Hermes vault.

This worker is intentionally a host-side process. It reads only encrypted payloads
from Postgres, decrypts them in memory, writes to Hermes' encrypted VaultStore,
and emits metadata/status only. It never prints or persists secret values.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

HERMES_AGENT_DIR = Path(os.environ.get("HERMES_AGENT_DIR", "/home/mert/.hermes/hermes-agent/agent"))
HERMES_ROOT_DIR = HERMES_AGENT_DIR.parent
for import_path in (HERMES_ROOT_DIR, HERMES_AGENT_DIR):
    if str(import_path) not in sys.path:
        sys.path.insert(0, str(import_path))
from vault_store import VaultStore  # noqa: E402


POSTGRES_CONTAINER = os.environ.get("SECRET_FABRIC_POSTGRES_CONTAINER", "secretfabric-postgres-1")
PG_USER = os.environ.get("SECRET_FABRIC_PG_USER", "secretfabric")
PG_DATABASE = os.environ.get("SECRET_FABRIC_PG_DATABASE", "secretfabric")


def psql(sql: str) -> str:
    result = subprocess.run(
        [
            "docker", "exec", POSTGRES_CONTAINER,
            "psql", "-U", PG_USER, "-d", PG_DATABASE,
            "-At", "-F", "\t", "-c", sql,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def claim_next_job() -> str | None:
    row = psql(
        'SELECT id FROM "VaultSyncJob" '
        "WHERE status = 'pending' ORDER BY \"createdAt\" ASC LIMIT 1"
    )
    if not row:
        return None
    job_id = row.splitlines()[0].strip()
    psql(
        'UPDATE "VaultSyncJob" SET status = \'processing\', attempts = attempts + 1 '
        f'WHERE id = \'{job_id}\' AND status = \'pending\''
    )
    return job_id


def job_data(job_id: str) -> tuple[str, int, str, str, str, str]:
    row = psql(
        'SELECT j."resourceId", j.version, r."resourceType", r.name, '
        'encode(v."encryptedPayload", \'hex\'), encode(v."payloadNonce", \'hex\') '
        'FROM "VaultSyncJob" j '
        'JOIN "Resource" r ON r.id = j."resourceId" '
        'JOIN "ResourceVersion" v ON v."resourceId" = j."resourceId" AND v.version = j.version '
        f'WHERE j.id = \'{job_id}\''
    )
    resource_id, version, resource_type, name, ciphertext, nonce = row.split("\t", 5)
    return resource_id, int(version), resource_type, name, ciphertext, nonce


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


def decrypt_payload(ciphertext: str, nonce: str) -> dict:
    key = bytes.fromhex(os.environ["ENCRYPTION_KEY"])
    raw = AESGCM(key).decrypt(bytes.fromhex(nonce), bytes.fromhex(ciphertext), None)
    decoded = json.loads(raw.decode("utf-8"))
    if not isinstance(decoded, dict):
        raise ValueError("resource payload is not an object")
    return decoded


def previous_vault_item(resource_id: str) -> str | None:
    row = psql(
        'SELECT "vaultItemId" FROM "VaultSyncJob" '
        f'WHERE "resourceId" = \'{resource_id}\' AND status = \'completed\' '
        'AND "vaultItemId" IS NOT NULL ORDER BY version DESC LIMIT 1'
    )
    return row.splitlines()[0].strip() if row else None


def set_vault_item(job_id: str, item_id: str) -> None:
    psql(
        'UPDATE "VaultSyncJob" SET "vaultItemId" = '
        f"'{item_id}' WHERE id = '{job_id}'"
    )


def sync_job(job_id: str) -> dict[str, str]:
    resource_id, version, resource_type, name, ciphertext, nonce = job_data(job_id)
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

    store = VaultStore()
    old_item_id = previous_vault_item(resource_id)
    meta = store.add_item(
        kind="login",
        label=name,
        origin=origin,
        secret=secret,
    )
    set_vault_item(job_id, meta.id)
    if old_item_id and old_item_id != meta.id:
        store.remove_item(old_item_id)
    return {"job_id": job_id, "resource_id": resource_id, "version": str(version), "handle": meta.id, "origin": origin}


def mark_done(job_id: str) -> None:
    psql(
        'UPDATE "VaultSyncJob" SET status = \'completed\', "processedAt" = NOW(), '
        '"lastError" = NULL WHERE id = '
        f"'{job_id}'"
    )


def mark_failed(job_id: str, exc: BaseException) -> None:
    # Persist only a stable error class, never exception text or decrypted values.
    code = type(exc).__name__[:120]
    escaped = code.replace("'", "''")
    psql(
        'UPDATE "VaultSyncJob" SET status = \'failed\', "lastError" = '
        f"'{escaped}' WHERE id = '{job_id}'"
    )


def run_once() -> bool:
    job_id = claim_next_job()
    if not job_id:
        return False
    try:
        result = sync_job(job_id)
        mark_done(job_id)
        print(json.dumps({"status": "completed", **result}, ensure_ascii=False), flush=True)
    except Exception as exc:
        mark_failed(job_id, exc)
        print(json.dumps({"status": "failed", "job_id": job_id, "error": type(exc).__name__}), flush=True)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--interval", type=float, default=5.0)
    args = parser.parse_args()
    if not os.environ.get("ENCRYPTION_KEY"):
        print("ENCRYPTION_KEY is required", file=sys.stderr)
        return 2
    while True:
        processed = run_once()
        if args.once or not processed:
            if not args.once:
                time.sleep(max(args.interval, 0.5))
            if args.once:
                return 0


if __name__ == "__main__":
    raise SystemExit(main())
