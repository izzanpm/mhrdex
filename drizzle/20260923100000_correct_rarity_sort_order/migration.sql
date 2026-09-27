UPDATE "card_rarities"
SET "sort_order" = "sort_order" + 100;
--> statement-breakpoint
UPDATE "card_rarities"
SET "sort_order" = CASE "code"
  WHEN 'UR' THEN 1
  WHEN 'TR' THEN 2
  WHEN 'SR' THEN 3
  WHEN 'SEC' THEN 4
  WHEN 'R' THEN 5
  WHEN 'PR' THEN 6
  WHEN 'MR' THEN 7
  WHEN 'GR' THEN 8
  WHEN 'ER' THEN 9
END;
--> statement-breakpoint
UPDATE "card_variants"
SET "is_base" = false;
--> statement-breakpoint
UPDATE "card_variants" AS variants
SET "is_base" = true
FROM (
	SELECT DISTINCT ON (variants."card_id") variants."id"
	FROM "card_variants" AS variants
	INNER JOIN "card_rarities" AS rarities
		ON rarities."code" = variants."rarity_code"
	ORDER BY variants."card_id", rarities."sort_order", variants."id"
) AS base_variants
WHERE variants."id" = base_variants."id";
