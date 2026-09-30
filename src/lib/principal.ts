/** Trusted control-plane principal carried only in headers (never JSON body). */
export const HERMES_PRINCIPAL_HEADER = "x-hermes-principal";

const PRINCIPAL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/;

/**
 * Reads and validates the trusted principal from an incoming request header.
 * @param request Incoming HTTP request.
 * @returns Normalized principal string or null when missing/invalid.
 */
export function readTrustedPrincipal(request: Request): string | null {
  const raw = request.headers.get(HERMES_PRINCIPAL_HEADER);
  if (!raw) return null;
  const principal = raw.trim();
  if (!principal || !PRINCIPAL_PATTERN.test(principal)) return null;
  return principal;
}
