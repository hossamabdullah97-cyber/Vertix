-- The Studio used to show the job title field but store it under "org", so
-- "org" is what owners last typed as their title. The title now lives under
-- "title" (and the company under "company"): move it across.
UPDATE "cards"
SET "vcardData" = ("vcardData" - 'org') || jsonb_build_object('title', "vcardData"->'org')
WHERE jsonb_typeof("vcardData") = 'object' AND "vcardData" ? 'org';

UPDATE "card_variants"
SET "vcardData" = ("vcardData" - 'org') || jsonb_build_object('title', "vcardData"->'org')
WHERE jsonb_typeof("vcardData") = 'object' AND "vcardData" ? 'org';
