-- CreateTable
CREATE TABLE "auth_throttles" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_throttles_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "auth_throttles_windowStart_idx" ON "auth_throttles"("windowStart");

