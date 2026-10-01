import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  importPostgresDatabase,
  runImportCli,
  type ImportSource,
  type ImportTable,
} from "./postgres-sqlite-import";

const SECRET = "plaintext-payload-must-not-be-logged";
const created: string[] = [];

/**
 * Builds an in-memory Postgres-shaped source with one row of every column kind.
 */
function fixtureSource(): ImportSource {
  const createdAt = new Date("2026-01-02T03:04:05.000Z");
  const accountId = "11111111-1111-4111-8111-111111111111";
  const resourceId = "22222222-2222-4222-8222-222222222222";
  const rows: Record<ImportTable, Record<string, unknown>[]> = {
    Account: [{ id: accountId, slug: "mert-personal", displayName: "Mert", createdAt }],
    BotIdentity: [{
      id: "33333333-3333-4333-8333-333333333333",
      accountId,
      name: "hermes-main",
      externalSubject: "hermes-main",
      status: "active",
      createdAt,
    }],
    AccountMembership: [{ accountId, subject: "hermes-main", role: "owner", createdAt }],
    Resource: [{
      id: resourceId,
      accountId,
      resourceType: "website-login",
      name: "example",
      metadata: { provider: "example", note: SECRET },
      currentVersion: 1,
      status: "active",
      createdAt,
      updatedAt: createdAt,
    }],
    ResourceVersion: [{
      id: "44444444-4444-4444-8444-444444444444",
      resourceId,
      version: 1,
      encryptedPayload: Buffer.from(`cipher:${SECRET}`),
      payloadNonce: Buffer.from("nonce-12-bytes"),
      createdBy: "claim",
      createdAt,
    }],
    ResourceShare: [{
      id: "55555555-5555-4555-8555-555555555555",
      resourceId,
      sourceAccountId: accountId,
      targetAccountId: null,
      targetBotId: null,
      role: "read",
      allowedOperations: ["resolve"],
      allowedPaths: null,
      expiresAt: null,
      revokedAt: null,
      createdAt,
    }],
    Claim: [{
      id: "66666666-6666-4666-8666-666666666666",
      resourceId,
      tokenHash: "a".repeat(64),
      expiresAt: createdAt,
      usedAt: null,
      revokedAt: null,
      createdBy: "hermes-main",
      createdAt,
    }],
    VaultSyncJob: [{
      id: "77777777-7777-4777-8777-777777777777",
      resourceId,
      version: 1,
      vaultItemId: null,
      status: "pending",
      attempts: 0,
      lastError: null,
      processedAt: null,
      createdAt,
      updatedAt: createdAt,
    }],
    AuditEvent: [{
      id: BigInt(42),
      timestamp: createdAt,
      actor: "hermes-main",
      consumer: null,
      resourceId,
      operation: "resolve",
      fieldPaths: ["account.password"],
      result: "ok",
      failureCode: null,
      requestId: "88888888-8888-4888-8888-888888888888",
    }],
  };
  return {
    async counts() {
      return Object.fromEntries(Object.entries(rows).map(([table, tableRows]) => [table, tableRows.length])) as Record<ImportTable, number>;
    },
    async readTable(table) {
      return rows[table].map((row) => ({ ...row }));
    },
  };
}

/**
 * Creates a temporary absolute SQLite path and remembers it for cleanup.
 */
function tempDatabasePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "secretfabric-import-"));
  created.push(dir);
  return path.join(dir, "secretfabric.sqlite");
}

