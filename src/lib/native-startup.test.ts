import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve("scripts/assert-native-startup.mjs");
const validKey = "ab".repeat(32);
const validToken = "native-token-value-not-a-placeholder-0123456789";

/**
 * Runs the native startup gate with a clean environment.
 */
function runGate(env: Record<string, string>) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
  });
}

describe("native startup fail-closed", () => {
  it("accepts an absolute sqlite URL and external key material", () => {
    const result = runGate({
      DATABASE_URL: "file:/var/lib/secretfabric/secretfabric.sqlite",
      ENCRYPTION_KEY: validKey,
      SECRET_FABRIC_API_TOKEN: validToken,
    });
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(validKey);
    expect(`${result.stdout}${result.stderr}`).not.toContain(validToken);
  });

  it("rejects postgres, relative sqlite paths, missing keys, and placeholder tokens", () => {
    const cases = [
      { DATABASE_URL: "postgresql://secretfabric:secret-password@127.0.0.1/secretfabric", ENCRYPTION_KEY: validKey, SECRET_FABRIC_API_TOKEN: validToken },
      { DATABASE_URL: "file:./secretfabric.sqlite", ENCRYPTION_KEY: validKey, SECRET_FABRIC_API_TOKEN: validToken },
      { DATABASE_URL: "file:/var/lib/secretfabric/secretfabric.sqlite", ENCRYPTION_KEY: "short", SECRET_FABRIC_API_TOKEN: validToken },
      { DATABASE_URL: "file:/var/lib/secretfabric/secretfabric.sqlite", ENCRYPTION_KEY: validKey, SECRET_FABRIC_API_TOKEN: "REPLACE_WITH_A_LONG_RANDOM_TOKEN" },
      { DATABASE_URL: "file:/var/lib/secretfabric/secretfabric.sqlite", ENCRYPTION_KEY: validKey, SECRET_FABRIC_API_TOKEN: "too-short" },
    ];
    for (const env of cases) {
      const result = runGate(env);
      const output = `${result.stdout}${result.stderr}`;
      expect(result.status).toBe(2);
      expect(output).not.toContain("secret-password");
      expect(output).not.toContain(validKey);
      expect(output).not.toContain(validToken);
    }
  });
});
