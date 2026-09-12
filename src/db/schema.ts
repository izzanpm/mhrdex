import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const cardColors = pgTable("card_colors", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const cardRarities = pgTable(
  "card_rarities",
  {
    code: text("code").primaryKey(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [unique("card_rarities_sort_order_unique").on(table.sortOrder)],
);

export const cardSets = pgTable("sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  releaseDate: date("release_date"),
  description: text("description"),
});

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cardCode: text("card_code").notNull().unique(),
    name: text("name").notNull(),
    colorCode: text("color_code")
      .notNull()
      .references(() => cardColors.code),
    rarityCode: text("rarity_code")
      .notNull()
      .references(() => cardRarities.code),
    level: integer("level").notNull(),
    power: integer("power"),
    range: text("range"),
    cardType: text("card_type"),
    abilityText: text("ability_text"),
    flavorText: text("flavor_text"),
    setId: uuid("set_id").references(() => cardSets.id),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_cards_color").on(table.colorCode),
    index("idx_cards_rarity").on(table.rarityCode),
    index("idx_cards_set").on(table.setId),
    index("idx_cards_level").on(table.level),
    index("idx_cards_name").using(
      "gin",
      sql`to_tsvector('simple', ${table.name})`,
    ),
    check("cards_level_check", sql`${table.level} between 1 and 6`),
  ],
);

export const traits = pgTable("traits", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
});

export const cardTraits = pgTable(
  "card_traits",
  {
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    traitId: uuid("trait_id")
      .notNull()
      .references(() => traits.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.cardId, table.traitId] })],
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const matchLogs = pgTable(
  "match_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deckName: text("deck_name"),
    deckColor1: text("deck_color_1")
      .notNull()
      .references(() => cardColors.code),
    deckColor2: text("deck_color_2").references(() => cardColors.code),
    opponentColor1: text("opponent_color_1").references(
      () => cardColors.code,
    ),
    opponentColor2: text("opponent_color_2").references(
      () => cardColors.code,
    ),
    opponentName: text("opponent_name"),
    playerScore: integer("player_score"),
    opponentScore: integer("opponent_score"),
    turnOrder: text("turn_order"),
    matchFormat: text("match_format"),
    playedAt: timestamp("played_at", { withTimezone: true }),
    result: text("result").notNull(),
    wonDiceRoll: boolean("won_dice_roll"),
    matchDate: date("match_date").default(sql`current_date`).notNull(),
    location: text("location"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_match_logs_user").on(table.userId),
    check(
      "match_logs_deck_color_2_check",
      sql`${table.deckColor2} is null or ${table.deckColor2} <> ${table.deckColor1}`,
    ),
    check(
      "match_logs_opponent_color_2_check",
      sql`${table.opponentColor2} is null or (${table.opponentColor1} is not null and ${table.opponentColor2} <> ${table.opponentColor1})`,
    ),
    check(
      "match_logs_player_score_check",
      sql`${table.playerScore} is null or ${table.playerScore} >= 0`,
    ),
    check(
      "match_logs_opponent_score_check",
      sql`${table.opponentScore} is null or ${table.opponentScore} >= 0`,
    ),
    check(
      "match_logs_result_check",
      sql`${table.result} in ('win', 'loss', 'draw')`,
    ),
  ],
);

export const decks = pgTable(
  "decks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_decks_user").on(table.userId)],
);

export const deckColors = pgTable(
  "deck_colors",
  {
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    colorCode: text("color_code")
      .notNull()
      .references(() => cardColors.code),
  },
  (table) => [primaryKey({ columns: [table.deckId, table.colorCode] })],
);

export const deckCards = pgTable(
  "deck_cards",
  {
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id),
    quantity: integer("quantity").notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.deckId, table.cardId] }),
    check("deck_cards_quantity_check", sql`${table.quantity} between 1 and 3`),
  ],
);
