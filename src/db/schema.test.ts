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
