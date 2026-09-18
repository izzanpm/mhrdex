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
  cardVariants,
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
      "level",
      "power",
      "range",
      "image_url",
      "source_page_url",
    ],
  );
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
