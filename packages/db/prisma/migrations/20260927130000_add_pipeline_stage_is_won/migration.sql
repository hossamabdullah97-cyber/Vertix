-- AlterTable
ALTER TABLE "pipeline_stages" ADD COLUMN     "isWon" BOOLEAN NOT NULL DEFAULT false;


-- Backfill: every existing workspace records a win through a stage it named
-- "Won". Matching that name once, here, is what makes the flag true for stock
-- pipelines; from now on the flag is what reporting reads, not the name.
UPDATE "pipeline_stages" SET "isWon" = true WHERE lower("name") = 'won';
