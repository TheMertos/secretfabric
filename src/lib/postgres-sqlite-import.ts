import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Prisma, PrismaClient } from "@prisma/client";

export const IMPORT_TABLES = [
  "Account",
  "BotIdentity",
  "AccountMembership",
  "Resource",
  "ResourceVersion",
  "ResourceShare",
  "Claim",
  "VaultSyncJob",
  "AuditEvent",
] as const;

export type ImportTable = (typeof IMPORT_TABLES)[number];

export type ImportSource = {
  /** Returns row counts keyed by allowlisted table name. */
  counts(): Promise<Record<ImportTable, number>>;
  /** Returns every row for one allowlisted table. */
  readTable(table: ImportTable): Promise<Record<string, unknown>[]>;
};

type ImportLogger = (line: string) => void;

type CountReport = {
  sourceCounts: Record<ImportTable, number>;
  targetCounts: Record<ImportTable, number>;
};

const DATE_FIELDS = new Set(["createdAt", "updatedAt", "expiresAt", "revokedAt", "usedAt", "processedAt", "timestamp"]);
const BYTE_FIELDS = new Set(["encryptedPayload", "payloadNonce"]);
const JSON_FIELDS = new Set(["metadata", "allowedOperations", "allowedPaths", "fieldPaths"]);

/**
 * Signals a caller error that must not print connection strings or payloads.
 */
export class ImportUsageError extends Error {
  /**
   * @param message Stable usage message without source data.
   */
  constructor(message: string) {
    super(message);
    this.name = "ImportUsageError";
  }
}

/**
 * Removes connection strings and key-shaped tokens from a diagnostic message.
 * @param text Raw error text.
 * @returns Text safe to print.
 */
export function redactSensitiveText(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://redacted")
    .replace(/file:\S+/gi, "file:redacted")
    .replace(/\b[0-9a-fA-F]{64}\b/g, "[redacted-key]");
}

/**
 * Parses the one-time import CLI. Source and target must be explicit arguments.
 * @param argv Arguments after the script name.
 * @returns Validated source URL, absolute target path, and overwrite flag.
 */
export function parseImportArgs(argv: string[]): { sourceDatabaseUrl: string; targetPath: string; overwrite: boolean } {
  let sourceDatabaseUrl = "";
  let targetPath = "";
  let overwrite = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--overwrite") {
      overwrite = true;
      continue;
    }
    if (arg === "--source") {
      sourceDatabaseUrl = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--target") {
      targetPath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new ImportUsageError("unknown argument; expected --source, --target, and optional --overwrite");
  }
  if (!sourceDatabaseUrl) throw new ImportUsageError("--source is required and must be a PostgreSQL URL");
  if (!/^postgres(?:ql)?:\/\//i.test(sourceDatabaseUrl)) {
    throw new ImportUsageError("--source must be an explicit postgres:// or postgresql:// URL");
  }
  if (!targetPath || !path.isAbsolute(targetPath)) {
    throw new ImportUsageError("--target is required and must be an absolute SQLite file path");
  }
  return { sourceDatabaseUrl, targetPath, overwrite };
}

/**
 * Copies an allowlisted Postgres snapshot into a SQLite file and checks counts.
 * @param options Source reader, absolute target path, overwrite flag, and logger.
 * @returns Source and target row counts.
 */
