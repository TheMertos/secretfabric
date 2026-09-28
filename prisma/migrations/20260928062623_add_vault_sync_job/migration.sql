-- CreateTable
CREATE TABLE "VaultSyncJob" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaultSyncJob_status_createdAt_idx" ON "VaultSyncJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VaultSyncJob_resourceId_version_key" ON "VaultSyncJob"("resourceId", "version");

-- AddForeignKey
ALTER TABLE "VaultSyncJob" ADD CONSTRAINT "VaultSyncJob_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
