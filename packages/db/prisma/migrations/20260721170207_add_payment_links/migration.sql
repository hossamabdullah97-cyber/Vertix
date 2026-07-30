-- AlterTable
ALTER TABLE "events" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "payment_links" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "variantId" TEXT,
    "platform" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_links_cardId_idx" ON "payment_links"("cardId");

-- CreateIndex
CREATE INDEX "payment_links_variantId_idx" ON "payment_links"("variantId");

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "card_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
