-- CreateTable
CREATE TABLE "activity_days" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "feature" TEXT NOT NULL,

    CONSTRAINT "activity_days_pkey" PRIMARY KEY ("userId","day","feature")
);

-- CreateIndex
CREATE INDEX "activity_days_day_feature_idx" ON "activity_days"("day", "feature");

