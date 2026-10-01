# SecretFabric

Protocol-aware, multi-account secret, rule and prompt resource manager for Hermes agents.

SecretFabric is a self-hosted Next.js application with a SQLite database. Hermes creates secret claims through MCP; the human only opens the one-time link and enters sensitive fields.

## Current status

Implemented with a full-stack Next.js application:

- Next.js App Router and Route Handlers
- Yarn package management
- Mantine UI
- Zod request validation
- SQLite persistence via Prisma
- One-time, revocable claim links
- Non-sensitive prefill support
- AES-256-GCM encrypted resource versions
- Tailscale HTTPS deployment
- Hermes MCP bridge
- Automatic website-login sync to the local Hermes encrypted browser vault

## User flow

```text
User: "Create an email secret for info@example.com"
  │
  ▼
Hermes MCP → SecretFabric create claim
  │
  ▼
Hermes sends the one-time HTTPS link
  │
  ▼
User opens only the link and enters passwords/tokens/private keys
  │
  ▼
SecretFabric stores the encrypted resource in SQLite
```

The user does not create secrets from the dashboard or select schemas manually. The dashboard is informational/admin-oriented; claim forms are reached through links created by Hermes.

Completed `website-login` claims create an atomic `VaultSyncJob` outbox record. The host-side `tools/vault_sync_worker.py` consumes those jobs from SQLite and upserts the login into Hermes VaultStore without exposing decrypted values to chat, logs, or tool output. See [`docs/secretfabric-hermes-vault-sync.md`](docs/secretfabric-hermes-vault-sync.md).

## Schema catalog

The current catalog includes 24 protocol/resource types:

```text
email
ssh
postgres
mysql
redis
mongodb
rest-api
oauth2
github
gitlab
kubernetes
aws
azure
gcp
docker-registry
ldap
wireguard
mqtt
tls-certificate
website-login
domain-dns
web-service
personal-profile
custom
```

Website-oriented schemas include login credentials, MFA/TOTP/recovery data, domain/DNS provider accounts and generic SaaS accounts. The `personal-profile` schema stores personal contact data, citizenship country, postal address, passport, ID card, driver's license and up to three residence permits. Passport, ID card and driver's license records each support number, issuing country, expiry date and front/back document uploads. Each document upload accepts JPG, PNG or PDF files up to 10 MB. All personal-profile fields are sensitive, claim-only and never prefilled by Hermes.

## Development

```bash
yarn install
yarn dev
```

Open http://localhost:3000.

Quality checks:

```bash
yarn lint
yarn build
DATABASE_URL='file:/tmp/secretfabric-dev.sqlite' yarn db:validate
DATABASE_URL='file:/tmp/secretfabric-dev.sqlite' yarn db:generate
DATABASE_URL='file:/tmp/secretfabric-dev.sqlite' yarn db:migrate
```

## API

```text
GET    /api/health
GET    /api/schemas
POST   /api/claims
GET    /api/claims/:token
POST   /api/claims/:token
DELETE /api/claims/:token
GET    /.well-known/secret-manager.json
```

`DELETE /api/claims/:token` revokes a pending one-time link. It does not delete a stored secret resource.

## Hermes MCP

A local stdio bridge is included at:

```text
tools/secretfabric_mcp.py
```

The configured MCP server is named `secretfabric` and currently exposes:

```text
secretfabric_health
secretfabric_list_schemas
secretfabric_create_claim
secretfabric_revoke_claim
```

The bridge creates claims and revokes links; it does not expose unrestricted secret values.

Hermes inherits `HERMES_HOME` for the active profile. The MCP bridge derives the trusted principal from that path only (see `docs/hermes-profile-principal.md`): `…/.hermes` → `default`, `…/.hermes/profiles/<name>` → `<name>`. Missing, ambiguous, or unsafe paths fail closed. Every API call sends the derived value as the `x-hermes-principal` header. The bridge does not read explicit principal environment variables and does not accept a principal from MCP tool arguments or JSON bodies.

## Native service and Tailscale

Run SecretFabric with systemd and SQLite. Keys stay in `/etc/secretfabric/secretfabric.env`. The startup commands, health check, optional PostgreSQL import, and Hermes MCP stdio process are documented in [`docs/native-deployment.md`](docs/native-deployment.md).

This repository does not ship a container image or Compose file. The live database is the absolute SQLite file named by `DATABASE_URL`.

The application is published behind a tailnet-only HTTPS endpoint or an operator-owned reverse proxy. The deployment hostname is intentionally not committed to the repository.

## Security

- Secret payloads are stored as authenticated AES-256-GCM ciphertext.
- Claim tokens are stored only as hashes.
- Claim links expire after 15 minutes and are single-use.
- Sensitive fields are never prefilled.
- Passwords, tokens and private keys must not appear in URLs, logs or chat.
- `DATABASE_URL`, `ENCRYPTION_KEY`, and `SECRET_FABRIC_API_TOKEN` remain bootstrap configuration outside the repository and are not moved into SecretFabric.
- Account, bot identity, share and field-level policy enforcement is required before exposing `read_secret`.

See [`docs/requirements.md`](docs/requirements.md) and [`docs/architecture.md`](docs/architecture.md).
