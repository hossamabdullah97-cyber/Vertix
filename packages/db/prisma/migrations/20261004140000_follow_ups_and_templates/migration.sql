-- Follow-ups: when a lead was first and last contacted, and the reminders
-- sent while nobody had.
ALTER TABLE "leads" ADD COLUMN "firstContactedAt" TIMESTAMP(3),
ADD COLUMN "lastContactedAt" TIMESTAMP(3),
ADD COLUMN "followUpReminders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "followUpRemindedAt" TIMESTAMP(3);

CREATE INDEX "leads_firstContactedAt_createdAt_idx" ON "leads"("firstContactedAt", "createdAt");

-- A lead already called, emailed or met (as logged) counts as contacted then.
UPDATE "leads" l SET "firstContactedAt" = a.first, "lastContactedAt" = a.last
FROM (
  SELECT "leadId", min("createdAt") AS first, max("createdAt") AS last
  FROM "lead_activities"
  WHERE "type" IN ('CALL', 'EMAIL', 'MEETING')
    AND coalesce(("metadata"->>'manual')::boolean, false)
  GROUP BY "leadId"
) a
WHERE a."leadId" = l.id;

-- Reminders start with the leads that arrive from now on: the ones already
-- here are not suddenly announced as overdue all at once.
UPDATE "leads" SET "followUpReminders" = 2 WHERE "firstContactedAt" IS NULL;

ALTER TYPE "ActivityType" ADD VALUE 'WHATSAPP';

-- Ready messages.
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'EMAIL');

CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdBy" TEXT,
    "name" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_templates_orgId_idx" ON "message_templates"("orgId");

ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
