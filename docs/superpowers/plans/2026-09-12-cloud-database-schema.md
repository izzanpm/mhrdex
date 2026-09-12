# Cloud Database Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 11-table PostgreSQL cloud schema from `ERD.MD` in Drizzle ORM and generate a seeded initial migration for a new database.

**Architecture:** `src/db/schema.ts` defines every database table and row-level constraint. Drizzle Kit generates the baseline migration, then the migration receives only the PostgreSQL-specific extension and required lookup seed statements. `schema_cloud.md` and `schema_cloud.sql` mirror the approved contract and executable baseline.

**Tech Stack:** TypeScript, Drizzle ORM 1.0.0-rc.4, Drizzle Kit 1.0.0-rc.4, PostgreSQL, Node test runner

**Spec:** `docs/superpowers/specs/2026-09-12-cloud-database-schema-design.md`

## Global Constraints

- Target a new, empty PostgreSQL database; do not create a legacy `cost` rename migration.
- Do not run a migration against `DATABASE_URL`.
- Use the exact SQL table and column names from `ERD.MD`.
- Keep aggregate deck validation in the application layer.
- Do not add Drizzle relations, repositories, queries, or new dependencies.
- Keep `ERD.MD`, `schema_cloud.md`, `schema_cloud.sql`, Drizzle schema, and migration SQL aligned.

---

### Task 1: Define And Test The Drizzle Schema

**Files:**
- Create: `src/db/schema.test.ts`
- Modify: `src/db/schema.ts`
- Modify: `package.json`

**Interfaces:**
- Produces table exports: `cardColors`, `cardRarities`, `cardSets`, `cards`, `traits`, `cardTraits`, `users`, `matchLogs`, `decks`, `deckColors`, and `deckCards`.
- Produces database names and constraints consumed by Drizzle Kit.

- [ ] **Step 1: Add the schema contract test to the test command**

Change the test script to:

```json
"test": "tsx --test architecture.test.ts src/db/schema.test.ts lib/sidebar-data.test.ts components/sidebar.test.tsx"
```

- [ ] **Step 2: Write a failing schema contract test**

Create `src/db/schema.test.ts` using `getTableName` and `getTableConfig`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  cardColors,
  cardRarities,
  cardSets,
  cards,
  cardTraits,
  deckCards,
  deckColors,
  decks,
  matchLogs,
  traits,
  users,
} from "./schema";

const tables = [
  cardColors,
  cardRarities,
  cardSets,
  cards,
  traits,
  cardTraits,
  users,
  matchLogs,
  decks,
  deckColors,
  deckCards,
];

test("defines the cloud tables from the ERD", () => {
  assert.deepEqual(tables.map(getTableName), [
    "card_colors",
    "card_rarities",
    "sets",
    "cards",
    "traits",
    "card_traits",
    "users",
    "match_logs",
    "decks",
    "deck_colors",
    "deck_cards",
  ]);
});

