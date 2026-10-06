-- AlterTable
ALTER TABLE "lead_alert_settings" ADD COLUMN     "tips" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" TEXT;

-- CreateTable
CREATE TABLE "engagement_emails" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "engagement_emails_userId_sentAt_idx" ON "engagement_emails"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "engagement_emails_kind_sentAt_idx" ON "engagement_emails"("kind", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_emails_userId_key_key" ON "engagement_emails"("userId", "key");

