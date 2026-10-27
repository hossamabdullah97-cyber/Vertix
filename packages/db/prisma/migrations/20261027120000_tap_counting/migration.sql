-- Who a browser belongs to, so a workspace's own taps are not counted.
ALTER TABLE "visitors" ADD COLUMN "userId" TEXT;
CREATE INDEX "visitors_userId_idx" ON "visitors"("userId");
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A tap by someone who had tapped the same chip before.
ALTER TABLE "events" ADD COLUMN "repeat" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "nfc_tags" ADD COLUMN "repeatTaps" INTEGER NOT NULL DEFAULT 0;

-- Taps already recorded: the first by each person on a chip stays, the rest
-- are repeats. A person is their visitor id, or else their address and
-- browser; a tap with neither stands alone.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY "tagId", COALESCE(
      "visitorId",
      CASE WHEN device->>'ip' IS NOT NULL THEN (device->>'ip') || '|' || COALESCE(device->>'userAgent', '') END,
      id
    )
    ORDER BY "createdAt", id
  ) AS n
  FROM "events"
  WHERE type = 'NFC_SCAN' AND "tagId" IS NOT NULL
)
UPDATE "events" e SET "repeat" = true FROM ranked r WHERE e.id = r.id AND r.n > 1;

-- Each chip's counts, from its taps.
UPDATE "nfc_tags" t
SET "activationCount" = s.people, "repeatTaps" = s.repeats
FROM (
  SELECT "tagId", count(*) FILTER (WHERE NOT "repeat")::int AS people, count(*) FILTER (WHERE "repeat")::int AS repeats
  FROM "events"
  WHERE type = 'NFC_SCAN' AND "tagId" IS NOT NULL
  GROUP BY "tagId"
) s
WHERE s."tagId" = t.id;