export async function importPostgresDatabase(options: {
  source: ImportSource;
  targetPath: string;
  overwrite: boolean;
  log?: ImportLogger;
}): Promise<CountReport> {
  const log = options.log ?? (() => {});
  if (!path.isAbsolute(options.targetPath)) throw new ImportUsageError("--target must be an absolute SQLite file path");
  if (!existsSync(path.dirname(options.targetPath))) throw new ImportUsageError("target directory does not exist");
  const existingRows = countUserRows(options.targetPath);
  if (existingRows > 0 && !options.overwrite) {
    throw new ImportUsageError("Refusing to overwrite a SQLite database that already has rows. Re-run with --overwrite to replace it.");
  }
  if (options.overwrite && existsSync(options.targetPath)) removeSqliteFiles(options.targetPath);

  const sourceCounts = await options.source.counts();
  const tables = {} as Record<ImportTable, Record<string, unknown>[]>;
  for (const table of IMPORT_TABLES) {
    const rows = await options.source.readTable(table);
    if (rows.length !== sourceCounts[table]) throw new Error(`source count mismatch for ${table}`);
    tables[table] = rows.map((row) => normalizeRow(table, row));
  }
  const sourcePayloadBytes = byteLengths(tables.ResourceVersion);

  applyMigrations(options.targetPath);
  const prisma = new PrismaClient({ datasourceUrl: `file:${options.targetPath}` });
  try {
    await prisma.$transaction(async (tx) => {
      for (const table of IMPORT_TABLES) await insertTable(tx, table, tables[table]);
    }, { timeout: 120_000 });
    const targetCounts = await readTargetCounts(prisma);
    const storedVersions = await prisma.resourceVersion.findMany({ select: { encryptedPayload: true, payloadNonce: true } });
    const targetPayloadBytes = {
      payload: storedVersions.reduce((sum, row) => sum + row.encryptedPayload.byteLength, 0),
      nonce: storedVersions.reduce((sum, row) => sum + row.payloadNonce.byteLength, 0),
    };
    if (JSON.stringify(sourceCounts) !== JSON.stringify(targetCounts) || sourcePayloadBytes.payload !== targetPayloadBytes.payload || sourcePayloadBytes.nonce !== targetPayloadBytes.nonce) {
      throw new Error("sqlite readback validation failed");
    }
    for (const table of IMPORT_TABLES) log(`source ${table}=${sourceCounts[table]}`);
    for (const table of IMPORT_TABLES) log(`target ${table}=${targetCounts[table]}`);
    log("validation ok");
    return { sourceCounts, targetCounts };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Runs the CLI. Ambient DATABASE_URL is ignored; only --source is read.
 * @param argv Process arguments after the script name.
 * @param io Optional log sinks. Env is accepted and intentionally unused.
 * @returns Process exit code.
 */
export async function runImportCli(argv: string[], io?: { log?: ImportLogger; error?: ImportLogger; env?: Record<string, string | undefined> }): Promise<number> {
  const log = io?.log ?? ((line: string) => console.log(line));
  const error = io?.error ?? ((line: string) => console.error(line));
  void io?.env;
  try {
    const request = parseImportArgs(argv);
    const opened = await openPostgresImportSource(request.sourceDatabaseUrl);
    try {
      await importPostgresDatabase({
        source: opened.source,
        targetPath: request.targetPath,
        overwrite: request.overwrite,
        log,
      });
    } finally {
      await opened.close();
    }
    return 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "import failed";
    error(redactSensitiveText(message));
    return caught instanceof ImportUsageError ? 2 : 1;
  }
}

/**
 * Opens a PostgreSQL source. The URL is never written to the returned rows' logs.
 * @param connectionString Explicit postgres URL from --source.
 * @returns A source reader and a close function.
 */
export async function openPostgresImportSource(connectionString: string): Promise<{ source: ImportSource; close: () => Promise<void> }> {
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) throw new ImportUsageError("--source must be an explicit postgres:// or postgresql:// URL");
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  const source: ImportSource = {
    async counts() {
      const counts = {} as Record<ImportTable, number>;
      for (const table of IMPORT_TABLES) {
        const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${quoteIdent(table)}`);
        counts[table] = Number(result.rows[0]?.count ?? 0);
      }
      return counts;
    },
    async readTable(table: ImportTable) {
      assertTable(table);
      const result = await client.query<Record<string, unknown>>(`SELECT * FROM ${quoteIdent(table)}`);
      return result.rows;
    },
  };
  return { source, close: async () => { await client.end(); } };
}

/**
 * Confirms a table is part of the import allowlist.
 * @param table Requested table name.
 */
function assertTable(table: string): asserts table is ImportTable {
  if (!(IMPORT_TABLES as readonly string[]).includes(table)) throw new Error("unknown import table");
}

/**
 * Quotes a known identifier.
 * @param name Allowlisted SQL identifier.
 * @returns Quoted identifier.
 */
function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("unexpected sql identifier");
  return `"${name}"`;
}

/**
 * Counts rows in user tables. Prisma migration bookkeeping is ignored.
 * @param targetPath Absolute SQLite path.
 * @returns Total user rows, or zero when the file does not exist.
 */
function countUserRows(targetPath: string): number {
  if (!existsSync(targetPath)) return 0;
  const database = new DatabaseSync(targetPath, { readOnly: true });
  try {
    const tables = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'",
    ).all() as Array<{ name: string }>;
    return tables.reduce((sum, table) => {
      const row = database.prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(table.name)}`).get() as { c: number };
      return sum + Number(row.c);
    }, 0);
  } finally {
    database.close();
  }
}

