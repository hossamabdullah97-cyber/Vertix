-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "lastVisitAt" TIMESTAMP(3),
ADD COLUMN     "returnAlertAt" TIMESTAMP(3),
ADD COLUMN     "visitorId" TEXT;

-- CreateIndex
CREATE INDEX "leads_visitorId_idx" ON "leads"("visitorId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "visitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
