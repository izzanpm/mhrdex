CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "card_colors" (
	"code" text PRIMARY KEY,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_rarities" (
	"code" text PRIMARY KEY,
	"sort_order" integer NOT NULL CONSTRAINT "card_rarities_sort_order_unique" UNIQUE
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"release_date" date,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "card_traits" (
	"card_id" uuid,
	"trait_id" uuid,
	CONSTRAINT "card_traits_pkey" PRIMARY KEY("card_id","trait_id")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"card_code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"color_code" text NOT NULL,
	"card_type" text,
	"ability_text" text,
	"flavor_text" text,
	"set_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "deck_cards" (
	"deck_id" uuid,
	"card_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "deck_cards_pkey" PRIMARY KEY("deck_id","card_id"),
	CONSTRAINT "deck_cards_quantity_check" CHECK ("quantity" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "deck_colors" (
	"deck_id" uuid,
	"color_code" text,
	CONSTRAINT "deck_colors_pkey" PRIMARY KEY("deck_id","color_code")
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"deck_name" text,
	"deck_color_1" text NOT NULL,
	"deck_color_2" text,
	"opponent_color_1" text,
	"opponent_color_2" text,
	"opponent_name" text,
	"player_score" integer,
	"opponent_score" integer,
	"turn_order" text,
	"match_format" text,
	"played_at" timestamp with time zone,
	"result" text NOT NULL,
	"won_dice_roll" boolean,
	"match_date" date DEFAULT current_date NOT NULL,
	"location" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_logs_deck_color_2_check" CHECK ("deck_color_2" is null or "deck_color_2" <> "deck_color_1"),
	CONSTRAINT "match_logs_opponent_color_2_check" CHECK ("opponent_color_2" is null or ("opponent_color_1" is not null and "opponent_color_2" <> "opponent_color_1")),
	CONSTRAINT "match_logs_player_score_check" CHECK ("player_score" is null or "player_score" >= 0),
	CONSTRAINT "match_logs_opponent_score_check" CHECK ("opponent_score" is null or "opponent_score" >= 0),
	CONSTRAINT "match_logs_result_check" CHECK ("result" in ('win', 'loss', 'draw'))
);
--> statement-breakpoint
CREATE TABLE "traits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"clerk_user_id" text NOT NULL UNIQUE,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_cards_color" ON "cards" ("color_code");--> statement-breakpoint
CREATE INDEX "idx_cards_set" ON "cards" ("set_id");--> statement-breakpoint
CREATE INDEX "idx_cards_name" ON "cards" USING gin (to_tsvector('simple', "name"));--> statement-breakpoint
CREATE INDEX "idx_card_variants_card" ON "card_variants" ("card_id");--> statement-breakpoint
CREATE INDEX "idx_card_variants_rarity" ON "card_variants" ("rarity_code");--> statement-breakpoint
CREATE INDEX "idx_card_variants_level" ON "card_variants" ("level");--> statement-breakpoint
CREATE INDEX "idx_decks_user" ON "decks" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_match_logs_user" ON "match_logs" ("user_id");--> statement-breakpoint
ALTER TABLE "card_traits" ADD CONSTRAINT "card_traits_card_id_cards_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "card_traits" ADD CONSTRAINT "card_traits_trait_id_traits_id_fkey" FOREIGN KEY ("trait_id") REFERENCES "traits"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_color_code_card_colors_code_fkey" FOREIGN KEY ("color_code") REFERENCES "card_colors"("code");--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_set_id_sets_id_fkey" FOREIGN KEY ("set_id") REFERENCES "sets"("id");--> statement-breakpoint
ALTER TABLE "card_variants" ADD CONSTRAINT "card_variants_card_id_cards_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "card_variants" ADD CONSTRAINT "card_variants_rarity_code_card_rarities_code_fkey" FOREIGN KEY ("rarity_code") REFERENCES "card_rarities"("code");--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deck_id_decks_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_card_id_cards_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id");--> statement-breakpoint
ALTER TABLE "deck_colors" ADD CONSTRAINT "deck_colors_deck_id_decks_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deck_colors" ADD CONSTRAINT "deck_colors_color_code_card_colors_code_fkey" FOREIGN KEY ("color_code") REFERENCES "card_colors"("code");--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_deck_color_1_card_colors_code_fkey" FOREIGN KEY ("deck_color_1") REFERENCES "card_colors"("code");--> statement-breakpoint
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_deck_color_2_card_colors_code_fkey" FOREIGN KEY ("deck_color_2") REFERENCES "card_colors"("code");--> statement-breakpoint
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_opponent_color_1_card_colors_code_fkey" FOREIGN KEY ("opponent_color_1") REFERENCES "card_colors"("code");--> statement-breakpoint
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_opponent_color_2_card_colors_code_fkey" FOREIGN KEY ("opponent_color_2") REFERENCES "card_colors"("code");
--> statement-breakpoint
INSERT INTO "card_colors" ("code", "name", "sort_order", "is_active") VALUES
  ('blue', 'Blue', 1, true),
  ('red', 'Red', 2, true),
  ('yellow', 'Yellow', 3, true),
  ('green', 'Green', 4, true),
  ('purple', 'Purple', 5, false),
  ('orange', 'Orange', 6, false)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "card_rarities" ("code", "sort_order") VALUES
  ('ER', 1),
  ('GR', 2),
  ('MR', 3),
  ('PR', 4),
  ('R', 5),
  ('SEC', 6),
  ('SR', 7),
  ('TR', 8),
  ('UR', 9)
ON CONFLICT ("code") DO NOTHING;
