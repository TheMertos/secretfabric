-- SQLite baseline. UUIDs are TEXT, encrypted payloads are BLOB, JSON stays JSON text,
-- and AuditEvent.id remains an autoincrementing integer primary key.
-- Principal scoping uses BotIdentity.externalSubject and AccountMembership.subject.
-- Map each Hermes profile principal to an account via BotIdentity.

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BotIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalSubject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BotIdentity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountMembership" (
    "accountId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("accountId", "subject"),
    CONSTRAINT "AccountMembership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metadata" JSONB,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Resource_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResourceVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "encryptedPayload" BLOB NOT NULL,
    "payloadNonce" BLOB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResourceVersion_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResourceShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "targetAccountId" TEXT,
    "targetBotId" TEXT,
    "role" TEXT NOT NULL,
    "allowedOperations" JSONB NOT NULL,
    "allowedPaths" JSONB,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResourceShare_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Claim_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VaultSyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "vaultItemId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VaultSyncJob_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGINT NOT NULL PRIMARY KEY,
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

-- CreateIndex
CREATE UNIQUE INDEX "Account_slug_key" ON "Account"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "BotIdentity_externalSubject_key" ON "BotIdentity"("externalSubject");

-- CreateIndex
CREATE INDEX "Resource_accountId_resourceType_idx" ON "Resource"("accountId", "resourceType");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_accountId_name_key" ON "Resource"("accountId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceVersion_resourceId_version_key" ON "ResourceVersion"("resourceId", "version");

-- CreateIndex
CREATE INDEX "ResourceShare_targetAccountId_targetBotId_idx" ON "ResourceShare"("targetAccountId", "targetBotId");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_tokenHash_key" ON "Claim"("tokenHash");

-- CreateIndex
CREATE INDEX "VaultSyncJob_status_createdAt_idx" ON "VaultSyncJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VaultSyncJob_resourceId_version_key" ON "VaultSyncJob"("resourceId", "version");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceId_timestamp_idx" ON "AuditEvent"("resourceId", "timestamp");
