import { isApiRequestAuthorized } from "./api-auth";
import { readTrustedPrincipal } from "./principal";
import { PrincipalContext, resolvePrincipalContext } from "./principal-scope";

export type ControlPlaneAuthResult =
  | { ok: true; ctx: PrincipalContext }
  | { ok: false; status: number; error: string };

/**
 * Authenticates control-plane requests: API bearer token plus trusted principal header.
 * @param request Incoming HTTP request.
 */
export async function authorizeControlPlaneRequest(request: Request): Promise<ControlPlaneAuthResult> {
  if (!isApiRequestAuthorized(request)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const principal = readTrustedPrincipal(request);
  if (!principal) {
    return { ok: false, status: 401, error: "principal_required" };
  }
  const ctx = await resolvePrincipalContext(principal);
  if (!ctx) {
    return { ok: false, status: 403, error: "principal_not_mapped" };
  }
  return { ok: true, ctx };
}
