"""Derive SecretFabric control-plane principal from inherited Hermes HERMES_HOME."""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from pathlib import Path

HERMES_DEFAULT_PRINCIPAL = "default"
_HERMES_DIR_NAME = ".hermes"
_PROFILES_DIR_NAME = "profiles"
_PRINCIPAL_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$")


class HermesProfilePrincipalError(RuntimeError):
    """HERMES_HOME is missing or does not map to a trusted principal."""


def resolve_principal_from_hermes_home(raw_home: str | None) -> str:
    """Map HERMES_HOME to a principal (`default` or `profiles/<name>`)."""
    if raw_home is None:
        raise HermesProfilePrincipalError("HERMES_HOME is required")
    trimmed = raw_home.strip()
    if not trimmed or "\0" in trimmed:
        raise HermesProfilePrincipalError("HERMES_HOME is required")

    resolved = Path(trimmed).resolve()
    parts = resolved.parts
    if not parts:
        raise HermesProfilePrincipalError("unsafe HERMES_HOME path")

    last = parts[-1]
    second_last = parts[-2] if len(parts) >= 2 else None
    third_last = parts[-3] if len(parts) >= 3 else None

    if last == _HERMES_DIR_NAME:
        return HERMES_DEFAULT_PRINCIPAL

    if (
        second_last == _PROFILES_DIR_NAME
        and third_last == _HERMES_DIR_NAME
        and last != _PROFILES_DIR_NAME
    ):
        if not _PRINCIPAL_PATTERN.fullmatch(last):
            raise HermesProfilePrincipalError("unsafe HERMES_HOME path")
        return last

    raise HermesProfilePrincipalError("ambiguous or unsupported HERMES_HOME path")


def resolve_trusted_principal_from_env(env: Mapping[str, str] | None = None) -> str:
    """Return principal from HERMES_HOME only (no explicit principal env)."""
    source = env if env is not None else os.environ
    return resolve_principal_from_hermes_home(source.get("HERMES_HOME"))
