import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mcpPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../tools/secretfabric_mcp.py",
);

/**
 * Load resolve_trusted_principal from the Python MCP bridge with a given environment.
 * @param env Environment overrides (unset keys are removed when value is undefined).
 */
function resolvePrincipal(env: Record<string, string | undefined>): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const childEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  const script = `
import importlib.util
import sys
spec = importlib.util.spec_from_file_location("secretfabric_mcp", r"${mcpPath.replace(/\\/g, "\\\\")}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
try:
    print(mod.resolve_trusted_principal())
except RuntimeError as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(1)
`;
  const result = spawnSync("python3", ["-c", script], { env: childEnv, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

describe("secretfabric MCP trusted principal", { timeout: 20_000 }, () => {
  it("requires HERMES_INSTANCE_NAME", () => {
    const result = resolvePrincipal({
      HERMES_INSTANCE_NAME: undefined,
      SECRET_FABRIC_PRINCIPAL: "only-deployment-env",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/HERMES_INSTANCE_NAME/);
  });

  it("does not fall back to SECRET_FABRIC_PRINCIPAL", () => {
    const result = resolvePrincipal({
      HERMES_INSTANCE_NAME: undefined,
      SECRET_FABRIC_PRINCIPAL: "mert",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("returns trimmed HERMES_INSTANCE_NAME", () => {
    const result = resolvePrincipal({ HERMES_INSTANCE_NAME: "  mert  " });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("mert");
  });

  it("rejects whitespace-only HERMES_INSTANCE_NAME", () => {
    const result = resolvePrincipal({ HERMES_INSTANCE_NAME: "   " });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/HERMES_INSTANCE_NAME/);
  });
});
