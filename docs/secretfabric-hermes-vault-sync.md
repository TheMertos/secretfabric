# SecretFabric → Hermes Vault automatic sync

Completed `website-login` claims are queued in PostgreSQL and copied to the local Hermes encrypted browser vault by a host-side worker.

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

The worker requires the same `ENCRYPTION_KEY` used by the SecretFabric web container and a running PostgreSQL container:

```bash
ENCRYPTION_KEY='...' \
HERMES_HOME=/home/mert/.hermes \
python3 tools/vault_sync_worker.py --once
```

Do not pass the encryption key on a command line in normal operation. Use the deployment environment file or systemd environment handling.

## Install the host worker

The repository includes `deploy/secretfabric-vault-sync.service`. Review the paths and service user, then:

```bash
sudo cp deploy/secretfabric-vault-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now secretfabric-vault-sync
sudo journalctl -u secretfabric-vault-sync -f
```

The service uses `/home/mert/secretfabric/.env` for bootstrap values and writes to the profile-scoped Hermes vault under `/home/mert/.hermes/vault/`. The service user must be able to read the Hermes profile and invoke `docker exec` on the SecretFabric Postgres container.

## Verify without exposing secrets

```bash
hermes vault list
```

Only metadata is shown. The corresponding `VaultSyncJob` should be `completed`; failed jobs retain only a stable exception class, not exception text or secret data.
