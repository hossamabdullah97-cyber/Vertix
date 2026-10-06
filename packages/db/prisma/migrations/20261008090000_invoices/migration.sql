-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "number" TEXT NOT NULL,
    "paymobTransactionId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "taxPercent" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "paymentMethod" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "billedTo" JSONB NOT NULL,
    "seller" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_paymobTransactionId_key" ON "invoices"("paymobTransactionId");

-- CreateIndex
CREATE INDEX "invoices_orgId_paidAt_idx" ON "invoices"("orgId", "paidAt");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Invoice numbers: one sequence for the platform, so a number is never given twice.
CREATE SEQUENCE "invoice_number_seq" START 1;
