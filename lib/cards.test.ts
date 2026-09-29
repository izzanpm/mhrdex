import assert from "node:assert/strict";
import test from "node:test";

import { adaptCloudDeck } from "@/lib/simulator/adapter";
import type { SimulatorCatalogCard } from "@/lib/simulator/types";
import { db } from "@/src/db/client";
import { cardVariants, cards as cardsTable } from "@/src/db/schema";

import { getCards } from "./cards";

const rows = [
  {
    id: "variant-1",
    cardId: "card-1",
    cardCode: "BP01-003",
    name: "Iron Man",
    cardType: "character",
    colorCode: "red",
    rarityCode: "MR",
    isBase: true,
    level: 3,
    power: 6500,
    range: 3,
    abilityText: "Deal 1 damage.",
    imageUrl: "/cards/bp01-003-mr.webp",
    setCode: "BP01",
    traitName: null,
  },
];

type FakeQuery = {
  from: (...args: unknown[]) => FakeQuery;
  innerJoin: (...args: unknown[]) => FakeQuery;
  leftJoin: (...args: unknown[]) => FakeQuery;
  orderBy: (...args: unknown[]) => Promise<typeof rows>;
};

test("returns power, numeric range, and raw ability text from catalog rows", async () => {
  let selection: Record<string, unknown> | undefined;
  const originalSelect = db.select;
  const query: FakeQuery = {
    from: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    orderBy: async () => rows,
  };

  db.select = ((...args: unknown[]) => {
    selection = args[0] as Record<string, unknown>;
    return query;
  }) as unknown as typeof db.select;

  try {
    const result = await getCards();

    assert.ok(selection);
    assert.equal(selection.power, cardVariants.power);
    assert.equal(selection.range, cardVariants.range);
    assert.equal(selection.abilityText, cardsTable.abilityText);
    assert.deepEqual(result, [
      {
        cardId: "card-1",
        cardCode: "BP01-003",
        cardType: "Character",
        colorCode: "red",
        id: "variant-1",
        imageUrl: "/cards/bp01-003-mr.webp",
        isBase: true,
        level: 3,
        name: "Iron Man",
        power: 6500,
        range: 3,
        abilityText: "Deal 1 damage.",
        rarityCode: "MR",
        setCode: "BP01",
        traitNames: [],
      },
    ]);
  } finally {
    db.select = originalSelect;
  }
});

test("normalizes imported Character rows before the simulator adapter consumes them", async () => {
  const adapterRows = Array.from({ length: 17 }, (_, index) => ({
    ...rows[0],
    id: `variant-${index + 1}`,
    cardId: `card-${index + 1}`,
    cardCode: `BP01-${String(index + 1).padStart(3, "0")}`,
    name: `Character ${index + 1}`,
    cardType: "character",
  }));
  const originalSelect = db.select;
  const query: FakeQuery = {
    from: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    orderBy: async () => adapterRows,
  };

  db.select = (() => query) as unknown as typeof db.select;

  try {
    const catalog: SimulatorCatalogCard[] = (await getCards()).map((card) => ({
      cardId: card.cardId,
      cardCode: card.cardCode,
      name: card.name,
      cardType: card.cardType,
      colorCode: card.colorCode ?? "red",
      isBase: card.isBase,
      level: card.level ?? 1,
      power: card.power,
      range: card.range,
      traitNames: card.traitNames ?? [],
      abilityText: card.abilityText,
    }));
    assert.ok(catalog.every((card) => card.cardType === "Character"));

    const result = adaptCloudDeck(
      catalog.map((card, index) => ({
        cardId: card.cardId,
        quantity: index === catalog.length - 1 ? 2 : 3,
      })),
      catalog,
      new Set(catalog.map((card) => card.cardCode)),
    );

    assert.equal(result.ok, true);
  } finally {
    db.select = originalSelect;
  }
});
