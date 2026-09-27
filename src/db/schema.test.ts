import assert from "node:assert/strict";
import test from "node:test";

import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  account,
  cardColors,
  cardRarities,
  cardSets,
  cards,
  cardTraits,
  cardVariants,
  deckCards,
  deckColors,
  decks,
  matchLogs,
  relations,
  session,
  traits,
  user,
  users,
  verification,
} from "./schema";

const tables = [
  user,
  session,
  account,
  verification,
  cardColors,
  cardRarities,
  cardSets,
  cards,
  cardVariants,
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
    "user",
    "session",
    "account",
    "verification",
    "card_colors",
    "card_rarities",
    "sets",
    "cards",
    "card_variants",
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
  const variantsConfig = getTableConfig(cardVariants);

  assert.equal(
    getTableConfig(cardSets).columns.some((column) => column.name === "name"),
    false,
  );
  for (const columnName of [
    "rarity_code",
    "level",
    "power",
    "range",
    "image_url",
  ]) {
    assert.equal(
      getTableConfig(cards).columns.some(
        (column) => column.name === columnName,
      ),
      false,
    );
  }
  assert.deepEqual(
    getTableConfig(cards).checks.map(({ name }) => name),
    [],
  );
  assert.deepEqual(
    getTableConfig(cards).indexes.map(({ config }) => config.name),
    [
      "idx_cards_color",
      "idx_cards_set",
      "idx_cards_name",
    ],
  );
  assert.deepEqual(
    variantsConfig.columns.map((column) => column.name),
    [
      "id",
      "card_id",
      "rarity_code",
      "is_base",
      "level",
      "power",
      "range",
      "image_url",
      "source_page_url",
    ],
  );
  const baseColumn = variantsConfig.columns.find(
    (column) => column.name === "is_base",
  );
  assert.ok(baseColumn);
  assert.equal(baseColumn.notNull, true);
  assert.equal(baseColumn.hasDefault, true);
  assert.ok(
    variantsConfig.uniqueConstraints.some(
      (constraint) =>
        constraint.name === "card_variants_card_rarity_unique",
    ),
  );
  assert.ok(
    variantsConfig.checks.some(
      (constraint) => constraint.name === "card_variants_level_check",
    ),
  );
  assert.deepEqual(
    variantsConfig.indexes.map((index) => index.config.name).sort(),
    [
      "idx_card_variants_card",
      "idx_card_variants_level",
      "idx_card_variants_rarity",
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

test("defines the Better Auth tables and application identity mapping", () => {
  assert.deepEqual(getTableConfig(user).columns.map(({ name }) => name), [
    "id",
    "name",
    "email",
    "email_verified",
    "image",
    "created_at",
    "updated_at",
  ]);
  assert.ok(
    getTableConfig(session).indexes.some(
      ({ config }) => config.name === "idx_auth_session_user",
    ),
  );
  assert.ok(
    getTableConfig(account).indexes.some(
      ({ config }) => config.name === "idx_auth_account_user",
    ),
  );
  assert.ok(
    getTableConfig(verification).indexes.some(
      ({ config }) => config.name === "idx_auth_verification_identifier",
    ),
  );
  assert.deepEqual(
    getTableConfig(users).columns.map(({ name }) => name),
    ["id", "clerk_user_id", "better_auth_user_id", "email", "created_at"],
  );

  for (const table of [session, account]) {
    assert.ok(
      getTableConfig(table).foreignKeys.some(({ reference }) => {
        const { columns, foreignColumns, foreignTable } = reference();
        return (
          getTableName(foreignTable) === "user" &&
          columns.map(({ name }) => name).join(",") === "user_id" &&
          foreignColumns.map(({ name }) => name).join(",") === "id"
        );
      }),
    );
  }

  assert.ok(
    getTableConfig(users).foreignKeys.some(({ reference }) => {
      const { columns, foreignColumns, foreignTable } = reference();
      return (
        getTableName(foreignTable) === "user" &&
        columns.map(({ name }) => name).join(",") === "better_auth_user_id" &&
        foreignColumns.map(({ name }) => name).join(",") === "id"
      );
    }),
  );

  for (const columnName of ["clerk_user_id", "better_auth_user_id"]) {
    assert.equal(
      getTableConfig(users).columns.find(({ name }) => name === columnName)
        ?.notNull,
      false,
    );
  }
});

test("defines the Better Auth Relations v2 mapping", () => {
  assert.deepEqual(Object.keys(relations), [
    "user",
    "session",
    "account",
    "verification",
  ]);
  assert.deepEqual(Object.keys(relations.user.relations), [
    "sessions",
    "accounts",
  ]);
  assert.deepEqual(Object.keys(relations.session.relations), ["user"]);
  assert.deepEqual(Object.keys(relations.account.relations), ["user"]);
  assert.deepEqual(Object.keys(relations.verification.relations), []);
});
