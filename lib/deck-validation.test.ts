import assert from "node:assert/strict";
import test from "node:test";

import {
  canAddDeckCard,
  getAllowedColorCodes,
  getCardAddBlockReason,
  getDraftColorCodes,
  validateDeckContents,
  type DeckCatalogCard,
  type DeckCardDraft,
} from "./deck-validation";

const catalog: DeckCatalogCard[] = [
  { cardId: "red-1", cardCode: "R-001", colorCode: "red" },
  { cardId: "red-2", cardCode: "R-002", colorCode: "red" },
  { cardId: "blue-1", cardCode: "B-001", colorCode: "blue" },
  { cardId: "green-1", cardCode: "G-001", colorCode: "green" },
];

test("accepts a valid empty draft and one-color deck", () => {
  assert.deepEqual(validateDeckContents([], catalog), {
    valid: true,
    total: 0,
    colorCodes: [],
  });
  assert.deepEqual(
    validateDeckContents([{ cardId: "red-1", quantity: 3 }], catalog),
    {
      valid: true,
      total: 3,
      colorCodes: ["red"],
    },
  );
});

test("rejects more than 50 cards", () => {
  const result = validateDeckContents(
    [{ cardId: "red-1", quantity: 51 }],
    catalog,
  );

  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, "max_cards");
});

test("rejects a fourth copy of one card code", () => {
  const result = validateDeckContents(
    [
      { cardId: "red-1", quantity: 3 },
      { cardId: "red-1", quantity: 1 },
    ],
    catalog,
  );

  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, "max_copies");
});

test("rejects a third distinct color", () => {
  const result = validateDeckContents(
    [
      { cardId: "red-1", quantity: 1 },
      { cardId: "blue-1", quantity: 1 },
      { cardId: "green-1", quantity: 1 },
    ],
    catalog,
  );

  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, "max_colors");
});

test("rejects unknown cards and invalid quantities", () => {
  const unknownCard = validateDeckContents(
    [{ cardId: "missing", quantity: 1 }],
    catalog,
  );
  const invalidQuantity = validateDeckContents(
    [{ cardId: "red-1", quantity: 0 }],
    catalog,
  );

  assert.equal(unknownCard.valid, false);
  if (!unknownCard.valid) assert.equal(unknownCard.code, "unknown_card");
  assert.equal(invalidQuantity.valid, false);
  if (!invalidQuantity.valid) assert.equal(invalidQuantity.code, "invalid_quantity");
});

test("limits add operations before a third color, fourth copy, or 51st card", () => {
  const twoColors: DeckCardDraft[] = [
    { cardId: "red-1", quantity: 1 },
    { cardId: "blue-1", quantity: 1 },
  ];
  const threeCopies: DeckCardDraft[] = [
    { cardId: "red-1", quantity: 3 },
  ];
  const fiftyCards: DeckCardDraft[] = [{ cardId: "red-1", quantity: 3 }];

  assert.equal(
    getCardAddBlockReason(
      { cardId: "green-1", quantity: 1 },
      twoColors,
      catalog,
    ),
    "max_colors",
  );
  assert.equal(
    getCardAddBlockReason(
      { cardId: "red-1", quantity: 1 },
      threeCopies,
      catalog,
    ),
    "max_copies",
  );
  fiftyCards[0].quantity = 50;
  assert.equal(
    getCardAddBlockReason(
      { cardId: "red-2", quantity: 1 },
      fiftyCards,
      catalog,
    ),
    "max_cards",
  );
  assert.equal(canAddDeckCard({ cardId: "green-1", quantity: 1 }, twoColors, catalog), false);
});

test("reopens a color after its last selected card is removed", () => {
  const entries: DeckCardDraft[] = [
    { cardId: "red-1", quantity: 1 },
    { cardId: "blue-1", quantity: 1 },
  ];

  assert.deepEqual(getDraftColorCodes(entries, catalog), ["red", "blue"]);
  entries.splice(1, 1);
  assert.deepEqual(getDraftColorCodes(entries, catalog), ["red"]);
  assert.deepEqual(
    getAllowedColorCodes(entries, catalog, ["red", "blue", "green"]),
    ["red", "blue", "green"],
  );
});
