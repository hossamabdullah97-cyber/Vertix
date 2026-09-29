-- CreateTable
CREATE TABLE "lead_alert_settings" (
    "userId" TEXT NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_alert_settings_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "lead_alert_settings" ADD CONSTRAINT "lead_alert_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
