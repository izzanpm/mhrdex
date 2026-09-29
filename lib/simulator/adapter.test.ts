import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptBotDeck,
  adaptCloudDeck,
  createRuntimeRushPointDeck,
} from "./adapter";
import type {
  SimulatorBotDeckEntry,
  SimulatorCatalogCard,
  SimulatorDeckEntry,
} from "./types";

const catalog: SimulatorCatalogCard[] = Array.from(
  { length: 19 },
  (_, index) => ({
    cardId: `card-${index + 1}`,
    cardCode: `BP01-${String(index + 1).padStart(3, "0")}`,
    name: `Character ${index + 1}`,
    cardType: "Character",
    colorCode: index < 16 ? "red" : index === 16 ? "yellow" : "blue",
    isBase: true,
    level: (index % 6) + 1,
    power: 1000 + index,
    range: (index % 4) + 1,
    traitNames: [],
    abilityText: null,
  }),
);

const supportedCardCodes = new Set(
  catalog.slice(0, 18).map((card) => card.cardCode),
);

const validEntries: SimulatorDeckEntry[] = [
  ...catalog.slice(0, 16).map((card) => ({ cardId: card.cardId, quantity: 3 })),
  { cardId: catalog[16].cardId, quantity: 2 },
];

function assertError(
  result: ReturnType<typeof adaptCloudDeck>,
  code: string,
  cardCode?: string,
) {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected an adapter error");
  assert.equal(result.code, code);
  if (cardCode !== undefined) assert.equal(result.cardCode, cardCode);
}

function withCatalogCard(
  cardId: string,
  changes: Partial<SimulatorCatalogCard>,
) {
  return catalog.map((card) =>
    card.cardId === cardId ? { ...card, ...changes } : card,
  );
}

test("accepts a valid 50-card cloud deck", () => {
  const result = adaptCloudDeck(
    validEntries,
    catalog,
    supportedCardCodes,
  );

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.entries, validEntries);
});

test("rejects a cloud deck whose total is not exactly 50", () => {
  const result = adaptCloudDeck(
    validEntries.map((entry, index) =>
      index === validEntries.length - 1
        ? { ...entry, quantity: entry.quantity - 1 }
        : entry,
    ),
    catalog,
    supportedCardCodes,
  );

  assertError(result, "invalid-deck-size");
});

test("rejects a fourth copy by card code", () => {
  const result = adaptCloudDeck(
    [
      { cardId: catalog[0].cardId, quantity: 4 },
      { cardId: catalog[1].cardId, quantity: 3 },
    ],
    catalog,
    supportedCardCodes,
  );

  assertError(result, "invalid-copy-count", catalog[0].cardCode);
});

test("returns the actual over-limit card when card codes overlap", () => {
  const overlappingCatalog: SimulatorCatalogCard[] = [
    { ...catalog[0], cardId: "overlap-short", cardCode: "BP01-01" },
    { ...catalog[1], cardId: "overlap-long", cardCode: "BP01-010" },
  ];
  const supportedCodes = new Set(
    overlappingCatalog.map((card) => card.cardCode),
  );

  const result = adaptCloudDeck(
    [
      { cardId: "overlap-short", quantity: 1 },
      { cardId: "overlap-long", quantity: 4 },
    ],
    overlappingCatalog,
    supportedCodes,
  );

  assertError(result, "invalid-copy-count", "BP01-010");
});

test("rejects a third card color", () => {
  const result = adaptCloudDeck(
    [
      ...catalog
        .slice(0, 16)
        .map((card) => ({ cardId: card.cardId, quantity: 3 })),
      { cardId: catalog[16].cardId, quantity: 1 },
      { cardId: catalog[17].cardId, quantity: 1 },
    ],
    catalog,
    supportedCardCodes,
  );

  assertError(result, "invalid-color-count");
});

test("rejects a missing catalog card", () => {
  const result = adaptCloudDeck(
    [{ cardId: "missing-card", quantity: 50 }],
    catalog,
    supportedCardCodes,
  );

  assertError(result, "missing-card");
});

test("rejects an unsupported card before setup", () => {
  const unsupportedCard = catalog[18];
  const result = adaptCloudDeck(
    [{ cardId: unsupportedCard.cardId, quantity: 1 }],
    catalog,
    supportedCardCodes,
  );

  assertError(result, "unsupported-card", unsupportedCard.cardCode);
});

test("rejects a simulator card without Power", () => {
  const card = catalog[0];
  const result = adaptCloudDeck(
    [{ cardId: card.cardId, quantity: 1 }],
    withCatalogCard(card.cardId, { power: null }),
    supportedCardCodes,
  );

  assertError(result, "missing-power", card.cardCode);
});

test("rejects a simulator card without Range", () => {
  const card = catalog[0];
  const result = adaptCloudDeck(
    [{ cardId: card.cardId, quantity: 1 }],
    withCatalogCard(card.cardId, { range: null }),
    supportedCardCodes,
  );

  assertError(result, "missing-range", card.cardCode);
});

test("adapts bot entries by card code to base card IDs", () => {
  const botEntries: SimulatorBotDeckEntry[] = validEntries.map((entry) => ({
    cardCode: catalog.find((card) => card.cardId === entry.cardId)!.cardCode,
    quantity: entry.quantity,
  }));

  const result = adaptBotDeck(botEntries, catalog, supportedCardCodes);

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.entries, validEntries);
});

test("creates nine runtime Rush Points without catalog rows", () => {
  const points = createRuntimeRushPointDeck("player");

  assert.equal(points.length, 9);
  assert.equal(new Set(points.map((point) => point.instanceId)).size, 9);
  assert.ok(points.every((point) => point.zone === "rushPointDeck"));
  assert.ok(points.every((point) => point.ownerId === "player"));
});
