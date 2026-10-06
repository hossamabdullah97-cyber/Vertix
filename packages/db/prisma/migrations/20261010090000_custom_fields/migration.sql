-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX', 'URL');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "customFields" JSONB;

-- CreateTable
CREATE TABLE "custom_fields" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_fields_orgId_order_idx" ON "custom_fields"("orgId", "order");

-- AddForeignKey
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

