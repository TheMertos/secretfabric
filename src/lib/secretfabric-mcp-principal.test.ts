import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  HERMES_DEFAULT_PRINCIPAL,
  resolvePrincipalFromHermesHome,
} from "./hermes-profile-principal";

const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tools");
const mcpPath = path.join(toolsDir, "secretfabric_mcp.py");

/**
 * Load resolve_trusted_principal from the Python MCP bridge with a given environment.
 * @param env Environment overrides (unset keys are removed when value is undefined).
 */
function resolvePrincipal(env: Record<string, string | undefined>): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const childEnv: Record<string, string> = { ...process.env, PYTHONPATH: toolsDir };
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
  const result = spawnSync("python3", ["-c", script], {
    env: childEnv as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

describe("secretfabric MCP trusted principal", { timeout: 20_000 }, () => {
  it("requires HERMES_HOME", () => {
    const result = resolvePrincipal({
      HERMES_HOME: undefined,
      HERMES_INSTANCE_NAME: "ignored",
      SECRET_FABRIC_PRINCIPAL: "ignored",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/HERMES_HOME/);
  });

  it("does not use HERMES_INSTANCE_NAME or SECRET_FABRIC_PRINCIPAL", () => {
    const result = resolvePrincipal({
      HERMES_HOME: undefined,
      HERMES_INSTANCE_NAME: "mert",
      SECRET_FABRIC_PRINCIPAL: "mert",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("maps default HERMES_HOME to canonical default", () => {
    const home = "/home/example/.hermes";
    expect(resolvePrincipalFromHermesHome(home)).toBe(HERMES_DEFAULT_PRINCIPAL);
    const result = resolvePrincipal({ HERMES_HOME: home });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(HERMES_DEFAULT_PRINCIPAL);
  });

  it("maps profile HERMES_HOME to profile name", () => {
    const home = "/home/example/.hermes/profiles/mert";
    expect(resolvePrincipalFromHermesHome(home)).toBe("mert");
    const result = resolvePrincipal({ HERMES_HOME: home });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("mert");
  });

  it("rejects ambiguous HERMES_HOME", () => {
    const result = resolvePrincipal({ HERMES_HOME: "/home/example/.hermes/profiles" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/ambiguous|unsupported|HERMES_HOME/);
  });
});
