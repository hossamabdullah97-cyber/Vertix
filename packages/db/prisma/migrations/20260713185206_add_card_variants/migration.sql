-- AlterTable
ALTER TABLE "card_actions" ADD COLUMN     "variantId" TEXT;

-- AlterTable
ALTER TABLE "card_sections" ADD COLUMN     "variantId" TEXT;

-- CreateTable
CREATE TABLE "card_variants" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "templateId" TEXT NOT NULL,
    "theme" JSONB,
    "vcardData" JSONB,
    "accessKey" TEXT,
    "passcode" TEXT,
    "scheduleStart" TIMESTAMP(3),
    "scheduleEnd" TIMESTAMP(3),
    "manualActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "card_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_variants_cardId_idx" ON "card_variants"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "card_variants_cardId_accessKey_key" ON "card_variants"("cardId", "accessKey");

-- CreateIndex
CREATE INDEX "card_actions_variantId_idx" ON "card_actions"("variantId");

-- CreateIndex
CREATE INDEX "card_sections_variantId_idx" ON "card_sections"("variantId");

-- AddForeignKey
ALTER TABLE "card_sections" ADD CONSTRAINT "card_sections_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "card_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_actions" ADD CONSTRAINT "card_actions_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "card_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_variants" ADD CONSTRAINT "card_variants_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
