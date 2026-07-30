-- CreateTable
CREATE TABLE "crm_sync_records" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'push',
    "error" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_sync_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_sync_records_orgId_provider_idx" ON "crm_sync_records"("orgId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "crm_sync_records_orgId_provider_entityType_entityId_key" ON "crm_sync_records"("orgId", "provider", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "crm_sync_records" ADD CONSTRAINT "crm_sync_records_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
