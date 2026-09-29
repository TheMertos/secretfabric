import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { decryptJson } from "./crypto";

const ALLOWED_PURPOSES = new Set(["imap-sync", "imap-list-mailboxes", "smtp-send", "caldav-sync"]);
const ALLOWED_PATHS = new Set([
  "identity.email",
  "incoming.protocol", "incoming.host", "incoming.port", "incoming.security", "incoming.username", "incoming.password",
  "outgoing.host", "outgoing.port", "outgoing.security", "outgoing.username", "outgoing.password",
  "server.baseUrl", "server.calendarPath", "auth.username", "auth.password"
]);

function readPath(value: unknown, path: string) {
  return path.split(".").reduce((current, part) => current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined, value);
}

export async function resolveScopedResource(input: { resourceId: string; purpose: string; fieldPaths: string[]; actor?: string }) {
  if (!ALLOWED_PURPOSES.has(input.purpose)) throw new Error("purpose_not_allowed");
  if (!input.fieldPaths.length || input.fieldPaths.some((path) => !ALLOWED_PATHS.has(path))) throw new Error("field_path_not_allowed");
  const resource = await prisma.resource.findUnique({
    where: { id: input.resourceId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!resource || resource.status !== "active" || !["email", "caldav"].includes(resource.resourceType) || !resource.versions[0]) throw new Error("resource_not_found");
  const payload = decryptJson(Buffer.from(resource.versions[0].encryptedPayload), Buffer.from(resource.versions[0].payloadNonce));
  const projection = Object.fromEntries(input.fieldPaths.map((path) => [path, readPath(payload, path)]));
  const requestId = randomUUID();
  await prisma.auditEvent.create({ data: { actor: input.actor ?? "agentmail", consumer: "agentmail", resourceId: resource.id, operation: input.purpose, fieldPaths: input.fieldPaths, result: "success", requestId } });
  return { requestId, resourceId: resource.id, version: resource.versions[0].version, expiresInSeconds: 300, fields: projection };
}
