# SecretFabric → Hermes Vault Bridge

This procedure transfers a completed website-login secret from SecretFabric into the local Hermes encrypted browser vault without exposing the password to chat, model context, terminal output, or logs.

## Preconditions

- SecretFabric is running through Docker Compose.
- `secretfabric-postgres-1` is healthy.
- `secretfabric-web-1` is running.
- The resource has a completed `ResourceVersion`; a pending claim alone is not enough.
- Hermes and SecretFabric run as the same local user/profile, or the bridge is adapted to the target `HERMES_HOME`.

## Data flow

1. Read the latest encrypted `ResourceVersion` for the target resource inside the SecretFabric web container.
2. Decrypt it in-process with SecretFabric's `ENCRYPTION_KEY` using AES-256-GCM.
3. Pass the plaintext only through an in-memory pipe to a short-lived local Python process.
4. Extract `data.site.url`, `data.account.email`/`username`, and `data.account.password`.
5. Call Hermes `VaultStore.add_item()` with origin `https://www.linkedin.com`.
6. Hermes encrypts the login again in its profile-scoped vault (`vault.json.enc`).
7. Print metadata only: stored status, handle, origin, and identifier. Never print the decrypted payload.

## Safe verification

Verify only metadata after the transfer:

```bash
hermes vault list
```

The expected entry is a `login` item bound to the exact website origin. Password values must never appear in the output.

For browser use, open the login page, type the visible identifier, then use the scoped `browser_vault_fill` operation with the returned local handle. The password is resolved server-side and is not returned to the agent.

## Important constraints

- Never put SecretFabric passwords in `prefill` metadata.
- Never use `cat`, shell output, chat, or a generic browser input tool for the password.
- Never log the decrypted JSON, password length, or command-line arguments containing secrets.
- Treat the Hermes vault handle as metadata; the handle alone is not a password.
- If the SecretFabric resource has no completed version, complete the one-time claim form first.
- If the target origin is not `https://www.linkedin.com`, stop and select the intended origin explicitly rather than broadening the scope.
- After a successful transfer, use Hermes vault fill for the website login; do not re-read or retype the SecretFabric plaintext.

## Operational result

The bridge is a local migration path, not a general unrestricted SecretFabric read API. A future implementation may expose a policy-checked, audited `read_secret` operation, but it must preserve field-path and origin scoping and keep secret values out of model-visible responses.
