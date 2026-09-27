-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotIdentity" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "externalSubject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMembership" (
    "accountId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountMembership_pkey" PRIMARY KEY ("accountId","subject")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "resourceType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceVersion" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "encryptedPayload" BYTEA NOT NULL,
    "payloadNonce" BYTEA NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceShare" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "sourceAccountId" UUID NOT NULL,
    "targetAccountId" UUID,
    "targetBotId" UUID,
    "role" TEXT NOT NULL,
    "allowedOperations" JSONB NOT NULL,
    "allowedPaths" JSONB,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "consumer" TEXT,
    "resourceId" UUID,
    "operation" TEXT NOT NULL,
    "fieldPaths" JSONB,
    "result" TEXT NOT NULL,
    "failureCode" TEXT,
    "requestId" UUID NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "AuditEvent_resourceId_timestamp_idx" ON "AuditEvent"("resourceId", "timestamp");

-- AddForeignKey
ALTER TABLE "BotIdentity" ADD CONSTRAINT "BotIdentity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMembership" ADD CONSTRAINT "AccountMembership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceVersion" ADD CONSTRAINT "ResourceVersion_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceShare" ADD CONSTRAINT "ResourceShare_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
