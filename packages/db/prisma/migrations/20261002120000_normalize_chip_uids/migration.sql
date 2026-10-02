-- One spelling per chip serial (normalizeUid in @vertex/shared): upper-case
-- hex byte pairs joined by colons. Web NFC reports "04:a1:b2…", the mobile app
-- "04A1B2…", so the same chip could be on file twice or not be found at all.
-- A row whose normal form another row already has, or would also get, is
-- left as it is.

CREATE FUNCTION pg_temp.normal_uid(raw text) RETURNS text AS $$
  SELECT CASE
    WHEN hex ~* '^[0-9a-f]+$' AND length(hex) >= 8 AND length(hex) % 2 = 0
      THEN upper(regexp_replace(hex, '(..)(?!$)', '\1:', 'g'))
    ELSE btrim(raw)
  END
  FROM (SELECT regexp_replace(btrim(raw), '[\s:-]', '', 'g') AS hex) h
$$ LANGUAGE sql IMMUTABLE;

UPDATE "nfc_chips" c SET "uid" = pg_temp.normal_uid(c."uid")
WHERE pg_temp.normal_uid(c."uid") <> c."uid"
  AND NOT EXISTS (
    SELECT 1 FROM "nfc_chips" o
    WHERE o."id" <> c."id" AND pg_temp.normal_uid(o."uid") = pg_temp.normal_uid(c."uid")
  );

UPDATE "nfc_tags" t SET "uid" = pg_temp.normal_uid(t."uid")
WHERE pg_temp.normal_uid(t."uid") <> t."uid"
  AND NOT EXISTS (
    SELECT 1 FROM "nfc_tags" o
    WHERE o."id" <> t."id" AND pg_temp.normal_uid(o."uid") = pg_temp.normal_uid(t."uid")
  );
