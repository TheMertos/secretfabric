import { beforeEach, describe, expect, it, vi } from "vitest";
import { HERMES_PRINCIPAL_HEADER } from "./principal";

vi.mock("./api-auth", () => ({
  isApiRequestAuthorized: vi.fn(),
}));

const { mockResolve } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
}));

vi.mock("./principal-scope", () => ({
  resolvePrincipalContext: mockResolve,
}));

import { isApiRequestAuthorized } from "./api-auth";
import { authorizeControlPlaneRequest } from "./control-plane-auth";

describe("authorizeControlPlaneRequest", () => {
  beforeEach(() => {
    vi.mocked(isApiRequestAuthorized).mockReset();
    mockResolve.mockReset();
  });

  it("denies missing principal with valid API token", async () => {
    vi.mocked(isApiRequestAuthorized).mockReturnValue(true);
    const result = await authorizeControlPlaneRequest(new Request("http://localhost/api/claims"));
    expect(result).toEqual({ ok: false, status: 401, error: "principal_required" });
  });

  it("denies unmapped principal", async () => {
    vi.mocked(isApiRequestAuthorized).mockReturnValue(true);
    mockResolve.mockResolvedValue(null);
    const request = new Request("http://localhost/api/claims", {
      headers: { [HERMES_PRINCIPAL_HEADER]: "orphan" },
    });
    const result = await authorizeControlPlaneRequest(request);
    expect(result).toEqual({ ok: false, status: 403, error: "principal_not_mapped" });
  });

  it("allows mapped principal with API token", async () => {
    vi.mocked(isApiRequestAuthorized).mockReturnValue(true);
    const ctx = { principal: "hermes-main", accountId: "acct-a", botId: "bot-1" };
    mockResolve.mockResolvedValue(ctx);
    const request = new Request("http://localhost/api/claims", {
      headers: { [HERMES_PRINCIPAL_HEADER]: "hermes-main" },
    });
    const result = await authorizeControlPlaneRequest(request);
    expect(result).toEqual({ ok: true, ctx });
  });
});
