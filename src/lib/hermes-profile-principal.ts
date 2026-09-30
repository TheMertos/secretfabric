import path from "node:path";

import { isValidTrustedPrincipalName } from "./principal";

/** Canonical principal when HERMES_HOME points at the default `~/.hermes` root. */
export const HERMES_DEFAULT_PRINCIPAL = "default";

const HERMES_DIR_NAME = ".hermes";
const PROFILES_DIR_NAME = "profiles";

/** Thrown when HERMES_HOME is missing or does not map to a trusted principal. */
export class HermesProfilePrincipalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HermesProfilePrincipalError";
  }
}

/**
 * Derives the trusted control-plane principal from a Hermes profile directory path.
 * @param rawHome Value of HERMES_HOME (absolute or relative).
 * @returns Principal name (`default` or a profile segment under `profiles/`).
 */
export function resolvePrincipalFromHermesHome(rawHome: string | undefined | null): string {
  if (rawHome === undefined || rawHome === null) {
    throw new HermesProfilePrincipalError("HERMES_HOME is required");
  }
  const trimmed = rawHome.trim();
  if (!trimmed || trimmed.includes("\0")) {
    throw new HermesProfilePrincipalError("HERMES_HOME is required");
  }

  const resolved = path.resolve(trimmed);
  const parts = resolved.split(path.sep).filter((segment) => segment.length > 0);
  if (parts.length === 0) {
    throw new HermesProfilePrincipalError("unsafe HERMES_HOME path");
  }

  const last = parts[parts.length - 1]!;
  const secondLast = parts.length >= 2 ? parts[parts.length - 2]! : null;
  const thirdLast = parts.length >= 3 ? parts[parts.length - 3]! : null;

  if (last === HERMES_DIR_NAME) {
    return HERMES_DEFAULT_PRINCIPAL;
  }

  if (
    secondLast === PROFILES_DIR_NAME &&
    thirdLast === HERMES_DIR_NAME &&
    last !== PROFILES_DIR_NAME
  ) {
    if (!isValidTrustedPrincipalName(last)) {
      throw new HermesProfilePrincipalError("unsafe HERMES_HOME path");
    }
    return last;
  }

  throw new HermesProfilePrincipalError("ambiguous or unsupported HERMES_HOME path");
}
