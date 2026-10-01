export type HealthBody = {
  status: "ok" | "degraded";
  service: "secretfabric";
  database: "ok" | "unavailable";
  engine?: "sqlite";
};

/**
 * Probes SQLite and returns a response that never includes the database path or error text.
 * @param probe Query that succeeds only on SQLite.
 * @returns HTTP status and JSON body.
 */
export async function readHealth(probe: () => Promise<unknown>): Promise<{ httpStatus: number; body: HealthBody }> {
  try {
    const rows = await probe();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { httpStatus: 503, body: { status: "degraded", service: "secretfabric", database: "unavailable" } };
    }
    return { httpStatus: 200, body: { status: "ok", service: "secretfabric", database: "ok", engine: "sqlite" } };
  } catch {
    return { httpStatus: 503, body: { status: "degraded", service: "secretfabric", database: "unavailable" } };
  }
}
