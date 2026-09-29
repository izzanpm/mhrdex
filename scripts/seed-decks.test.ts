import assert from "node:assert/strict";
import test from "node:test";

import { validateDeckContents } from "../lib/deck-validation";
import {
  buildSeedDecks,
  resolveApplicationUserLink,
  type SeedCard,
} from "./seed-decks";

const colors = ["red", "yellow", "blue", "green"];
const catalog: SeedCard[] = [
  ...Array.from({ length: 17 }, (_, index) => ({
    cardId: `simulator-${index + 1}`,
    cardCode: `BP01-${String(index + 1).padStart(3, "0")}`,
    colorCode: "red",
  })),
  ...colors.flatMap((color) =>
    Array.from({ length: 12 }, (_, index) => ({
      cardId: `${color}-${index + 1}`,
      cardCode: `${color.toUpperCase()}-${index + 1}`,
      colorCode: color,
    })),
  ),
];

test("builds three deterministic valid demo decks", () => {
  const decks = buildSeedDecks(catalog);

  assert.deepEqual(
    decks.map((deck) => deck.name),
    ["Ember Avengers", "Cosmic Tempo", "Dark Reign Control"],
  );
  assert.deepEqual(
    decks.map((deck) =>
      deck.entries.reduce((total, entry) => total + entry.quantity, 0),
    ),
    [50, 21, 14],
  );

  const emberCodes = decks[0].entries.map(
    (entry) => catalog.find((card) => card.cardId === entry.cardId)?.cardCode,
  );
  assert.equal(
    emberCodes.every((cardCode) =>
      /^BP01-(00[1-9]|01[0-7])$/.test(cardCode ?? ""),
    ),
    true,
  );

  for (const [index, deck] of decks.entries()) {
    const validation = validateDeckContents(deck.entries, catalog);
    assert.equal(validation.valid, true);
    if (validation.valid) {
      assert.equal(validation.colorCodes.length, index === 0 ? 1 : 2);
    }
  }
});

test("returns the same assignments for the same catalog", () => {
  assert.deepEqual(buildSeedDecks(catalog), buildSeedDecks(catalog));
});

test("resolves the explicit application-account mapping without auto-linking others", () => {
  assert.deepEqual(
    resolveApplicationUserLink("auth-1", "admin@mail.com", { id: "app-1" }, undefined),
    { action: "existing", id: "app-1" },
  );
  assert.deepEqual(
    resolveApplicationUserLink(
      "auth-1",
      "admin@mail.com",
      undefined,
      { id: "app-1", betterAuthUserId: null, clerkUserId: "legacy-1" },
    ),
    { action: "create" },
  );
  assert.deepEqual(
    resolveApplicationUserLink("auth-1", "admin@mail.com", undefined, undefined),
    { action: "create" },
  );
});
