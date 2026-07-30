-- CreateTable
CREATE TABLE "integration_oauth_apps" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "integration_oauth_apps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_oauth_apps_orgId_idx" ON "integration_oauth_apps"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_oauth_apps_orgId_provider_key" ON "integration_oauth_apps"("orgId", "provider");

-- AddForeignKey
ALTER TABLE "integration_oauth_apps" ADD CONSTRAINT "integration_oauth_apps_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
