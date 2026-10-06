-- CreateEnum
CREATE TYPE "SsoProvider" AS ENUM ('GOOGLE', 'MICROSOFT', 'OIDC');

-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN     "ssoOrgId" TEXT;

-- CreateTable
CREATE TABLE "sso_connections" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "SsoProvider" NOT NULL,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "testedAt" TIMESTAMP(3),
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "autoJoin" BOOLEAN NOT NULL DEFAULT true,
    "joinRole" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_domains" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_identities" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sso_connections_orgId_key" ON "sso_connections"("orgId");

-- CreateIndex
CREATE INDEX "sso_domains_domain_idx" ON "sso_domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "sso_domains_orgId_domain_key" ON "sso_domains"("orgId", "domain");

-- CreateIndex
CREATE INDEX "sso_identities_userId_idx" ON "sso_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sso_identities_connectionId_subject_key" ON "sso_identities"("connectionId", "subject");

-- AddForeignKey
ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_domains" ADD CONSTRAINT "sso_domains_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_identities" ADD CONSTRAINT "sso_identities_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "sso_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_identities" ADD CONSTRAINT "sso_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A domain is verified for one workspace at most.
CREATE UNIQUE INDEX "sso_domains_verified_domain_key" ON "sso_domains"("domain") WHERE "verifiedAt" IS NOT NULL;
