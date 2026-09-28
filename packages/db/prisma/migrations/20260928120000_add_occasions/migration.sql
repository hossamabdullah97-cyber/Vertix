-- CreateTable
CREATE TABLE "occasions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occasions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "occasions_orgId_startsOn_idx" ON "occasions"("orgId", "startsOn");

-- AddForeignKey
ALTER TABLE "occasions" ADD CONSTRAINT "occasions_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

