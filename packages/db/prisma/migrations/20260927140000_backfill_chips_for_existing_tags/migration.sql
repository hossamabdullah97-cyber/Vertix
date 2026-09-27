-- Every NfcTag that existed before the chip registry has no chip row, so the
-- platform would not recognise hardware already in a customer's hands: the tag
-- keeps resolving, but delete it and the UID could never be registered again.
--
-- Each one is recorded as CLAIMED by, and allocated to, the workspace already
-- holding it. Allocating as well as claiming matters: a chip left unallocated
-- would return to open stock the moment its tag was deleted, and any workspace
-- knowing the UID could take it.
INSERT INTO "nfc_chips" ("id", "uid", "hardwareType", "batchId", "status",
                         "claimedByOrgId", "allocatedToOrgId", "claimedAt",
                         "note", "createdAt", "updatedAt")
SELECT
  md5(random()::text || t."id"),
  t."uid",
  t."hardwareType",
  t."batchId",
  'CLAIMED'::"ChipStatus",
  t."orgId",
  t."orgId",
  t."createdAt",
  'Backfilled from an existing tag when the chip registry was introduced.',
  t."createdAt",
  now()
FROM "nfc_tags" t
WHERE t."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "nfc_chips" c WHERE c."uid" = t."uid");

-- A tag that already names a card belongs to that card's owner. Stating the
-- holder is what per-member reporting counts by, and it cannot be inferred
-- later once a card changes hands.
UPDATE "nfc_tags" t
SET "assignedUserId" = c."ownerId"
FROM "cards" c
WHERE t."cardId" = c."id"
  AND t."assignedUserId" IS NULL
  AND t."deletedAt" IS NULL;
