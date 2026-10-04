-- CreateEnum
CREATE TYPE "GoalMetric" AS ENUM ('LEADS', 'TAPS', 'MEETINGS', 'WON_DEALS', 'WON_VALUE');

-- CreateEnum
CREATE TYPE "GoalPeriod" AS ENUM ('WEEK', 'MONTH');

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "metric" "GoalMetric" NOT NULL,
    "period" "GoalPeriod" NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'TEAM',
    "userId" TEXT,
    "target" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_orgId_idx" ON "goals"("orgId");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