describe("postgres to sqlite import", () => {
  afterEach(() => {
    created.splice(0).forEach((dir) => {
      rmSync(dir, { recursive: true, force: true });
    });
  });

  it("requires an explicit postgres source and absolute sqlite target", async () => {
    const logs: string[] = [];
    const code = await runImportCli(["--target", "/tmp/secretfabric.sqlite"], {
      log: (line) => logs.push(line),
      error: (line) => logs.push(line),
      env: { DATABASE_URL: "postgresql://secretfabric:super-secret-password@127.0.0.1:5432/secretfabric" },
    });
    expect(code).toBe(2);
    expect(logs.join("\n")).toContain("source");
    expect(logs.join("\n")).not.toContain("super-secret-password");
  });

  it("ignores an ambient DATABASE_URL and refuses a non-postgres source", async () => {
    const logs: string[] = [];
    const code = await runImportCli([
      "--source", "file:/tmp/source.sqlite",
      "--target", "/tmp/secretfabric.sqlite",
    ], {
      log: (line) => logs.push(line),
      error: (line) => logs.push(line),
      env: { DATABASE_URL: "postgresql://secretfabric:super-secret-password@127.0.0.1:5432/secretfabric" },
    });
    expect(code).toBe(2);
    expect(logs.join("\n")).not.toContain("super-secret-password");
  });

  it("refuses to overwrite an existing sqlite database unless requested", async () => {
    const target = tempDatabasePath();
    const db = new DatabaseSync(target);
    db.exec('CREATE TABLE "Account" ("id" TEXT PRIMARY KEY, "slug" TEXT)');
    db.exec(`INSERT INTO "Account" ("id", "slug") VALUES ('keep-me', 'kept')`);
    db.close();
    const logs: string[] = [];
    await expect(importPostgresDatabase({
      source: fixtureSource(),
      targetPath: target,
      overwrite: false,
      log: (line) => logs.push(line),
    })).rejects.toThrow(/overwrite/i);
    const after = new DatabaseSync(target);
    const row = after.prepare('SELECT slug FROM "Account"').get() as { slug: string };
    after.close();
    expect(row.slug).toBe("kept");
    expect(logs.join("\n")).not.toContain(SECRET);
  });

  it("copies every model and reads counts back without logging payloads", async () => {
    const target = tempDatabasePath();
    const logs: string[] = [];
    const report = await importPostgresDatabase({
      source: fixtureSource(),
      targetPath: target,
      overwrite: false,
      log: (line) => logs.push(line),
    });
    expect(report.sourceCounts.Account).toBe(1);
    expect(report.targetCounts).toEqual(report.sourceCounts);
    expect(report.targetCounts.AuditEvent).toBe(1);
    const prisma = new PrismaClient({ datasourceUrl: `file:${target}` });
    try {
      const version = await prisma.resourceVersion.findFirstOrThrow();
      const audit = await prisma.auditEvent.findFirstOrThrow();
      const resource = await prisma.resource.findFirstOrThrow();
      expect(Buffer.from(version.encryptedPayload).toString("utf8")).toBe(`cipher:${SECRET}`);
      expect(audit.id).toBe(BigInt(42));
      expect(resource.metadata).toMatchObject({ note: SECRET });
      expect(resource.updatedAt.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    } finally {
      await prisma.$disconnect();
    }
    const rendered = logs.join("\n");
    expect(rendered).toContain("Account=1");
    expect(rendered).not.toContain(SECRET);
    expect(rendered).not.toContain("a".repeat(64));
    expect(readFileSync(target).includes(Buffer.from(SECRET))).toBe(true);
  });

  it("replaces an existing database only when overwrite is explicit", async () => {
    const target = tempDatabasePath();
    await importPostgresDatabase({ source: fixtureSource(), targetPath: target, overwrite: false, log: () => {} });
    const replacement: ImportSource = {
      async counts() {
        return { Account: 0, BotIdentity: 0, AccountMembership: 0, Resource: 0, ResourceVersion: 0, ResourceShare: 0, Claim: 0, VaultSyncJob: 0, AuditEvent: 0 };
      },
      async readTable() {
        return [];
      },
    };
    await expect(importPostgresDatabase({
      source: replacement,
      targetPath: target,
      overwrite: false,
      log: () => {},
    })).rejects.toThrow(/overwrite/i);
    const report = await importPostgresDatabase({
      source: replacement,
      targetPath: target,
      overwrite: true,
      log: () => {},
    });
    expect(report.targetCounts.Account).toBe(0);
  });
});
