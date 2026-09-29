import json
import os
import subprocess
import sys
from pathlib import Path

# Keep all decrypted values in memory; never print or persist them.
sys.path.insert(0, "/home/mert/.hermes/hermes-agent/agent")
from vault_store import VaultStore
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

name = "StepStone Germany"
sql = '''SELECT encode(rv."encryptedPayload", 'hex'), encode(rv."payloadNonce", 'hex')
FROM "ResourceVersion" rv
JOIN "Resource" r ON r.id = rv."resourceId"
WHERE r.name = 'StepStone Germany'
ORDER BY rv.version DESC LIMIT 1'''
row = subprocess.check_output([
    "docker", "exec", "secretfabric-postgres-1",
    "psql", "-U", "secretfabric", "-d", "secretfabric", "-At", "-F", "\t", "-c", sql,
], text=True).strip()
if not row:
    raise SystemExit("no completed StepStone resource version")
cipher_hex, nonce_hex = row.split("\t", 1)
key_hex = subprocess.check_output(
    ["docker", "exec", "secretfabric-web-1", "printenv", "ENCRYPTION_KEY"],
    text=True,
).strip()
payload = json.loads(AESGCM(bytes.fromhex(key_hex)).decrypt(
    bytes.fromhex(nonce_hex), bytes.fromhex(cipher_hex), None
).decode("utf-8"))
data = payload.get("data", payload)
site = data.get("site", {})
account = data.get("account", {})
origin = "https://www.stepstone.de"
if site.get("url", "").rstrip("/") != origin:
    raise SystemExit("stored StepStone URL does not match the exact target origin")
identifier = account.get("email") or account.get("username")
password = account.get("password")
if not identifier or not password:
    raise SystemExit("completed StepStone resource lacks identifier or password")
meta = VaultStore().add_item(
    kind="login",
    label=name,
    origin=origin,
    secret={"identifier_type": "email" if account.get("email") else "username", "identifier": identifier, "password": password},
)
print(json.dumps(meta.to_dict(), ensure_ascii=False))
