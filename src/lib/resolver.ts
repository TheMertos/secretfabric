import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { decryptJson } from "./crypto";
import { getSchema } from "./schema-catalog";
import { assertPrincipalCanAccessResource, type PrincipalContext } from "./principal-scope";

/**
 * Generic scoped-resolve path: works for every resourceType present in
 * schema-catalog.ts, not just email/caldav. Allowed field paths for a given
 * resolve call are derived directly from that resourceType's own schema
 * definition (schema.fields[].path) rather than a hand-maintained global
 * allowlist — adding a new resource type to the catalog automatically makes
 * it resolvable here with no resolver.ts change required.
 *
 * `purpose` is free-form (consumer-supplied, e.g. "smtp-send",
 * "youtube-video-upload"): it is not itself an authorization gate here, only
 * an audit-trail label and an optional scoping dimension inside
 * ResourceShare.allowedOperations for cross-account shares. Same-account
 * access (the overwhelming common case — a service resolving its own
 * resource) is gated purely by account ownership, unaffected by purpose.
 */

function readPath(value: unknown, path: string) {
  return path
    .split(".")
    .reduce(
      (current, part) => (current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined),
      value
    );
}

export async function resolveScopedResource(input: {
  ctx: PrincipalContext;
  resourceId?: string;
  resourceName?: string;
  purpose: string;
  fieldPaths: string[];
}) {
  let resourceId = input.resourceId;
  if (!resourceId) {
    if (!input.resourceName) throw new Error("resource_not_found");
    const byName = await prisma.resource.findUnique({
      where: { accountId_name: { accountId: input.ctx.accountId, name: input.resourceName } },
      select: { id: true },
    });
    if (!byName) throw new Error("resource_not_found");
    resourceId = byName.id;
  }

  await assertPrincipalCanAccessResource(input.ctx, resourceId, input.purpose);

  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!resource || resource.status !== "active" || !resource.versions[0]) {
    throw new Error("resource_not_found");
  }

  const schema = getSchema(resource.resourceType);
  if (!schema) throw new Error("resource_not_found");
  const allowedPaths = new Set(schema.fields.map((field) => field.path));
  if (!input.fieldPaths.length || input.fieldPaths.some((path) => !allowedPaths.has(path))) {
    throw new Error("field_path_not_allowed");
  }

  const payload = decryptJson(Buffer.from(resource.versions[0].encryptedPayload), Buffer.from(resource.versions[0].payloadNonce));
  const projection = Object.fromEntries(input.fieldPaths.map((path) => [path, readPath(payload, path)]));
  const requestId = randomUUID();
  await prisma.auditEvent.create({
    data: {
      actor: input.ctx.principal,
      consumer: input.ctx.principal,
      resourceId: resource.id,
      operation: input.purpose,
      fieldPaths: input.fieldPaths,
      result: "success",
      requestId,
    },
  });
  return { requestId, resourceId: resource.id, version: resource.versions[0].version, expiresInSeconds: 300, fields: projection };
}
