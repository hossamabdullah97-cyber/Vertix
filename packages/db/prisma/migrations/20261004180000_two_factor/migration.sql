-- Two-step verification (TOTP).
ALTER TABLE "users" ADD COLUMN "totpSecret" TEXT,
ADD COLUMN "totpPendingSecret" TEXT,
ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN "totpLastStep" INTEGER,
ADD COLUMN "totpRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
