import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { SimulatorSetup } from "../../../components/simulator-screen";
import {
  SimulatorPageContent,
  validateSimulatorDeckColorSnapshot,
} from "./page";

const user = {
  email: "player@example.com",
  image: null,
  name: "Player One",
};

const decks = [
  {
    id: "deck-ember",
    name: "Ember Avengers",
    cardCount: 50,
    colorCodes: ["red", "yellow"],
    updatedAt: "2026-09-22T12:00:00.000Z",
  },
  {
    id: "deck-cosmic",
    name: "Cosmic Tempo",
    cardCount: 50,
    colorCodes: ["blue", "purple"],
    updatedAt: "2026-09-21T12:00:00.000Z",
  },
];

const readySetup: SimulatorSetup = {
  kind: "ready",
  deck: {
    ...decks[0],
    cards: [
      {
        cardId: "card-1",
        cardCode: "BP01-001",
        name: "Fixture Character",
        colorCode: "red",
        imageUrl: "/cards/BP01-001-R.webp",
        quantity: 3,
      },
    ],
  },
  playerEntries: [{ cardId: "card-1", quantity: 50 }],
  botEntries: [{ cardId: "card-1", quantity: 50 }],
  definitions: [
    {
      cardId: "card-1",
      cardCode: "BP01-001",
      name: "Fixture Character",
      colorCode: "red",
      level: 1,
      power: 1000,
      range: 1,
      traitNames: [],
      abilityText: null,
      effectIds: [],
    },
  ],
  cards: [
    {
      id: "variant-1",
      cardId: "card-1",
      cardCode: "BP01-001",
      name: "Fixture Character",
      cardType: "Character",
      rarityCode: "R",
      isBase: true,
      imageUrl: "/cards/BP01-001-R.webp",
      power: 1000,
      range: 1,
      abilityText: null,
      colorCode: "red",
      level: 1,
      traitNames: [],
    },
  ],
};

test("requires authentication for the simulator route", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /requireAuthSession\(\s*undefined,\s*\(\) => redirect\("\/sign-in\?next=%2Fsimulator"\)/,
  );
  assert.match(source, /if \(params\.deck === undefined\)/);
  assert.match(source, /const selectedDeck = await getOwnedDeck\(session\.user\.id, params\.deck\)/);
  assert.match(source, /if \(selectedDeck === null\)/);
  assert.match(
    source,
    /validateSimulatorDeckColorSnapshot\(\s*selectedDeck\.colorCodes/,
  );
});

test("rejects corrupt persisted deck color snapshots", () => {
  const resolvedColors = ["red", "yellow", "red"];

  assert.equal(
    validateSimulatorDeckColorSnapshot(["yellow", "red"], resolvedColors),
    null,
  );

  const invalidSnapshots: unknown[] = [
    [],
    ["red", "red"],
    ["red", "yellow", "blue"],
    ["blue"],
    ["red", 7],
    null,
  ];
  const errors = invalidSnapshots.map((snapshot) =>
    validateSimulatorDeckColorSnapshot(snapshot, resolvedColors),
  );

  assert.ok(errors.every((message) => message !== null));
  assert.equal(new Set(errors).size, 1);
});

test("renders owned deck choices when no deck is selected", () => {
  const setup: SimulatorSetup = { kind: "select-deck", decks: [...decks] };
  const markup = renderToStaticMarkup(
    <SimulatorPageContent setup={setup} user={user} />,
  );

  assert.match(markup, /Choose a deck/);
  assert.match(markup, /Ember Avengers/);
  assert.match(markup, /href="\/simulator\?deck=deck-ember"/);
  assert.match(markup, /Cosmic Tempo/);
  assert.match(markup, /MHR COMPANION APP/);
});

test("renders an actionable empty state when the account has no decks", () => {
  const markup = renderToStaticMarkup(
    <SimulatorPageContent setup={{ kind: "select-deck", decks: [] }} user={user} />,
  );

  assert.match(markup, /No owned decks yet/);
  assert.match(markup, /href="\/decks\/new"/);
  assert.match(markup, /Build a deck before starting a simulation/);
});

test("renders ownership and setup errors before a game starts", () => {
  const ownershipMarkup = renderToStaticMarkup(
    <SimulatorPageContent
      setup={{
        kind: "error",
        title: "Deck unavailable",
        message: "That deck is not available for this account.",
      }}
      user={user}
    />,
  );
  const unsupportedMarkup = renderToStaticMarkup(
    <SimulatorPageContent
      setup={{
        kind: "error",
        title: "Deck cannot start",
        message: "Card BP01-099 is not supported by the simulator.",
      }}
      user={user}
    />,
  );

  assert.match(ownershipMarkup, /Deck unavailable/);
  assert.match(ownershipMarkup, /not available for this account/);
  assert.match(ownershipMarkup, /href="\/simulator"/);
  assert.match(unsupportedMarkup, /not supported by the simulator/);
  assert.doesNotMatch(unsupportedMarkup, /Start simulation/);
});

test("renders validated owned deck setup data", () => {
  const markup = renderToStaticMarkup(
    <SimulatorPageContent setup={readySetup} user={user} />,
  );

  assert.match(markup, /Ember Avengers/);
  assert.match(markup, /Ready to operate/);
  assert.match(markup, /Start simulation/);
  assert.match(markup, /50 cards/);
});

test("provides actionable loading and runtime error states", () => {
  const loadingSource = readFileSync(new URL("./loading.tsx", import.meta.url), "utf8");
  const errorSource = readFileSync(new URL("./error.tsx", import.meta.url), "utf8");

  assert.match(loadingSource, /Loading simulator setup/);
  assert.match(loadingSource, /aria-busy="true"/);
  assert.match(errorSource, /Try again/);
  assert.match(errorSource, /simulator.*load/i);
});
