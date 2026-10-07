-- Signing in to the phone app through the website
CREATE TABLE "app_sign_in_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "ssoOrgId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_sign_in_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "app_sign_in_codes_codeHash_key" ON "app_sign_in_codes"("codeHash");
CREATE INDEX "app_sign_in_codes_expiresAt_idx" ON "app_sign_in_codes"("expiresAt");
ALTER TABLE "app_sign_in_codes" ADD CONSTRAINT "app_sign_in_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
