import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";

import { DeckListScreen } from "../../../components/deck-list-screen";
import { DeckBuilderScreen } from "../../../components/deck-builder-screen";

import { DecksPageContent } from "./page";
import { filterDeckSummaries } from "../../../lib/deck-list";
import type { DeckDetail, DeckSummary } from "../../../types/deck";

const user = {
  email: "player@example.com",
  image: null,
  name: "Player One",
};

const deckSummaries: DeckSummary[] = [
  {
    id: "deck-ember",
    name: "Ember Avengers",
    cardCount: 37,
    colorCodes: ["red", "yellow"],
    updatedAt: "2026-09-22T12:00:00.000Z",
  },
  {
    id: "deck-cosmic",
    name: "Cosmic Tempo",
    cardCount: 21,
    colorCodes: ["blue", "purple"],
    updatedAt: "2026-09-21T12:00:00.000Z",
  },
  {
    id: "deck-dark",
    name: "Dark Reign Control",
    cardCount: 14,
    colorCodes: ["green", "orange"],
    updatedAt: "2026-09-20T12:00:00.000Z",
  },
];

const selectedDeck: DeckDetail = {
  ...deckSummaries[0],
  cards: [
    {
      cardId: "card-1",
      cardCode: "MHR-001",
      name: "Iron Man",
      colorCode: "red",
      imageUrl: "/cards/MHR-001-MR.webp",
      quantity: 3,
    },
  ],
};

const builderCards = [
  {
    id: "variant-mr",
    cardId: "card-mhr-001",
    cardCode: "MHR-001",
    name: "Iron Man",
      cardType: "Hero",
      rarityCode: "MR",
      isBase: true,
      colorCode: "red",
      imageUrl: "/cards/MHR-001-MR.webp",
      traitNames: ["Avenger", "Tech"],
      power: null,
      range: null,
      abilityText: null,
  },
  {
    id: "variant-ur",
    cardId: "card-mhr-002",
    cardCode: "MHR-002",
    name: "Captain Marvel",
      cardType: "Hero",
      rarityCode: "UR",
      isBase: false,
      colorCode: "blue",
      imageUrl: "/cards/MHR-002-UR.webp",
      traitNames: ["Avenger", "Pilot"],
      power: null,
      range: null,
      abilityText: null,
  },
];

const editorDeck: DeckDetail = {
  ...deckSummaries[0],
  cardCount: 2,
  colorCodes: ["red"],
  cards: [
    {
      cardId: "card-mhr-001",
      cardCode: "MHR-001",
      name: "Iron Man",
      colorCode: "red",
      imageUrl: "/cards/MHR-001-MR.webp",
      quantity: 2,
    },
  ],
};

