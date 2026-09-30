import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { encryptJson } from "./crypto";
import { getSchema } from "./schema-catalog";

import type { PrincipalContext } from "./principal-scope";
import { assertPrincipalOwnsClaimToken } from "./principal-scope";

const CLAIM_TTL_SECONDS = 900;
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

type CreateClaimInput = {
  name: string;
  type: string;
  provider?: string;
  prefill?: Record<string, string>;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function setPath(root: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let current = root;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) current[part] = value;
    else {
      current[part] ??= {};
      current = current[part] as Record<string, unknown>;
    }
  });
}

function validateDocumentAttachments(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(validateDocumentAttachments);
  if (!value || typeof value !== "object") return true;
  const record = value as Record<string, unknown>;
  if ("contentBase64" in record) {
    if (typeof record.name !== "string" || typeof record.type !== "string" || typeof record.contentBase64 !== "string") return false;
    if (!ALLOWED_DOCUMENT_TYPES.has(record.type) || record.contentBase64.length > Math.ceil(MAX_DOCUMENT_SIZE / 3) * 4 + 4) return false;
    const decoded = Buffer.from(record.contentBase64, "base64");
    return decoded.length > 0 && decoded.length <= MAX_DOCUMENT_SIZE;
  }
  return Object.values(record).every(validateDocumentAttachments);
}

export async function createClaim(ctx: PrincipalContext, input: CreateClaimInput) {
  if (!getSchema(input.type)) throw new Error("Unknown schema type");
  const accountId = ctx.accountId;
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CLAIM_TTL_SECONDS * 1000);
  const resource = await prisma.resource.upsert({
    where: { accountId_name: { accountId, name: input.name } },
    update: {
      resourceType: input.type,
      metadata: { provider: input.provider ?? null, prefill: input.prefill ?? {} },
      status: "active",
    },
    create: {
      accountId,
      resourceType: input.type,
      name: input.name,
      metadata: { provider: input.provider ?? null, prefill: input.prefill ?? {} },
    },
  });
  await prisma.claim.create({
    data: { resourceId: resource.id, tokenHash: hashToken(token), expiresAt, createdBy: ctx.principal },
  });
  return { token, name: input.name, type: input.type, expiresInSeconds: CLAIM_TTL_SECONDS };
}

export async function getClaim(token: string) {
  const claim = await prisma.claim.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { resource: true },
  });
  if (!claim || claim.usedAt || claim.revokedAt || claim.expiresAt <= new Date()) return undefined;
  return claim;
}

export async function revokeClaim(ctx: PrincipalContext, token: string) {
  const tokenHash = hashToken(token);
  try {
    await assertPrincipalOwnsClaimToken(ctx, tokenHash);
  } catch (error) {
    const code = error instanceof Error ? error.message : "revoke_failed";
    if (code === "principal_forbidden" || code === "claim_not_found") return false;
    throw error;
  }
  const result = await prisma.claim.updateMany({
    where: { tokenHash, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count === 1;
}

export async function getClaimForm(token: string) {
  const claim = await getClaim(token);
  if (!claim) return undefined;
  const schema = getSchema(claim.resource.resourceType)!;
  const metadata = (claim.resource.metadata ?? {}) as { provider?: string; prefill?: Record<string, string> };
  return {
    name: claim.resource.name,
    type: claim.resource.resourceType,
    provider: metadata.provider,
    fields: schema.fields.map((field) => ({
      ...field,
      value: field.sensitive || field.claimOnly ? undefined : metadata.prefill?.[field.path] ?? field.defaultValue,
    })),
  };
}

export async function completeClaim(token: string, data: Record<string, unknown>) {
  const claim = await getClaim(token);
  if (!claim) return false;
  if (!validateDocumentAttachments(data)) return false;
  const metadata = (claim.resource.metadata ?? {}) as { prefill?: Record<string, string> };
  const payload: Record<string, unknown> = {};
  Object.entries(metadata.prefill ?? {}).forEach(([path, value]) => setPath(payload, path, value));
  Object.assign(payload, data);
  const encrypted = encryptJson(payload);
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const marked = await tx.claim.updateMany({
      where: { id: claim.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (marked.count !== 1) return false;
    const latestVersion = await tx.resourceVersion.aggregate({
      where: { resourceId: claim.resourceId },
      _max: { version: true },
    });
    const nextVersion = (latestVersion._max.version ?? 0) + 1;
    await tx.resourceVersion.create({
      data: {
        resourceId: claim.resourceId,
        version: nextVersion,
        encryptedPayload: encrypted.ciphertext,
        payloadNonce: encrypted.nonce,
        createdBy: "claim",
      },
    });
    await tx.resource.update({
      where: { id: claim.resourceId },
      data: { currentVersion: nextVersion },
    });
    await tx.vaultSyncJob.create({
      data: {
        resourceId: claim.resourceId,
        version: nextVersion,
        status: "pending",
      },
    });
    return true;
  });
  return updated;
}
