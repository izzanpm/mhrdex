import { defineRelations, sql } from "drizzle-orm";
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

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("idx_auth_session_user").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_auth_account_user").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_auth_verification_identifier").on(table.identifier),
  ],
);

export const relations = defineRelations(
  { user, session, account, verification },
  (r) => ({
    user: {
      sessions: r.many.session(),
      accounts: r.many.account(),
    },
    session: {
      user: r.one.user({
        from: r.session.userId,
        to: r.user.id,
      }),
    },
    account: {
      user: r.one.user({
        from: r.account.userId,
        to: r.user.id,
      }),
    },
  }),
);

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
    cardType: text("card_type"),
    abilityText: text("ability_text"),
    flavorText: text("flavor_text"),
    setId: uuid("set_id").references(() => cardSets.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_cards_color").on(table.colorCode),
    index("idx_cards_set").on(table.setId),
    index("idx_cards_name").using(
      "gin",
      sql`to_tsvector('simple', ${table.name})`,
    ),
  ],
);

export const cardVariants = pgTable(
  "card_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    rarityCode: text("rarity_code")
      .notNull()
      .references(() => cardRarities.code),
    isBase: boolean("is_base").notNull().default(false),
    level: integer("level").notNull(),
    power: integer("power"),
    range: text("range"),
    imageUrl: text("image_url"),
    sourcePageUrl: text("source_page_url"),
  },
  (table) => [
    unique("card_variants_card_rarity_unique").on(
      table.cardId,
      table.rarityCode,
    ),
    index("idx_card_variants_card").on(table.cardId),
    index("idx_card_variants_rarity").on(table.rarityCode),
    index("idx_card_variants_level").on(table.level),
    check("card_variants_level_check", sql`${table.level} between 1 and 6`),
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
  clerkUserId: text("clerk_user_id").unique(),
  betterAuthUserId: text("better_auth_user_id")
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
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
