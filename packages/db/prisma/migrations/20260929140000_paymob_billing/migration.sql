-- DropIndex
DROP INDEX "subscriptions_stripeSubId_key";

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "stripeCustomerId",
DROP COLUMN "stripeSubId",
ADD COLUMN     "paymobSubscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_paymobSubscriptionId_key" ON "subscriptions"("paymobSubscriptionId");

