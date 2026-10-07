-- Sign in with Apple
ALTER TABLE "users" ADD COLUMN "appleId" TEXT;
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");

-- Phones with the app, for push notifications
CREATE TABLE "app_push_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "app_push_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "app_push_tokens_token_key" ON "app_push_tokens"("token");
CREATE INDEX "app_push_tokens_userId_idx" ON "app_push_tokens"("userId");
ALTER TABLE "app_push_tokens" ADD CONSTRAINT "app_push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