/**
 * Deletes a SQLite database and its sidecar files.
 * @param targetPath Absolute database path.
 */
function removeSqliteFiles(targetPath: string): void {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(`${targetPath}${suffix}`, { force: true });
}

/**
 * Applies the committed SQLite migrations to an absolute file URL.
 * @param targetPath Absolute SQLite path.
 */
function applyMigrations(targetPath: string): void {
  try {
    execFileSync("yarn", ["prisma", "migrate", "deploy"], {
      cwd: findRepoRoot(),
      env: { ...process.env, DATABASE_URL: `file:${targetPath}` },
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch (error) {
    const stderr = typeof error === "object" && error && "stderr" in error ? String(error.stderr) : "";
    throw new Error(`sqlite migration failed: ${redactSensitiveText(stderr).slice(0, 400)}`);
  }
}

/**
 * Finds the repository root that contains the Prisma schema.
 * @returns Absolute repository path.
 */
function findRepoRoot(): string {
  let current = process.cwd();
  while (true) {
    if (existsSync(path.join(current, "prisma", "schema.prisma"))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error("prisma schema was not found");
    current = parent;
  }
}

/**
 * Normalizes a Postgres row into values Prisma can store in SQLite.
 * @param table Allowlisted table name.
 * @param row Source row.
 * @returns Column values with dates, blobs, JSON, and audit ids coerced.
 */
function normalizeRow(table: ImportTable, row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      normalized[key] = null;
      continue;
    }
    if (BYTE_FIELDS.has(key)) {
      normalized[key] = asBytes(value);
      continue;
    }
    if (DATE_FIELDS.has(key)) {
      normalized[key] = asDate(value);
      continue;
    }
    if (JSON_FIELDS.has(key)) {
      normalized[key] = typeof value === "string" ? JSON.parse(value) as unknown : value;
      continue;
    }
    if (table === "AuditEvent" && key === "id") {
      normalized[key] = typeof value === "bigint" ? value : BigInt(String(value));
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

/**
 * Converts a binary source value without printing it.
 * @param value Postgres bytea value.
 * @returns A Node buffer.
 */
function asBytes(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error("expected binary column");
}

/**
 * Converts a timestamp without including the original text in errors.
 * @param value Source timestamp.
 * @returns A Date instance.
 */
function asDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(typeof value === "string" || typeof value === "number" ? value : "");
  if (Number.isNaN(date.getTime())) throw new Error("invalid timestamp column");
  return date;
}

/**
 * Sums encrypted payload and nonce sizes.
 * @param rows ResourceVersion rows.
 * @returns Byte totals.
 */
function byteLengths(rows: Record<string, unknown>[]): { payload: number; nonce: number } {
  return rows.reduce<{ payload: number; nonce: number }>((sum, row) => ({
    payload: sum.payload + asBytes(row.encryptedPayload).length,
    nonce: sum.nonce + asBytes(row.payloadNonce).length,
  }), { payload: 0, nonce: 0 });
}

/**
 * Inserts rows in small batches, preserving ids and timestamps.
 * @param tx Prisma transaction.
 * @param table Allowlisted table.
 * @param rows Normalized rows.
 */
async function insertTable(tx: Prisma.TransactionClient, table: ImportTable, rows: Record<string, unknown>[]): Promise<void> {
  for (const batch of chunks(rows, 25)) {
    if (table === "Account") await tx.account.createMany({ data: batch.map(accountInput) });
    if (table === "BotIdentity") await tx.botIdentity.createMany({ data: batch.map(botInput) });
    if (table === "AccountMembership") await tx.accountMembership.createMany({ data: batch.map(membershipInput) });
    if (table === "Resource") await tx.resource.createMany({ data: batch.map(resourceInput) });
    if (table === "ResourceVersion") await tx.resourceVersion.createMany({ data: batch.map(versionInput) });
    if (table === "ResourceShare") await tx.resourceShare.createMany({ data: batch.map(shareInput) });
    if (table === "Claim") await tx.claim.createMany({ data: batch.map(claimInput) });
    if (table === "VaultSyncJob") await tx.vaultSyncJob.createMany({ data: batch.map(jobInput) });
    if (table === "AuditEvent") await tx.auditEvent.createMany({ data: batch.map(auditInput) });
  }
}

/**
 * Reads SQLite counts through Prisma after the copy.
 * @param prisma Target client.
 * @returns Counts keyed by table name.
 */
async function readTargetCounts(prisma: PrismaClient): Promise<Record<ImportTable, number>> {
  return {
    Account: await prisma.account.count(),
    BotIdentity: await prisma.botIdentity.count(),
    AccountMembership: await prisma.accountMembership.count(),
    Resource: await prisma.resource.count(),
    ResourceVersion: await prisma.resourceVersion.count(),
    ResourceShare: await prisma.resourceShare.count(),
    Claim: await prisma.claim.count(),
    VaultSyncJob: await prisma.vaultSyncJob.count(),
    AuditEvent: await prisma.auditEvent.count(),
  };
}

/**
 * Splits rows so SQLite variable limits stay small.
 * @param rows Source rows.
 * @param size Batch size.
 * @returns Batches.
 */
function chunks<T>(rows: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) batches.push(rows.slice(index, index + size));
  return batches;
}

/**
 * Maps optional JSON to a database NULL or a JSON value.
 * @param value Parsed JSON or null.
 * @returns Prisma JSON input.
 */
function optionalJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

/**
 * Maps one account row.
 * @param row Normalized row.
 * @returns Prisma input.
 */
function accountInput(row: Record<string, unknown>): Prisma.AccountCreateManyInput {
  return { id: String(row.id), slug: String(row.slug), displayName: String(row.displayName), createdAt: asDate(row.createdAt) };
}

/**
 * Maps one bot row.
 * @param row Normalized row.
 * @returns Prisma input.
 */
function botInput(row: Record<string, unknown>): Prisma.BotIdentityCreateManyInput {
  return {
    id: String(row.id),
    accountId: String(row.accountId),
    name: String(row.name),
    externalSubject: String(row.externalSubject),
    status: String(row.status),
    createdAt: asDate(row.createdAt),
  };
}

/**
 * Maps one membership row.
 * @param row Normalized row.
 * @returns Prisma input.
 */
function membershipInput(row: Record<string, unknown>): Prisma.AccountMembershipCreateManyInput {
  return { accountId: String(row.accountId), subject: String(row.subject), role: String(row.role), createdAt: asDate(row.createdAt) };
}

/**
 * Maps one resource row.
 * @param row Normalized row.
 * @returns Prisma input.
 */
function resourceInput(row: Record<string, unknown>): Prisma.ResourceCreateManyInput {
  return {
    id: String(row.id),
    accountId: String(row.accountId),
    resourceType: String(row.resourceType),
    name: String(row.name),
    metadata: optionalJson(row.metadata),
    currentVersion: Number(row.currentVersion),
    status: String(row.status),
    createdAt: asDate(row.createdAt),
    updatedAt: asDate(row.updatedAt),
  };
}

/**
 * Maps one encrypted resource version.
 * @param row Normalized row.
 * @returns Prisma input.
 */
function versionInput(row: Record<string, unknown>): Prisma.ResourceVersionCreateManyInput {
  return {
    id: String(row.id),
    resourceId: String(row.resourceId),
    version: Number(row.version),
    encryptedPayload: new Uint8Array(asBytes(row.encryptedPayload)),
    payloadNonce: new Uint8Array(asBytes(row.payloadNonce)),
    createdBy: String(row.createdBy),
    createdAt: asDate(row.createdAt),
  };
}

/**
 * Maps one share row.
 * @param row Normalized row.
 * @returns Prisma input.
 */
function shareInput(row: Record<string, unknown>): Prisma.ResourceShareCreateManyInput {
  return {
    id: String(row.id),
    resourceId: String(row.resourceId),
    sourceAccountId: String(row.sourceAccountId),
    targetAccountId: row.targetAccountId == null ? null : String(row.targetAccountId),
    targetBotId: row.targetBotId == null ? null : String(row.targetBotId),
    role: String(row.role),
    allowedOperations: optionalJson(row.allowedOperations) as Prisma.InputJsonValue,
    allowedPaths: optionalJson(row.allowedPaths),
    expiresAt: row.expiresAt == null ? null : asDate(row.expiresAt),
    revokedAt: row.revokedAt == null ? null : asDate(row.revokedAt),
    createdAt: asDate(row.createdAt),
  };
}

/**
 * Maps one claim row. The token hash is copied and never logged.
 * @param row Normalized row.
 * @returns Prisma input.
 */
function claimInput(row: Record<string, unknown>): Prisma.ClaimCreateManyInput {
  return {
    id: String(row.id),
    resourceId: String(row.resourceId),
    tokenHash: String(row.tokenHash),
    expiresAt: asDate(row.expiresAt),
    usedAt: row.usedAt == null ? null : asDate(row.usedAt),
    revokedAt: row.revokedAt == null ? null : asDate(row.revokedAt),
    createdBy: row.createdBy == null ? null : String(row.createdBy),
    createdAt: asDate(row.createdAt),
  };
}

/**
 * Maps one vault sync job.
 * @param row Normalized row.
 * @returns Prisma input.
 */
function jobInput(row: Record<string, unknown>): Prisma.VaultSyncJobCreateManyInput {
  return {
    id: String(row.id),
    resourceId: String(row.resourceId),
    version: Number(row.version),
    vaultItemId: row.vaultItemId == null ? null : String(row.vaultItemId),
    status: String(row.status),
    attempts: Number(row.attempts),
    lastError: row.lastError == null ? null : String(row.lastError),
    processedAt: row.processedAt == null ? null : asDate(row.processedAt),
    createdAt: asDate(row.createdAt),
    updatedAt: asDate(row.updatedAt),
  };
}

/**
 * Maps one audit event, preserving the original integer id.
 * @param row Normalized row.
 * @returns Prisma input.
 */
function auditInput(row: Record<string, unknown>): Prisma.AuditEventCreateManyInput {
  return {
    id: typeof row.id === "bigint" ? row.id : BigInt(String(row.id)),
    timestamp: asDate(row.timestamp),
    actor: String(row.actor),
    consumer: row.consumer == null ? null : String(row.consumer),
    resourceId: row.resourceId == null ? null : String(row.resourceId),
    operation: String(row.operation),
    fieldPaths: optionalJson(row.fieldPaths),
    result: String(row.result),
    failureCode: row.failureCode == null ? null : String(row.failureCode),
    requestId: String(row.requestId),
  };
}
