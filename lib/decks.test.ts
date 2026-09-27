import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApplicationUserRecord,
  deleteOwnedDeck,
  normalizeDeckEntries,
  parseSaveDeckInput,
  saveOwnedDeck,
} from "./decks";

test("builds a local mapping record for an authenticated Better Auth user", () => {
  assert.deepEqual(
    buildApplicationUserRecord("auth-1", "admin@mail.com"),
    {
      betterAuthUserId: "auth-1",
      email: "admin@mail.com",
    },
  );
});

test("normalizes duplicate card entries before persistence", () => {
  assert.deepEqual(
    normalizeDeckEntries([
      { cardId: "card-1", quantity: 1 },
      { cardId: "card-1", quantity: 2 },
      { cardId: "card-2", quantity: 1 },
    ]),
    [
      { cardId: "card-1", quantity: 3 },
      { cardId: "card-2", quantity: 1 },
    ],
  );
});

test("rejects malformed save payloads before database access", () => {
  const result = parseSaveDeckInput({
    name: "Deck",
    cards: [{ cardId: "card-1", quantity: "1" }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /quantit/i);
});

test("trims a valid save payload", () => {
  assert.deepEqual(
    parseSaveDeckInput({
      name: "  Ember Avengers  ",
      cards: [{ cardId: "card-1", quantity: 2 }],
    }),
    {
      ok: true,
      value: {
        name: "Ember Avengers",
        cards: [{ cardId: "card-1", quantity: 2 }],
      },
    },
  );
});

test("rejects malformed deck IDs before database access", async () => {
  assert.deepEqual(await saveOwnedDeck("auth-1", "not-a-uuid", {}), {
    ok: false,
    code: "not_found",
    message: "That deck could not be found.",
  });
});

test("rejects malformed delete IDs before database access", async () => {
  assert.equal(await deleteOwnedDeck("auth-1", "not-a-uuid"), false);
});
