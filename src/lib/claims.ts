import { randomBytes } from "node:crypto";
import { getSchema } from "./schema-catalog";

type Claim = {
  token: string;
  name: string;
  type: string;
  provider?: string;
  createdAt: number;
  expiresAt: number;
  usedAt?: number;
  data?: Record<string, unknown>;
};

const claims = new Map<string, Claim>();
const CLAIM_TTL_SECONDS = 900;

export function createClaim(input: { name: string; type: string; provider?: string }) {
  if (!getSchema(input.type)) throw new Error("Unknown schema type");
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  claims.set(token, {
    token,
    ...input,
    createdAt: now,
    expiresAt: now + CLAIM_TTL_SECONDS * 1000,
  });
  return { token, name: input.name, type: input.type, expiresInSeconds: CLAIM_TTL_SECONDS };
}

export function getClaim(token: string) {
  const claim = claims.get(token);
  if (!claim || claim.usedAt || claim.expiresAt <= Date.now()) return undefined;
  return claim;
}

export function completeClaim(token: string, data: Record<string, unknown>) {
  const claim = getClaim(token);
  if (!claim) return false;
  claim.usedAt = Date.now();
  claim.data = data;
  return true;
}
