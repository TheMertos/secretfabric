import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockDecrypt, mockAssert } = vi.hoisted(() => ({
  mockPrisma: {
    resource: { findUnique: vi.fn() },
    auditEvent: { create: vi.fn() },
  },
  mockDecrypt: vi.fn(),
  mockAssert: vi.fn(),
}));

vi.mock("./prisma", () => ({ prisma: mockPrisma }));
vi.mock("./crypto", () => ({ decryptJson: mockDecrypt }));
vi.mock("./principal-scope", () => ({
  assertPrincipalCanAccessResource: mockAssert,
}));

import { resolveScopedResource } from "./resolver";

const ctx = { principal: "hermes-main", accountId: "acct-a", botId: "bot-1" };

describe("resolveScopedResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssert.mockResolvedValue(undefined);
    mockDecrypt.mockReturnValue({ identity: { email: "a@b.c" } });
    mockPrisma.auditEvent.create.mockResolvedValue({});
  });

  it("uses trusted principal as audit actor", async () => {
    mockPrisma.resource.findUnique.mockResolvedValue({
      id: "res-1",
      status: "active",
      resourceType: "email",
      versions: [
        {
          version: 1,
          encryptedPayload: Buffer.from("x"),
          payloadNonce: Buffer.from("n"),
        },
      ],
    });
    await resolveScopedResource({
      ctx,
      resourceId: "res-1",
      purpose: "smtp-send",
      fieldPaths: ["identity.email"],
    });
    expect(mockAssert).toHaveBeenCalledWith(ctx, "res-1", "smtp-send");
    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actor: "hermes-main" }),
      }),
    );
  });

  it("propagates principal_forbidden from scope check", async () => {
    mockAssert.mockRejectedValue(new Error("principal_forbidden"));
    await expect(
      resolveScopedResource({
        ctx,
        resourceId: "res-1",
        purpose: "smtp-send",
        fieldPaths: ["identity.email"],
      }),
    ).rejects.toThrow("principal_forbidden");
  });

  it("resolves a non-email/caldav resource type (oauth2) using the schema's own field paths", async () => {
    mockPrisma.resource.findUnique.mockResolvedValue({
      id: "res-2",
      status: "active",
      resourceType: "oauth2",
      versions: [
        {
          version: 1,
          encryptedPayload: Buffer.from("x"),
          payloadNonce: Buffer.from("n"),
        },
      ],
    });
    mockDecrypt.mockReturnValue({ clientId: "abc", clientSecret: "shh", refreshToken: "rt" });
    const result = await resolveScopedResource({
      ctx,
      resourceId: "res-2",
      purpose: "youtube-video-upload",
      fieldPaths: ["clientId", "clientSecret", "refreshToken"],
    });
    expect(result.fields).toEqual({ clientId: "abc", clientSecret: "shh", refreshToken: "rt" });
  });

  it("rejects a field path that is not part of the resource type's own schema", async () => {
    mockPrisma.resource.findUnique.mockResolvedValue({
      id: "res-3",
      status: "active",
      resourceType: "oauth2",
      versions: [
        {
          version: 1,
          encryptedPayload: Buffer.from("x"),
          payloadNonce: Buffer.from("n"),
        },
      ],
    });
    await expect(
      resolveScopedResource({
        ctx,
        resourceId: "res-3",
        purpose: "youtube-video-upload",
        fieldPaths: ["notAFieldOnThisSchema"],
      }),
    ).rejects.toThrow("field_path_not_allowed");
  });

  it("resolves by resourceName within the caller's own account when resourceId is omitted", async () => {
    mockPrisma.resource.findUnique
      .mockResolvedValueOnce({ id: "res-4" })
      .mockResolvedValueOnce({
        id: "res-4",
        status: "active",
        resourceType: "email",
        versions: [
          { version: 1, encryptedPayload: Buffer.from("x"), payloadNonce: Buffer.from("n") },
        ],
      });
    const result = await resolveScopedResource({
      ctx,
      resourceName: "My Mailbox",
      purpose: "smtp-send",
      fieldPaths: ["identity.email"],
    });
    expect(result.resourceId).toBe("res-4");
  });
});
