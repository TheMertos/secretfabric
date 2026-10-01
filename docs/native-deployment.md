# Native SecretFabric (SQLite)

SecretFabric runs as a host Next.js process with a SQLite database. This repository does not ship Docker or a PostgreSQL service.

Encryption keys and API tokens stay outside the repository, in `/etc/secretfabric/secretfabric.env` with mode `0600`.

## Database URL

```text
DATABASE_URL=file:/var/lib/secretfabric/secretfabric.sqlite
```

The path must be absolute. A `postgresql://` URL is rejected by the native startup check.

## One-time PostgreSQL import

The import tool remains for an explicit one-time copy from a PostgreSQL URL. It reads `--source` and writes `--target`. It does not use the ambient `DATABASE_URL`. It prints table counts only. It refuses to replace a database that already has rows unless `--overwrite` is present.

```bash
mkdir -p /var/lib/secretfabric
yarn db:import-sqlite -- \
  --source "$SECRET_FABRIC_POSTGRES_URL" \
  --target /var/lib/secretfabric/secretfabric.sqlite
```

`SECRET_FABRIC_POSTGRES_URL` is supplied in the shell for this command only. Do not write it into the native environment file. After the command prints `validation ok`, the native service uses the SQLite file.

## Native service

```bash
sudo install -d -m 0750 /etc/secretfabric /var/lib/secretfabric
sudo cp deploy/secretfabric.env.example /etc/secretfabric/secretfabric.env
sudo chmod 600 /etc/secretfabric/secretfabric.env
# Edit that file. Set ENCRYPTION_KEY and SECRET_FABRIC_API_TOKEN there.
yarn install --frozen-lockfile
yarn db:generate
DATABASE_URL='file:/var/lib/secretfabric/secretfabric.sqlite' yarn db:migrate
yarn build
sudo cp deploy/secretfabric.service /etc/systemd/system/
sudo cp deploy/secretfabric-vault-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now secretfabric.service
sudo systemctl enable --now secretfabric-vault-sync.service
```

`ExecStartPre` runs `scripts/assert-native-startup.mjs`. Missing keys, placeholder tokens, and non-SQLite URLs exit 2 before Next.js starts.

## Health

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

A healthy process returns `status=ok`, `database=ok`, and `engine=sqlite`. The body does not include the database path.

## Hermes MCP

Start the bridge only after the native service is healthy. The token comes from the external environment file, not from chat or the repository:

```bash
set -a
source /etc/secretfabric/secretfabric.env
set +a
HERMES_HOME=/home/mert/.hermes \
SECRET_FABRIC_URL=http://127.0.0.1:3000 \
python3 /home/mert/secretfabric/tools/secretfabric_mcp.py
```

The process speaks MCP over stdio. Hermes must inherit `HERMES_HOME` for the active profile (`/home/mert/.hermes` or `/home/mert/.hermes/profiles/<name>`). The bridge derives `x-hermes-principal` from that path and fails closed otherwise. Point the Hermes MCP server command at `tools/secretfabric_mcp.py` and pass `SECRET_FABRIC_API_TOKEN`, `SECRET_FABRIC_URL`, and `SECRET_FABRIC_PUBLIC_URL` from the same external file.

Check the bridge with the `secretfabric_health` tool. It calls `GET /api/health` and does not return secret payloads.
