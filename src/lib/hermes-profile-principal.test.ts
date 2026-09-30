import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  HERMES_DEFAULT_PRINCIPAL,
  HermesProfilePrincipalError,
  resolvePrincipalFromHermesHome,
} from "./hermes-profile-principal";

describe("resolvePrincipalFromHermesHome", () => {
  it("maps default HERMES_HOME to canonical default principal", () => {
    expect(resolvePrincipalFromHermesHome("/home/mert/.hermes")).toBe(HERMES_DEFAULT_PRINCIPAL);
    expect(resolvePrincipalFromHermesHome("/home/mert/.hermes/")).toBe(HERMES_DEFAULT_PRINCIPAL);
  });

  it("maps profile-scoped HERMES_HOME to the profile name", () => {
    expect(resolvePrincipalFromHermesHome("/home/mert/.hermes/profiles/mert")).toBe("mert");
    expect(resolvePrincipalFromHermesHome("/home/mert/.hermes/profiles/hermes-main")).toBe(
      "hermes-main",
    );
  });

  it("fails closed when HERMES_HOME is missing or blank", () => {
    expect(() => resolvePrincipalFromHermesHome(undefined)).toThrow(HermesProfilePrincipalError);
    expect(() => resolvePrincipalFromHermesHome(null)).toThrow(HermesProfilePrincipalError);
    expect(() => resolvePrincipalFromHermesHome("   ")).toThrow(/HERMES_HOME is required/);
  });

  it("rejects ambiguous or unsupported paths", () => {
    expect(() => resolvePrincipalFromHermesHome("/home/mert/.hermes/profiles")).toThrow(
      /ambiguous or unsupported/,
    );
    expect(() => resolvePrincipalFromHermesHome("/home/mert/.hermes/other")).toThrow(
      /ambiguous or unsupported/,
    );
    expect(() => resolvePrincipalFromHermesHome("/tmp/not-hermes")).toThrow(
      /ambiguous or unsupported/,
    );
    expect(() =>
      resolvePrincipalFromHermesHome("/home/mert/.hermes/profiles/mert/nested"),
    ).toThrow(/ambiguous or unsupported/);
  });

  it("rejects unsafe profile name segments", () => {
    expect(() =>
      resolvePrincipalFromHermesHome("/home/mert/.hermes/profiles/bad principal"),
    ).toThrow(/unsafe HERMES_HOME path/);
  });

  it("resolves relative HERMES_HOME against cwd", () => {
    const home = path.join(".hermes", "profiles", "rel-test");
    expect(resolvePrincipalFromHermesHome(home)).toBe("rel-test");
  });
});
