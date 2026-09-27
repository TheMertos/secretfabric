# SecretFabric

Protocol-aware, multi-account secret, rule and prompt resource manager for Hermes agents.

SecretFabric is a self-hosted, Dockerized Next.js application. Hermes creates secret claims through MCP; the human only opens the one-time link and enters sensitive fields.

## Current status

Implemented with a full-stack Next.js application:

- Next.js App Router and Route Handlers
- Yarn package management
- Mantine UI
- Zod request validation
- PostgreSQL persistence via Prisma
- One-time, revocable claim links
- Non-sensitive prefill support
- AES-256-GCM encrypted resource versions
- Tailscale HTTPS deployment
- Hermes MCP bridge

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
SecretFabric stores the encrypted resource in PostgreSQL
```

The user does not create secrets from the dashboard or select schemas manually. The dashboard is informational/admin-oriented; claim forms are reached through links created by Hermes.

## Schema catalog

The current catalog includes 23 protocol/resource types:

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
custom
```

Website-oriented schemas include login credentials, MFA/TOTP/recovery data, domain/DNS provider accounts and generic SaaS accounts. Sensitive fields are claim-only and are never prefilled by Hermes.

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
yarn db:validate
yarn db:generate
yarn db:migrate
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

## Docker and Tailscale

```bash
docker compose up -d
```

The production-style local deployment uses:

```text
secretfabric-web: 3000
postgres:          127.0.0.1:5432
```

Current tailnet URL:

```text
https://[deployment-hostname-removed]:8443/
```

The 8443 endpoint is tailnet-only. The default Tailscale HTTPS root remains reserved for Hermes.

## Security

- Secret payloads are stored as authenticated AES-256-GCM ciphertext.
- Claim tokens are stored only as hashes.
- Claim links expire after 15 minutes and are single-use.
- Sensitive fields are never prefilled.
- Passwords, tokens and private keys must not appear in URLs, logs or chat.
- `DATABASE_URL` and `ENCRYPTION_KEY` remain bootstrap configuration and are not moved into SecretFabric.
- Account, bot identity, share and field-level policy enforcement is required before exposing `read_secret`.

See [`docs/requirements.md`](docs/requirements.md) and [`docs/architecture.md`](docs/architecture.md).