test("shows the base-only toggle and enables it by default in deck search", () => {
  const source = readFileSync(
    new URL("../../../components/deck-builder-card-search.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /showBaseFilter=\{true\}/);
  assert.match(source, /baseOnly: true/);
});

test("hides search card controls until hover unless the card is in the deck", () => {
  const source = readFileSync(
    new URL("../../../components/deck-builder-card-search.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const showControls = quantity > 0/);
  assert.match(source, /opacity-0 group-hover:opacity-100 group-focus-within:opacity-100/);
  assert.match(source, /showControls\s*\?\s*"pointer-events-auto opacity-100"/);
});

test("separates the deck progress bar from the detail header", () => {
  const source = readFileSync(
    new URL("../../../components/deck-list-screen.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /border-b border-app-border-soft pb-6/);
  assert.match(source, /className="mt-4">\s*<div className="h-1\.5/);
});

test("keeps card codes close to their artwork", () => {
  const source = readFileSync(
    new URL("../../../components/deck-list-screen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /className="mt-1 font-mono text-\[9px\] text-app-text-dim/);
  assert.doesNotMatch(source, /className="mt-3 font-mono text-\[9px\] text-app-text-dim/);
});

test("confirms deck deletion in a dialog before submitting", () => {
  const source = readFileSync(
    new URL("../../../components/delete-deck-button.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(source, /@\/components\/ui\/dialog/);
  assert.match(source, /Delete deck\?/);
  assert.match(source, /requestSubmit/);
});

test("renders the authenticated decks shell", () => {
  const markup = renderToStaticMarkup(
    <DecksPageContent
      user={user}
      decks={deckSummaries}
      selectedDeck={selectedDeck}
    />,
  );

  assert.match(markup, /<p[^>]*>Decks<\/p>/);
  assert.match(markup, /<h1[^>]*>Deck List<\/h1>/);
  assert.match(markup, /data-slot="avatar"/);
  assert.match(markup, /href="\/decks"/);
  assert.match(markup, /Ember Avengers/);
  assert.match(markup, /href="\/decks\?deck=deck-cosmic"/);
  assert.match(markup, /MHR COMPANION APP/);
});

test("filters deck summaries by name without changing the source list", () => {
  assert.deepEqual(filterDeckSummaries(deckSummaries, " cosmic "), [deckSummaries[1]]);
  assert.deepEqual(filterDeckSummaries(deckSummaries, ""), deckSummaries);
});

test("renders the empty decks state with a real create action", () => {
  const markup = renderToStaticMarkup(
    <DeckListScreen user={user} decks={[]} selectedDeck={null} />,
  );

  assert.match(markup, /No deck yet/);
  assert.match(markup, /Create your first deck to start building your collection\./);
  assert.match(markup, /New deck/);
  assert.match(markup, /max-w-\[410px\]/);
  assert.match(markup, /bg-app-accent/);
  assert.match(markup, /data-deck-create/);
});

test("renders the populated deck detail and edit destination", () => {
  const markup = renderToStaticMarkup(
    <DeckListScreen
      cards={builderCards}
      user={user}
      decks={deckSummaries}
      selectedDeck={selectedDeck}
    />,
  );

  assert.match(markup, /Cosmic Tempo/);
  assert.match(markup, /Dark Reign Control/);
  assert.match(markup, /37/);
  assert.match(markup, /50/);
  assert.match(markup, /Iron Man/);
  assert.match(markup, /href="\/decks\/deck-ember\/edit"/);
  assert.match(markup, /aria-current="page"/);
  assert.match(markup, /Red · Yellow/);
  assert.doesNotMatch(markup, />Selected deck<\/p>/);
  assert.match(markup, /Open details for Iron Man, MHR-001, MR/);
  assert.match(markup, /aria-label="Deck traits"/);
  assert.match(markup, /data-slot="badge"[^>]*>Avenger<\/span>/);
  assert.match(markup, /data-slot="badge"[^>]*>Tech<\/span>/);
  assert.doesNotMatch(markup, /<p[^>]*>Iron Man<\/p>/);
  assert.match(markup, /<p[^>]*>MHR-001<\/p>/);
  assert.match(markup, /aria-label="Delete deck"/);
  assert.match(markup, /aria-label="Edit deck"/);
  assert.match(markup, /lucide-trash-2/);
  assert.match(markup, /lucide-pencil/);
  assert.match(
    markup,
    /grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5/,
  );
  assert.doesNotMatch(markup, />Edit deck<\/a>/);
});

test("renders unique traits beneath the card counter in both deck views", () => {
  const selectedDeckWithTraits: DeckDetail = {
    ...selectedDeck,
    cards: [
      ...selectedDeck.cards,
      {
        cardId: "card-mhr-002",
        cardCode: "MHR-002",
        name: "Captain Marvel",
        colorCode: "blue",
        imageUrl: "/cards/MHR-002-UR.webp",
        quantity: 1,
      },
    ],
  };
  const listMarkup = renderToStaticMarkup(
    <DeckListScreen
      cards={builderCards}
      user={user}
      decks={deckSummaries}
      selectedDeck={selectedDeckWithTraits}
    />,
  );
  const listCounterPosition = listMarkup.indexOf("37 / 50 cards");
  const listTraitsPosition = listMarkup.indexOf('aria-label="Deck traits"');

  assert.ok(listTraitsPosition > listCounterPosition);
  for (const traitName of ["Avenger", "Pilot", "Tech"]) {
    assert.equal(
      (listMarkup.match(new RegExp(`data-slot="badge"[^>]*>${traitName}<\\/span>`, "g")) ?? [])
        .length,
      1,
    );
  }

  const editorMarkup = renderToStaticMarkup(
    <DeckBuilderScreen
      cards={builderCards}
      deck={{
        ...editorDeck,
        cardCount: 2,
        colorCodes: ["red", "blue"],
        cards: [
          { ...editorDeck.cards[0], quantity: 1 },
          {
            cardId: "card-mhr-002",
            cardCode: "MHR-002",
            name: "Captain Marvel",
            colorCode: "blue",
            imageUrl: "/cards/MHR-002-UR.webp",
            quantity: 1,
          },
        ],
      }}
      user={user}
    />,
  );
  const editorCounterPosition = editorMarkup.indexOf("2 / 50 cards");
  const editorTraitsPosition = editorMarkup.indexOf('aria-label="Deck traits"');

  assert.ok(editorTraitsPosition > editorCounterPosition);
  for (const traitName of ["Avenger", "Pilot", "Tech"]) {
    assert.equal(
      (editorMarkup.match(new RegExp(`data-slot="badge"[^>]*>${traitName}<\\/span>`, "g")) ?? [])
        .length,
      1,
    );
  }
});

test("puts deck search before the new deck action and shows capacity progress", () => {
  const markup = renderToStaticMarkup(
    <DeckListScreen
      user={user}
      decks={deckSummaries}
      selectedDeck={selectedDeck}
    />,
  );
  const searchPosition = markup.indexOf('aria-label="Deck search"');
  const newDeckPosition = markup.indexOf("New deck");

  assert.ok(searchPosition >= 0);
  assert.ok(newDeckPosition > searchPosition);
  assert.match(markup, /data-deck-search-field/);
  assert.match(markup, /data-deck-search-icon/);
  assert.match(markup, /data-deck-progress="37"/);
  assert.match(markup, /data-deck-progress="21"/);
});

test("provides deck-specific loading and error states", () => {
  const loadingPath = fileURLToPath(new URL("./loading.tsx", import.meta.url));
  const errorPath = fileURLToPath(new URL("./error.tsx", import.meta.url));

  assert.equal(existsSync(loadingPath), true);
  assert.equal(existsSync(errorPath), true);
  assert.match(readFileSync(loadingPath, "utf8"), /Loading deck list/);
  assert.match(readFileSync(errorPath, "utf8"), /Try again/);
});

test("provides the deck builder design route", () => {
  const legacyRoutePath = fileURLToPath(new URL("./new/page.tsx", import.meta.url));
  const editRoutePath = fileURLToPath(
    new URL("./[deckId]/edit/page.tsx", import.meta.url),
  );

  assert.equal(existsSync(legacyRoutePath), true);
  assert.equal(existsSync(editRoutePath), true);
  if (!existsSync(legacyRoutePath) || !existsSync(editRoutePath)) return;

  const screenPath = fileURLToPath(
    new URL("../../../components/deck-builder-screen.tsx", import.meta.url),
  );
  const searchPath = fileURLToPath(
    new URL("../../../components/deck-builder-card-search.tsx", import.meta.url),
  );
  const source = [legacyRoutePath, editRoutePath, screenPath, searchPath]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  assert.match(source, /redirect\("\/decks"\)/);
  assert.match(source, /getOwnedDeck/);
  assert.match(source, /getCards/);
  assert.match(source, /cards = await getCards\(\)/);
  assert.match(source, /Decks \/ Edit/);
  assert.match(source, /Edit deck/);
  assert.match(source, /Search cards by name\.\.\./);
  assert.match(source, /Save changes/);
  assert.doesNotMatch(source, /Selected deck/);
  assert.doesNotMatch(source, /w-28/);
  assert.match(source, /aria-label=\{isPending \? "Saving changes" : "Save changes"\}/);
  assert.match(source, /size-11 shrink-0/);
  assert.match(source, /h-\[52px\] w-\[52px\]/);
  assert.match(source, /getAllowedColorCodes/);
  assert.match(source, /getCardAddBlockReason/);
  assert.match(source, /disabled=/);
  assert.match(source, /grid-cols-3 gap-1/);
  assert.doesNotMatch(source, /sm:grid-cols-4/);
  assert.match(source, /onChange=\{\(event\) => setQuery\(event\.target\.value\)\}/);
  assert.match(source, /filterCards\(cards, deferredQuery, activeFilters\)/);
  assert.match(source, /onApply=\{setActiveFilters\}/);
  assert.match(source, /iconOnly/);
  assert.match(source, /className="relative block min-w-0 flex-1"/);

  const markup = renderToStaticMarkup(
    <DeckBuilderScreen
      cards={builderCards}
      deck={editorDeck}
      user={user}
    />,
  );

  assert.match(markup, /aria-label="Card search"/);
  assert.match(markup, /placeholder="Search cards by name\.\.\."/);
   assert.match(markup, /1 results/);
  assert.match(markup, /aria-label="Iron Man, MHR-001, MR"/);
  assert.match(markup, /aria-label="Deck traits"/);
  assert.match(markup, /data-slot="badge"[^>]*>Avenger<\/span>/);
  assert.match(markup, /data-slot="badge"[^>]*>Tech<\/span>/);
  assert.match(markup, /data-deck-control="minus"/);
  assert.match(markup, /data-deck-control="plus"/);
  assert.doesNotMatch(markup, /data-card-quantity=/);
  assert.match(markup, /aria-label="Save changes"/);
  assert.match(markup, /lucide-save/);
  assert.doesNotMatch(markup, />Save changes<\/button>/);
  assert.match(markup, /aspect-\[744\/1040\]/);
  assert.match(markup, /grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4/);
  assert.match(markup, /aria-label="Remove one Iron Man"/);
  assert.equal((markup.match(/aria-label="Add one Iron Man"/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /Your deck is empty/);
  assert.doesNotMatch(markup, />Selected deck<\/p>/);
  assert.doesNotMatch(markup, /lg:w-fit/);
  assert.match(markup, /w-\[52px\]/);
  assert.match(markup, /aria-label="Filter cards"/);
  assert.match(markup, /lucide-list-sort-descending/);
  assert.match(markup, /Open details for Iron Man, MHR-001, MR/);
  assert.match(markup, /aria-label="Save changes"/);

  const cappedMarkup = renderToStaticMarkup(
    <DeckBuilderScreen
      cards={builderCards}
      deck={{
        ...editorDeck,
        cardCount: 3,
        cards: [{ ...editorDeck.cards[0], quantity: 3 }],
      }}
      user={user}
    />,
  );
  assert.match(cappedMarkup, /disabled=""/);
  assert.match(cappedMarkup, /already has 3 copies/);
  assert.doesNotMatch(
    cappedMarkup,
    /<p[^>]*>[^<]*This card already has 3 copies\.<\/p>/,
  );
  assert.equal(
    (cappedMarkup.match(/aria-label="Add one Iron Man"/g) ?? []).length,
    0,
  );

  const lockedColorMarkup = renderToStaticMarkup(
    <DeckBuilderScreen
      cards={[
        ...builderCards,
        {
          id: "variant-green",
          cardId: "card-mhr-003",
          cardCode: "MHR-003",
          name: "Hulk",
          cardType: "Hero",
          rarityCode: "R",
          isBase: false,
          colorCode: "green",
          imageUrl: "/cards/MHR-003-R.webp",
          power: null,
          range: null,
          abilityText: null,
        },
      ]}
      deck={{
        ...editorDeck,
        cardCount: 2,
        colorCodes: ["red", "blue"],
        cards: [
          { ...editorDeck.cards[0], quantity: 1 },
          {
            ...editorDeck.cards[0],
            cardId: "card-mhr-002",
            cardCode: "MHR-002",
            colorCode: "blue",
            name: "Captain Marvel",
            quantity: 1,
          },
        ],
      }}
      user={user}
    />,
  );
  assert.match(
    lockedColorMarkup,
    /role="alert"[^>]*>Search is limited to the deck(?:'|&#x27;)s selected colors: Red and Blue\.<\/p>/,
  );
  assert.doesNotMatch(lockedColorMarkup, /Hulk|MHR-003/);
});
