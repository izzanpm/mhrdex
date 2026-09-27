ALTER TABLE "card_variants" ADD COLUMN "is_base" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "card_variants" AS variants
SET "is_base" = true
FROM (
	SELECT DISTINCT ON (variants."card_id") variants."id"
	FROM "card_variants" AS variants
	INNER JOIN "card_rarities" AS rarities
		ON rarities."code" = variants."rarity_code"
	ORDER BY variants."card_id", rarities."sort_order"
) AS base_variants
WHERE variants."id" = base_variants."id";
