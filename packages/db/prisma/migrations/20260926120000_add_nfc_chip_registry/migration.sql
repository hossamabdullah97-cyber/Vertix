-- CreateEnum
CREATE TYPE "ChipStatus" AS ENUM ('AVAILABLE', 'CLAIMED', 'BLOCKED');

-- CreateTable
CREATE TABLE "nfc_chips" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "hardwareType" "HardwareType" NOT NULL DEFAULT 'CARD',
    "batchId" TEXT,
    "status" "ChipStatus" NOT NULL DEFAULT 'AVAILABLE',
    "claimedByOrgId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "registeredById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nfc_chips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nfc_chips_uid_key" ON "nfc_chips"("uid");

-- CreateIndex
CREATE INDEX "nfc_chips_status_idx" ON "nfc_chips"("status");

-- CreateIndex
CREATE INDEX "nfc_chips_batchId_idx" ON "nfc_chips"("batchId");

-- CreateIndex
CREATE INDEX "nfc_chips_claimedByOrgId_idx" ON "nfc_chips"("claimedByOrgId");

-- AddForeignKey
ALTER TABLE "nfc_chips" ADD CONSTRAINT "nfc_chips_claimedByOrgId_fkey" FOREIGN KEY ("claimedByOrgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
