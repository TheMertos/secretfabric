import { describe, expect, it } from "vitest";
import { readHealth } from "./health";

describe("health", () => {
  it("reports sqlite when the database probe succeeds", async () => {
    const health = await readHealth(async () => [{ v: "3" }]);
    expect(health).toEqual({
      httpStatus: 200,
      body: { status: "ok", service: "secretfabric", database: "ok", engine: "sqlite" },
    });
  });

  it("fails closed when the database probe throws", async () => {
    const health = await readHealth(async () => {
      throw new Error("postgresql://secretfabric:secret-password@db/secretfabric");
    });
    expect(health.httpStatus).toBe(503);
    expect(health.body).toEqual({ status: "degraded", service: "secretfabric", database: "unavailable" });
    expect(JSON.stringify(health.body)).not.toContain("secret-password");
  });
});
