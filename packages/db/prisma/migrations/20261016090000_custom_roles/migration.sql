-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "customRoleId" TEXT;

-- CreateTable
CREATE TABLE "custom_roles" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base" "Role" NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_roles_orgId_idx" ON "custom_roles"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_roles_orgId_name_key" ON "custom_roles"("orgId", "name");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

