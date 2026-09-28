-- CreateTable
CREATE TABLE "card_presence" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_presence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_presence_cardId_lastSeenAt_idx" ON "card_presence"("cardId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "card_presence_cardId_userId_key" ON "card_presence"("cardId", "userId");

-- AddForeignKey
ALTER TABLE "card_presence" ADD CONSTRAINT "card_presence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_presence" ADD CONSTRAINT "card_presence_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_presence" ADD CONSTRAINT "card_presence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

