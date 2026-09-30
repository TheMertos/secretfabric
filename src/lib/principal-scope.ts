import { prisma } from "./prisma";

export type PrincipalContext = {
  principal: string;
  accountId: string;
  botId?: string;
};

/**
 * Resolves a trusted principal to an account via BotIdentity, membership, or account slug.
 * @param principal Trusted principal name (Hermes profile principal).
 * @returns Scoped context or null when unmapped.
 */
export async function resolvePrincipalContext(principal: string): Promise<PrincipalContext | null> {
  const bot = await prisma.botIdentity.findUnique({
    where: { externalSubject: principal },
    select: { id: true, accountId: true, status: true },
  });
  if (bot) {
    if (bot.status !== "active") return null;
    return { principal, accountId: bot.accountId, botId: bot.id };
  }
  const membership = await prisma.accountMembership.findFirst({
    where: { subject: principal },
    select: { accountId: true },
  });
  if (membership) {
    return { principal, accountId: membership.accountId };
  }
  const account = await prisma.account.findUnique({
    where: { slug: principal },
    select: { id: true },
  });
  if (account) {
    return { principal, accountId: account.id };
  }
  return null;
}

function shareOperationsInclude(allowedOperations: unknown, operation: string): boolean {
  if (!Array.isArray(allowedOperations)) return false;
  return allowedOperations.some((op) => op === operation || op === "*");
}

/**
 * Ensures the principal may access a resource (owner or active share).
 * @param ctx Resolved principal context.
 * @param resourceId Target resource UUID.
 * @param operation Optional resolver/claim operation for share policy checks.
 */
export async function assertPrincipalCanAccessResource(
  ctx: PrincipalContext,
  resourceId: string,
  operation?: string,
): Promise<void> {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { accountId: true },
  });
  if (!resource) throw new Error("resource_not_found");
  if (resource.accountId === ctx.accountId) return;

  const now = new Date();
  const share = await prisma.resourceShare.findFirst({
    where: {
      resourceId,
      revokedAt: null,
      OR: [{ targetAccountId: ctx.accountId }, ...(ctx.botId ? [{ targetBotId: ctx.botId }] : [])],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
    select: { allowedOperations: true },
  });
  if (!share) throw new Error("principal_forbidden");
  if (operation && !shareOperationsInclude(share.allowedOperations, operation)) {
    throw new Error("operation_not_allowed");
  }
}

/**
 * Loads a resource id for a claim token when the principal owns the resource.
 * @param ctx Resolved principal context.
 * @param token Raw claim token.
 * @returns Resource id or throws principal_forbidden / claim_not_found.
 */
export async function assertPrincipalOwnsClaimToken(ctx: PrincipalContext, tokenHash: string): Promise<string> {
  const claim = await prisma.claim.findUnique({
    where: { tokenHash },
    select: { resource: { select: { id: true, accountId: true } } },
  });
  if (!claim) throw new Error("claim_not_found");
  if (claim.resource.accountId !== ctx.accountId) throw new Error("principal_forbidden");
  return claim.resource.id;
}
