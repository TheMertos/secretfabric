# SecretFabric

Protocol-aware, multi-account secret, rule and prompt resource manager for Hermes agents.

SecretFabric is designed for self-hosted Docker deployment behind Tailscale HTTPS. It provides:

- Flexible JSON-based secret records
- Protocol-aware schemas and dynamic claim forms
- One-time magic links for entering sensitive fields
- Multi-account and multi-bot isolation
- Field-level read and share permissions
- Versioned rules and prompts
- Read-only, execute-only and revocable sharing
- Machine-readable agent discovery through OpenAPI and MCP
- Docker images suitable for Docker Hub publishing

## Status

Early architecture and requirements phase. The design documents are available in [`docs/`](docs/).

- [Requirements](docs/requirements.md)
- [Technical architecture](docs/architecture.md)

## Planned stack

- Next.js + Mantine web UI
- FastAPI API
- PostgreSQL
- Docker Compose
- Tailscale Serve HTTPS
- OpenAPI + MCP agent discovery

## Security model

Secret payloads must be encrypted at rest. Secret values are never placed in URLs, logs, audit events or documentation. Access is deny-by-default and controlled by account, bot identity, share role, operation and field path. Prompt and rule references require separate authorization for referenced secrets.

## Development

Implementation will be introduced in phases. The requirements and architecture documents are the source of truth for the initial build.
