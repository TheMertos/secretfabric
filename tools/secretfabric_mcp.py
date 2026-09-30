"""SecretFabric MCP bridge for Hermes.

Only non-destructive, currently implemented SecretFabric operations are exposed.
Secret values are never printed by this bridge.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from collections.abc import Mapping
from pathlib import Path
from typing import Any

_TOOLS_DIR = Path(__file__).resolve().parent
if str(_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOLS_DIR))

from hermes_profile_principal import (
    HermesProfilePrincipalError,
    resolve_trusted_principal_from_env,
)
from mcp.server.mcpserver import MCPServer

BASE_URL = os.environ.get("SECRET_FABRIC_URL", "http://127.0.0.1:3000").rstrip("/")
PUBLIC_URL = os.environ.get("SECRET_FABRIC_PUBLIC_URL", BASE_URL).rstrip("/")
API_TOKEN = os.environ.get("SECRET_FABRIC_API_TOKEN")
mcp = MCPServer(name="secretfabric", version="0.1.0")

HERMES_PRINCIPAL_HEADER = "x-hermes-principal"
_MISSING_PRINCIPAL = "SecretFabric MCP requires HERMES_HOME (Hermes profile context)"


def resolve_trusted_principal(env: Mapping[str, str] | None = None) -> str:
    """Derive trusted principal from inherited HERMES_HOME only."""
    try:
        return resolve_trusted_principal_from_env(env)
    except HermesProfilePrincipalError as exc:
        raise RuntimeError(f"{_MISSING_PRINCIPAL}: {exc}") from exc


def request(path: str, method: str = "GET", payload: dict[str, Any] | None = None) -> Any:
    principal = resolve_trusted_principal()
    if not API_TOKEN:
        raise RuntimeError("SecretFabric MCP requires SECRET_FABRIC_API_TOKEN")
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=body,
        method=method,
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {API_TOKEN}",
            HERMES_PRINCIPAL_HEADER: principal,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"SecretFabric API returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"SecretFabric is unreachable at {BASE_URL}: {exc.reason}") from exc


@mcp.tool()
def secretfabric_health() -> dict[str, Any]:
    """Check whether the SecretFabric service is available."""
    return request("/api/health")


@mcp.tool()
def secretfabric_list_schemas() -> list[dict[str, Any]]:
    """List available protocol-aware secret schemas and their fields."""
    return request("/api/schemas")


@mcp.tool()
def secretfabric_create_claim(
    name: str,
    schema_type: str,
    provider: str | None = None,
    prefill: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Create a one-time human claim link for a secret.

    Prefill only non-sensitive known fields. Never put passwords, tokens,
    private keys or other secret values in prefill.
    """
    payload: dict[str, Any] = {"name": name, "type": schema_type, "prefill": prefill or {}}
    if provider is not None:
        payload["provider"] = provider
    result = request(
        "/api/claims",
        method="POST",
        payload=payload,
    )
    if isinstance(result, dict) and isinstance(result.get("claimUrl"), str):
        claim_url = result["claimUrl"]
        result["claimUrl"] = f"{PUBLIC_URL}{claim_url}" if claim_url.startswith("/") else claim_url
    return result


@mcp.tool()
def secretfabric_revoke_claim(token: str) -> dict[str, Any]:
    """Invalidate a pending one-time claim link before it is submitted."""
    return request(f"/api/claims/{token}", method="DELETE")


if __name__ == "__main__":
    import asyncio

    asyncio.run(mcp.run_stdio_async())
