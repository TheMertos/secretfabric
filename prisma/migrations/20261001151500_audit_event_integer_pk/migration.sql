-- SQLite assigns rowids only for INTEGER PRIMARY KEY. BIGINT primary keys
-- stay NULL on insert and reject AuditEvent writes from the resolver.
CREATE TABLE "new_AuditEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "consumer" TEXT,
    "resourceId" TEXT,
    "operation" TEXT NOT NULL,
    "fieldPaths" JSONB,
    "result" TEXT NOT NULL,
    "failureCode" TEXT,
    "requestId" TEXT NOT NULL
);

INSERT INTO "new_AuditEvent" ("id", "timestamp", "actor", "consumer", "resourceId", "operation", "fieldPaths", "result", "failureCode", "requestId")
SELECT "id", "timestamp", "actor", "consumer", "resourceId", "operation", "fieldPaths", "result", "failureCode", "requestId" FROM "AuditEvent";

DROP TABLE "AuditEvent";

ALTER TABLE "new_AuditEvent" RENAME TO "AuditEvent";

CREATE INDEX "AuditEvent_resourceId_timestamp_idx" ON "AuditEvent"("resourceId", "timestamp");
