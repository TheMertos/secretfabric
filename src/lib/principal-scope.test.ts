import { beforeEach, describe, expect, it, vi } from "vitest";
import { HERMES_PRINCIPAL_HEADER, readTrustedPrincipal } from "./principal";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    botIdentity: { findUnique: vi.fn() },
    accountMembership: { findFirst: vi.fn() },
    account: { findUnique: vi.fn() },
    resource: { findUnique: vi.fn() },
    resourceShare: { findFirst: vi.fn() },
  },
}));

vi.mock("./prisma", () => ({ prisma: mockPrisma }));

import {
  assertPrincipalCanAccessResource,
  resolvePrincipalContext,
} from "./principal-scope";

describe("readTrustedPrincipal", () => {
  it("returns principal from X-Hermes-Principal header", () => {
    const request = new Request("http://localhost/api/claims", {
      headers: { [HERMES_PRINCIPAL_HEADER]: "hermes-main" },
    });
    expect(readTrustedPrincipal(request)).toBe("hermes-main");
  });

  it("denies missing principal header", () => {
    const request = new Request("http://localhost/api/claims");
    expect(readTrustedPrincipal(request)).toBeNull();
  });

  it("denies empty or invalid principal values", () => {
    const empty = new Request("http://localhost", {
      headers: { [HERMES_PRINCIPAL_HEADER]: "   " },
    });
    expect(readTrustedPrincipal(empty)).toBeNull();
    const bad = new Request("http://localhost", {
      headers: { [HERMES_PRINCIPAL_HEADER]: "bad principal!" },
    });
    expect(readTrustedPrincipal(bad)).toBeNull();
  });
});

describe("resolvePrincipalContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps bot external subject to account", async () => {
    mockPrisma.botIdentity.findUnique = vi.fn().mockResolvedValue({
      id: "bot-1",
      accountId: "acct-a",
      status: "active",
    });
    const ctx = await resolvePrincipalContext("hermes-main");
    expect(ctx).toEqual({ principal: "hermes-main", accountId: "acct-a", botId: "bot-1" });
  });

  it("returns null when principal is unknown", async () => {
    mockPrisma.botIdentity.findUnique = vi.fn().mockResolvedValue(null);
    mockPrisma.accountMembership.findFirst.mockResolvedValue(null);
    mockPrisma.account.findUnique.mockResolvedValue(null);
    expect(await resolvePrincipalContext("unknown-bot")).toBeNull();
  });
});

describe("assertPrincipalCanAccessResource", () => {
  const ctx = { principal: "hermes-main", accountId: "acct-a", botId: "bot-1" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows same-principal owner access", async () => {
    mockPrisma.resource.findUnique.mockResolvedValue({ accountId: "acct-a" });
    await expect(assertPrincipalCanAccessResource(ctx, "res-1")).resolves.toBeUndefined();
  });

  it("denies cross-principal access without share", async () => {
    mockPrisma.resource.findUnique.mockResolvedValue({ accountId: "acct-b" });
    mockPrisma.resourceShare.findFirst.mockResolvedValue(null);
    await expect(assertPrincipalCanAccessResource(ctx, "res-1")).rejects.toThrow("principal_forbidden");
  });

  it("denies missing resource", async () => {
    mockPrisma.resource.findUnique.mockResolvedValue(null);
    await expect(assertPrincipalCanAccessResource(ctx, "res-missing")).rejects.toThrow("resource_not_found");
  });

  it("enforces resolver operation on shares", async () => {
    mockPrisma.resource.findUnique.mockResolvedValue({ accountId: "acct-b" });
    mockPrisma.resourceShare.findFirst.mockResolvedValue({
      allowedOperations: ["smtp-send"],
    });
    await expect(
      assertPrincipalCanAccessResource(ctx, "res-1", "imap-sync"),
    ).rejects.toThrow("operation_not_allowed");
    await expect(assertPrincipalCanAccessResource(ctx, "res-1", "smtp-send")).resolves.toBeUndefined();
  });
});
