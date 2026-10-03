-- Sign-up now asks the new account to confirm its email address.
ALTER TYPE "TokenType" ADD VALUE 'EMAIL_VERIFY';

-- Accounts made before that are taken as confirmed rather than suddenly
-- locked out of inviting their team or paying. Only real accounts: a
-- placeholder left by an unanswered invitation (no password, no Google)
-- confirms its address by accepting it.
UPDATE "users"
SET "emailVerified" = "createdAt"
WHERE "emailVerified" IS NULL
  AND ("passwordHash" IS NOT NULL OR "googleId" IS NOT NULL);
