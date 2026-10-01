# SecretFabric → Hermes Vault automatic sync

Completed `website-login` claims are queued in SQLite and copied to the local Hermes encrypted browser vault by a host-side worker.

## Flow

```text
POST /api/claims/:token
  └─ transaction: ResourceVersion + VaultSyncJob(pending)
       └─ vault_sync_worker.py
            ├─ reads encrypted ResourceVersion
            ├─ decrypts only in memory
            ├─ validates the exact HTTP(S) origin
            ├─ upserts Hermes VaultStore by SecretFabric resource ID
            └─ stores only sync metadata/status
```

The worker never prints or persists passwords, TOTP seeds, or other decrypted fields. Its output contains only job/resource IDs, version, handle, origin, and an exception class on failure.

## Supported first version

Only `website-login` resources with an identifier and password are copied. Email is preferred over username. `mfa.totpSecret` is copied as the Hermes optional TOTP seed. Other SecretFabric resource types remain in SecretFabric until a dedicated mapping is added.

## Run once

The worker requires the same `ENCRYPTION_KEY` as the native SecretFabric process and an absolute SQLite `DATABASE_URL`:

```bash
set -a
source /etc/secretfabric/secretfabric.env
set +a
HERMES_HOME=/home/mert/.hermes \
python3 tools/vault_sync_worker.py --once
```

Do not pass the encryption key on a command line. Use `/etc/secretfabric/secretfabric.env` or the systemd unit. A `postgresql://` URL fails closed.

## Install the host worker

The repository includes `deploy/secretfabric-vault-sync.service`. Review the paths and service user, then:

```bash
sudo cp deploy/secretfabric-vault-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now secretfabric-vault-sync
sudo journalctl -u secretfabric-vault-sync -f
```

The service reads `/etc/secretfabric/secretfabric.env` and writes to the profile-scoped Hermes vault under `/home/mert/.hermes/vault/`. The service user must be able to read the Hermes profile and the SQLite file. PostgreSQL is not used by this worker.

## Verify without exposing secrets

```bash
hermes vault list
```

Only metadata is shown. The corresponding `VaultSyncJob` should be `completed`; failed jobs retain only a stable exception class, not exception text or secret data.
