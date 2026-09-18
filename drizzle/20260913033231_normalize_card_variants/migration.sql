CREATE TABLE "card_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"card_id" uuid NOT NULL,
	"rarity_code" text NOT NULL,
	"level" integer NOT NULL,
	"power" integer,
	"range" text,
	"image_url" text,
	"source_page_url" text,
	CONSTRAINT "card_variants_card_rarity_unique" UNIQUE("card_id","rarity_code"),
	CONSTRAINT "card_variants_level_check" CHECK ("level" between 1 and 6)
);
--> statement-breakpoint
ALTER TABLE "card_variants" ADD CONSTRAINT "card_variants_card_id_cards_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "card_variants" ADD CONSTRAINT "card_variants_rarity_code_card_rarities_code_fkey" FOREIGN KEY ("rarity_code") REFERENCES "card_rarities"("code");--> statement-breakpoint
INSERT INTO "card_variants" (
	"card_id",
	"rarity_code",
	"level",
	"power",
	"range",
	"image_url"
)
SELECT
	"id",
	"rarity_code",
	"level",
	"power",
	"range",
	"image_url"
FROM "cards";
--> statement-breakpoint
ALTER TABLE "cards" DROP CONSTRAINT "cards_rarity_code_card_rarities_code_fkey";--> statement-breakpoint
ALTER TABLE "cards" DROP CONSTRAINT "cards_level_check";--> statement-breakpoint
DROP INDEX "idx_cards_rarity";--> statement-breakpoint
DROP INDEX "idx_cards_level";--> statement-breakpoint
ALTER TABLE "sets" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "rarity_code";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "level";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "power";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "range";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "image_url";--> statement-breakpoint
CREATE INDEX "idx_card_variants_card" ON "card_variants" ("card_id");--> statement-breakpoint
CREATE INDEX "idx_card_variants_rarity" ON "card_variants" ("rarity_code");--> statement-breakpoint
CREATE INDEX "idx_card_variants_level" ON "card_variants" ("level");
