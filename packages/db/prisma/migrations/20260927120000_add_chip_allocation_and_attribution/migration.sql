-- AlterTable
ALTER TABLE "events" ADD COLUMN     "tagId" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "tagId" TEXT;

-- AlterTable
ALTER TABLE "nfc_chips" ADD COLUMN     "allocatedToOrgId" TEXT;

-- AlterTable
ALTER TABLE "nfc_tags" ADD COLUMN     "assignedUserId" TEXT;

-- CreateIndex
CREATE INDEX "events_tagId_createdAt_idx" ON "events"("tagId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_tagId_idx" ON "leads"("tagId");

-- CreateIndex
CREATE INDEX "nfc_chips_allocatedToOrgId_idx" ON "nfc_chips"("allocatedToOrgId");

-- CreateIndex
CREATE INDEX "nfc_tags_assignedUserId_idx" ON "nfc_tags"("assignedUserId");

-- AddForeignKey
ALTER TABLE "nfc_chips" ADD CONSTRAINT "nfc_chips_allocatedToOrgId_fkey" FOREIGN KEY ("allocatedToOrgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfc_tags" ADD CONSTRAINT "nfc_tags_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "nfc_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "nfc_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

