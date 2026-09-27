# SecretFabric

Protocol-aware, multi-account secret, rule and prompt resource manager for Hermes agents.

## Current status

The first vertical slice is implemented with a single full-stack Next.js application:

- Next.js App Router and Route Handlers
- Yarn package management
- Mantine UI
- Zod request validation
- In-memory claim workflow for development
- PostgreSQL/Prisma integration planned for the next slice

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

The current development claim store is in-memory and is not production-ready. Before deployment, claim records and secret payloads must be persisted in PostgreSQL with authenticated encryption, hashed claim tokens, expiry enforcement and account/bot policies.
