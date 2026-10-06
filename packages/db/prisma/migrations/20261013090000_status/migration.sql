-- CreateEnum
CREATE TYPE "IncidentImpact" AS ENUM ('MINOR', 'MAJOR', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('SCHEDULED', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED');

-- CreateTable
CREATE TABLE "status_components" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "detail" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_days" (
    "component" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "checks" INTEGER NOT NULL DEFAULT 0,
    "degraded" INTEGER NOT NULL DEFAULT 0,
    "down" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "status_days_pkey" PRIMARY KEY ("component","day")
);

-- CreateTable
CREATE TABLE "status_incidents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "impact" "IncidentImpact" NOT NULL,
    "status" "IncidentStatus" NOT NULL,
    "components" TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_incident_updates" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "messageAr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_incident_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "status_incidents_createdAt_idx" ON "status_incidents"("createdAt");

-- CreateIndex
CREATE INDEX "status_incident_updates_incidentId_createdAt_idx" ON "status_incident_updates"("incidentId", "createdAt");

-- AddForeignKey
ALTER TABLE "status_incident_updates" ADD CONSTRAINT "status_incident_updates_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "status_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

