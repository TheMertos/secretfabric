# Hermes profile principal

SecretFabric control-plane requests require a trusted principal in the `x-hermes-principal` header. The value is never taken from JSON bodies or MCP tool arguments.

Hermes MCP and other local bridges derive the principal deterministically from inherited profile context: the `HERMES_HOME` environment variable.

## Mapping rules

| `HERMES_HOME` (resolved path) | Principal |
| --- | --- |
| `…/.hermes` | `default` |
| `…/.hermes/profiles/<name>` | `<name>` |

`<name>` must match the same character rules as header principals (`[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}`).

## Fail closed

The bridge rejects configuration when:

- `HERMES_HOME` is unset or blank
- The path is not exactly the default root or a single profile directory under `profiles/`
- The profile segment is missing, nested (`…/profiles/a/b`), or invalid
- Explicit principal env vars would be used instead of profile context (`HERMES_INSTANCE_NAME`, `SECRET_FABRIC_PRINCIPAL`)

## Shared implementation

- TypeScript: `src/lib/hermes-profile-principal.ts`
- Python (MCP bridge): `tools/hermes_profile_principal.py`

Map each principal to a SecretFabric account via `BotIdentity.externalSubject`, `AccountMembership.subject`, or `Account.slug`.
