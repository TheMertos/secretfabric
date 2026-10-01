declare module "node:sqlite" {
  /** Minimal sync SQLite handle used to count rows before an import. */
  export class DatabaseSync {
    /**
     * Opens a SQLite file.
     * @param path Database path.
     * @param options Open options.
     */
    constructor(path: string, options?: { readOnly?: boolean });
    /**
     * Runs one or more SQL statements.
     * @param sql SQL text.
     */
    exec(sql: string): void;
    /**
     * Prepares a statement.
     * @param sql SQL text.
     */
    prepare(sql: string): { all(): unknown[]; get(): unknown };
    /** Closes the database. */
    close(): void;
  }
}
