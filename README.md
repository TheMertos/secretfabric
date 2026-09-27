# SecretFabric

Protocol-aware, multi-account secret, rule and prompt resource manager for Hermes agents.

## Current status

The first vertical slice is implemented with a single full-stack Next.js application:

- Next.js App Router and Route Handlers
- Yarn package management
- Mantine UI
- Zod request validation
- One-time claim links with PostgreSQL persistence
- Prefilled non-sensitive fields
- AES-256-GCM encrypted resource versions
- PostgreSQL via Prisma

Implemented now:

- Dashboard with protocol schema cards
- Email, SSH, PostgreSQL and custom JSON schemas
- One-time claim link creation
- Dynamic claim form generation
- Sensitive-field masking in the UI
- Health and schema API endpoints
- Machine-readable service manifest

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
```

## API

```text
GET  /api/health
GET  /api/schemas
POST /api/claims
GET  /api/claims/:token
POST /api/claims/:token
GET  /.well-known/secret-manager.json
```

## Planned stack

- Next.js full-stack application
- Mantine UI
- PostgreSQL via Prisma
- Docker Compose
- Tailscale Serve HTTPS
- OpenAPI and MCP agent discovery

See [`docs/requirements.md`](docs/requirements.md) and [`docs/architecture.md`](docs/architecture.md).

## Security note

Production deployment requires a strong external `ENCRYPTION_KEY`, Tailscale access control and account/bot policies. Claim records use hashed one-time tokens; submitted payloads are stored as authenticated AES-256-GCM ciphertext in PostgreSQL.
