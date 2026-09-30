import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockAssertOwns } = vi.hoisted(() => ({
  mockPrisma: {
    resource: { upsert: vi.fn() },
    claim: { create: vi.fn(), updateMany: vi.fn() },
  },
  mockAssertOwns: vi.fn(),
}));

vi.mock("./prisma", () => ({ prisma: mockPrisma }));
vi.mock("./schema-catalog", () => ({
  getSchema: vi.fn(() => ({ fields: [] })),
}));
vi.mock("./principal-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./principal-scope")>();
  return {
    ...actual,
    assertPrincipalOwnsClaimToken: mockAssertOwns,
  };
});

import { createClaim, revokeClaim } from "./claims";

const ctx = { principal: "hermes-main", accountId: "acct-a", botId: "bot-1" };

describe("createClaim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.resource.upsert.mockResolvedValue({ id: "res-1" });
    mockPrisma.claim.create.mockResolvedValue({});
  });

  it("binds new claims to the principal account", async () => {
    await createClaim(ctx, { name: "info-mail", type: "email" });
    expect(mockPrisma.resource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId_name: { accountId: "acct-a", name: "info-mail" } },
      }),
    );
    expect(mockPrisma.claim.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdBy: "hermes-main" }),
      }),
    );
  });
});

describe("revokeClaim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies cross-principal revoke", async () => {
    mockAssertOwns.mockRejectedValue(new Error("principal_forbidden"));
    const ok = await revokeClaim({ principal: "other", accountId: "acct-b" }, "token");
    expect(ok).toBe(false);
    expect(mockPrisma.claim.updateMany).not.toHaveBeenCalled();
  });

  it("revokes when principal owns the claim resource", async () => {
    mockAssertOwns.mockResolvedValue("res-1");
    mockPrisma.claim.updateMany.mockResolvedValue({ count: 1 });
    const ok = await revokeClaim(ctx, "token");
    expect(ok).toBe(true);
  });
});