test("defines the required checks and indexes", () => {
  assert.deepEqual(
    getTableConfig(cards).checks.map(({ name }) => name),
    ["cards_level_check"],
  );
  assert.deepEqual(
    getTableConfig(cards).indexes.map(({ config }) => config.name),
    [
      "idx_cards_color",
      "idx_cards_rarity",
      "idx_cards_set",
      "idx_cards_level",
      "idx_cards_name",
    ],
  );
  assert.deepEqual(
    getTableConfig(matchLogs).checks.map(({ name }) => name),
    [
      "match_logs_deck_color_2_check",
      "match_logs_opponent_color_2_check",
      "match_logs_player_score_check",
      "match_logs_opponent_score_check",
      "match_logs_result_check",
    ],
  );
  assert.deepEqual(
    getTableConfig(deckCards).checks.map(({ name }) => name),
    ["deck_cards_quantity_check"],
  );
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `npm test`

Expected: FAIL because the new table exports and schema metadata do not exist.

- [ ] **Step 4: Replace the example schema with the ERD schema**

Use these Drizzle primitives:

```ts
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
```

Define exact fields and constraints:

```ts
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
```

Define the remaining tables directly:

```ts
export const cards = pgTable(
  "cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cardCode: text("card_code").notNull().unique(),
    name: text("name").notNull(),
    colorCode: text("color_code").notNull().references(() => cardColors.code),
    rarityCode: text("rarity_code").notNull().references(() => cardRarities.code),
    level: integer("level").notNull(),
    power: integer("power"),
    range: text("range"),
    cardType: text("card_type"),
    abilityText: text("ability_text"),
    flavorText: text("flavor_text"),
    setId: uuid("set_id").references(() => cardSets.id),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_cards_color").on(table.colorCode),
    index("idx_cards_rarity").on(table.rarityCode),
    index("idx_cards_set").on(table.setId),
    index("idx_cards_level").on(table.level),
    index("idx_cards_name").using("gin", sql`to_tsvector('simple', ${table.name})`),
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
    cardId: uuid("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    traitId: uuid("trait_id").notNull().references(() => traits.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.cardId, table.traitId] })],
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const matchLogs = pgTable(
  "match_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    deckName: text("deck_name"),
    deckColor1: text("deck_color_1").notNull().references(() => cardColors.code),
    deckColor2: text("deck_color_2").references(() => cardColors.code),
    opponentColor1: text("opponent_color_1").references(() => cardColors.code),
    opponentColor2: text("opponent_color_2").references(() => cardColors.code),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_match_logs_user").on(table.userId),
    check("match_logs_deck_color_2_check", sql`${table.deckColor2} is null or ${table.deckColor2} <> ${table.deckColor1}`),
    check("match_logs_opponent_color_2_check", sql`${table.opponentColor2} is null or (${table.opponentColor1} is not null and ${table.opponentColor2} <> ${table.opponentColor1})`),
    check("match_logs_player_score_check", sql`${table.playerScore} is null or ${table.playerScore} >= 0`),
    check("match_logs_opponent_score_check", sql`${table.opponentScore} is null or ${table.opponentScore} >= 0`),
    check("match_logs_result_check", sql`${table.result} in ('win', 'loss', 'draw')`),
  ],
);

export const decks = pgTable(
  "decks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_decks_user").on(table.userId)],
);

export const deckColors = pgTable(
  "deck_colors",
  {
    deckId: uuid("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
    colorCode: text("color_code").notNull().references(() => cardColors.code),
  },
  (table) => [primaryKey({ columns: [table.deckId, table.colorCode] })],
);

export const deckCards = pgTable(
  "deck_cards",
  {
    deckId: uuid("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
    cardId: uuid("card_id").notNull().references(() => cards.id),
    quantity: integer("quantity").notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.deckId, table.cardId] }),
    check("deck_cards_quantity_check", sql`${table.quantity} between 1 and 3`),
  ],
);
```

- [ ] **Step 5: Run the test and verify GREEN**

Run: `npm test`

Expected: all schema and existing tests pass.

- [ ] **Step 6: Type-check the schema**

Run: `npx tsc --noEmit`

Expected: exit code 0.

---

### Task 2: Generate And Complete The Initial Migration

**Files:**
- Create: migration SQL and snapshot files generated by Drizzle Kit under `drizzle/`
- Create or modify: Drizzle migration journal generated under `drizzle/`

**Interfaces:**
- Consumes all table exports from `src/db/schema.ts` through `drizzle.config.ts`.
- Produces a baseline migration for an empty PostgreSQL database.

- [ ] **Step 1: Generate the baseline migration**

Run:

```powershell
npx drizzle-kit generate --name=initial_cloud_schema
```

Expected: Drizzle creates one migration folder under `drizzle/` without connecting to the database.

- [ ] **Step 2: Inspect the generated SQL before editing it**

Verify that it creates all 11 tables, seven named indexes, foreign keys, composite primary keys, unique constraints, and row checks from Task 1.

- [ ] **Step 3: Add the required extension before the first table statement**

Insert:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
```

- [ ] **Step 4: Append the required lookup seeds**

Append these idempotent inserts after table and index creation:

```sql
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
```

- [ ] **Step 5: Validate migration metadata**

Run: `npx drizzle-kit check`

Expected: migration history validates successfully.

---

### Task 3: Synchronize The Cloud Contracts

**Files:**
- Create: `schema_cloud.md`
- Create: `schema_cloud.sql`
- Preserve: `ERD.MD`

**Interfaces:**
- Consumes the approved ERD and generated migration.
- Produces the named contract files required by `AGENTS.md`.

- [ ] **Step 1: Create the named Markdown contract**

Copy the approved content of `ERD.MD` into `schema_cloud.md` without changing table names, columns, constraints, indexes, seed values, or migration rules. Add one opening note stating that `ERD.MD` is retained as the original project ERD and both documents describe the same revision.

- [ ] **Step 2: Create the executable SQL reference**

Copy the completed initial migration SQL into `schema_cloud.sql`. Preserve `CREATE EXTENSION`, all schema statements, indexes, and seed inserts. Drizzle statement breakpoint comments may remain because PostgreSQL treats them as comments.

- [ ] **Step 3: Check contract names mechanically**

Search all three representations for these exact table names:

```text
card_colors card_rarities sets cards traits card_traits users match_logs decks deck_colors deck_cards
```

Expected: every name occurs in `src/db/schema.ts`, the initial migration, `schema_cloud.md`, and `schema_cloud.sql`.

---

### Task 4: Final Verification And Studio Smoke Check

**Files:**
- Verify only; no schema changes expected.

**Interfaces:**
- Consumes the completed schema, migration, and contracts.
- Produces verification evidence; does not mutate a database.

- [ ] **Step 1: Run the complete automated checks**

Run independently:

```powershell
npm test
npx tsc --noEmit
npm run lint -- --quiet
npx drizzle-kit check
git diff --check
```

Expected: every command exits successfully; line-ending warnings are informational.

- [ ] **Step 2: Inspect migration coverage**

Confirm the migration contains 11 `CREATE TABLE` statements, all named indexes, `CREATE EXTENSION IF NOT EXISTS pgcrypto`, six color values, and nine rarity values.

- [ ] **Step 3: Start Drizzle Studio only as a connectivity smoke check**

Run the user-requested command:

```powershell
npx drizzle-kit studio --port=3000
```

Expected: Studio starts if `DATABASE_URL` is reachable and port 3000 is free. Because this task does not apply the migration, Studio reflects the database currently configured in `.env`, not the generated migration files. Stop the process after recording startup success or the exact connectivity/port error.

- [ ] **Step 4: Review the final diff**

Confirm there are no changes outside the schema, migration, contract, test, and plan files. Do not commit unless the user explicitly requests it.
