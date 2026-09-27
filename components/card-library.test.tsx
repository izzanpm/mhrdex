import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CardLibrary, filterCards, getFilterOptions } from "./card-library";
import {
  CARD_DETAIL_GRID_CLASS,
  CARD_DETAIL_LAYER_CLASS,
  CARD_DETAIL_POPUP_WIDTH_CLASS,
  CARD_DETAIL_TITLE_CLASS,
  getCardVariants,
} from "./card-detail-modal";
import { CardGridItem } from "./card-grid-item";

const cards = [
  {
    id: "variant-mr",
    cardId: "card-mhr-001",
    cardCode: "MHR-001",
    name: "Iron Man",
    cardType: "Hero",
    rarityCode: "MR",
    imageUrl: "/cards/MHR-001-MR.webp",
    isBase: true,
  },
  {
    id: "variant-ur",
    cardId: "card-mhr-001",
    cardCode: "MHR-001",
    name: "Iron Man",
    cardType: "Hero",
    rarityCode: "UR",
    imageUrl: "/cards/MHR-001-UR.webp",
    isBase: false,
  },
];

test("shows a useful empty state when the catalog has no cards", () => {
  const markup = renderToStaticMarkup(<CardLibrary cards={[]} />);

  assert.match(markup, /0 cards found/);
  assert.match(markup, /No cards in the catalog yet/);
  assert.match(markup, /Cards will appear here after catalog data is added/);
});

test("applies filter options without an Apply filters action", () => {
  const source = readFileSync(new URL("./card-library.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, />Apply filters</);
  assert.match(source, /function applyFilterChange/);
  assert.match(source, /onApply\(nextFilters\)/);
});

test("renders the language status group without a menu trigger", () => {
  const markup = renderToStaticMarkup(<CardLibrary cards={[]} />);

  assert.match(markup, /aria-label="Language"/);
  assert.match(markup, /role="group"/);
  assert.match(markup, />ENG<\/span>/);
  assert.match(markup, />IDN<\/span>/);
  assert.match(markup, /IDN\u00a0\u00a0\u00b7\u00a0\u00a0Coming soon/);
  assert.doesNotMatch(markup, /aria-haspopup="menu"/);
});

test("renders database cards in the reference card grid", () => {
  const markup = renderToStaticMarkup(<CardLibrary cards={cards} />);

  assert.match(markup, /2 cards found/);
  assert.equal((markup.match(/<article/g) ?? []).length, 2);
  assert.match(markup, /aria-label="Iron Man, MHR-001, MR"/);
  assert.match(markup, /aria-label="Iron Man, MHR-001, UR"/);
  assert.match(markup, /aria-label="Open details for Iron Man, MHR-001, MR"/);
  assert.match(markup, /aria-label="Filter cards"/);
  assert.match(markup, /lucide-list-sort-descending/);
  assert.match(markup, /aspect-\[744\/1040\]/);
});

test("does not render the card type over the artwork", () => {
  const markup = renderToStaticMarkup(
    <CardGridItem card={{ ...cards[0], cardType: "character" }} />,
  );

  assert.doesNotMatch(markup, />character</);
});

test("renders non-interactive deck controls on card artwork when requested", () => {
  const markup = renderToStaticMarkup(
    <CardGridItem card={cards[0]} showDeckControls />,
  );

  assert.match(markup, /aria-hidden="true"[^>]*data-deck-controls="true"/);
  assert.match(markup, /data-deck-control="minus"/);
  assert.match(markup, /data-deck-control="plus"/);
  assert.doesNotMatch(markup, /<button[^>]*data-deck-control/);
});

test("groups card variants by card code", () => {
  assert.deepEqual(
    getCardVariants(
      [
        ...cards,
        { ...cards[0], cardCode: "MHR-002", id: "variant-other" },
      ],
      "MHR-001",
    ).map((card) => card.id),
    ["variant-mr", "variant-ur"],
  );
});

test("keeps the card detail dialog above the sidebar layer", () => {
  assert.equal(CARD_DETAIL_LAYER_CLASS, "z-50");
});

test("sizes the card detail dialog to its content on desktop", () => {
  assert.equal(CARD_DETAIL_POPUP_WIDTH_CLASS, "lg:w-fit");
  assert.equal(CARD_DETAIL_GRID_CLASS, "lg:grid-cols-[320px_auto]");
  assert.equal(CARD_DETAIL_TITLE_CLASS, "whitespace-nowrap");
});

test("does not duplicate the card type over the artwork", () => {
  const source = readFileSync(new URL("./card-detail-modal.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /absolute bottom-4 left-4/);
});

test("removes the redundant card detail eyebrow", () => {
  const source = readFileSync(new URL("./card-detail-modal.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, />\s*CARD DETAIL\s*</);
});

test("keeps the close control while tightening artwork spacing", () => {
  const source = readFileSync(new URL("./card-detail-modal.tsx", import.meta.url), "utf8");

  assert.match(source, /aria-label="Close card details"/);
  assert.match(source, /"mt-8 grid min-h-0 gap-10 lg:mt-8 /);
});

test("does not render an add-to-deck action in card details", () => {
  const source = readFileSync(new URL("./card-detail-modal.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /ADD TO DECK/);
});

test("filters cards by name or code without case sensitivity", () => {
  assert.deepEqual(filterCards(cards, "iron"), cards);
  assert.deepEqual(filterCards(cards, "mhr-001"), cards);
  assert.deepEqual(filterCards(cards, "  "), cards);
});

test("filters to base variants when base-only is selected", () => {
  const filters = {
    baseOnly: true,
    colorCodes: [],
    levels: [],
    ranges: [],
    rarityCode: null,
    setCodes: [],
    traitNames: [],
  } as unknown as Parameters<typeof filterCards>[2];

  assert.deepEqual(filterCards(cards, "", filters), [cards[0]]);
});

test("includes zero in the range filter options", () => {
  const source = readFileSync(new URL("./card-library.tsx", import.meta.url), "utf8");

  assert.match(source, /const RANGE_OPTIONS = \["0", "1", "2", "3", "4", "5"\]/);
});

test("filters cards by the selected catalog facets", () => {
  const filterableCards = [
    {
      ...cards[0],
      colorCode: "blue",
      level: 3,
      range: "3",
      setCode: "BP01",
      traitNames: ["Avengers"],
    },
    {
      ...cards[1],
      colorCode: "red",
      level: 4,
      range: "4",
      setCode: "SD01",
      traitNames: ["Guardians"],
    },
  ];

  assert.deepEqual(
    filterCards(
      filterableCards,
      "",
      {
        colorCodes: ["blue"],
        levels: [3],
        ranges: ["3"],
        rarityCode: "MR",
        setCodes: ["BP01"],
        traitNames: ["Avengers"],
      } as unknown as Parameters<typeof filterCards>[2],
    ),
    [filterableCards[0]],
  );
});

test("filters by multiple colors with OR matching", () => {
  const filterableCards = [
    {
      ...cards[0],
      colorCode: "blue",
    },
    {
      ...cards[1],
      colorCode: "red",
    },
    {
      ...cards[0],
      colorCode: "green",
      id: "variant-green",
    },
  ];
  const filters = {
    colorCodes: ["blue", "red"],
    levels: [],
    ranges: [],
    rarityCode: null,
    setCodes: [],
    traitNames: [],
  } as unknown as Parameters<typeof filterCards>[2];

  assert.deepEqual(filterCards(filterableCards, "", filters), [
    filterableCards[0],
    filterableCards[1],
  ]);
});

test("requires cards to contain every selected trait", () => {
  const filterableCards = [
    {
      ...cards[0],
      id: "variant-both",
      traitNames: ["Avengers", "Guardians"],
    },
    {
      ...cards[1],
      id: "variant-avengers",
      traitNames: ["Avengers"],
    },
    {
      ...cards[0],
      id: "variant-guardians",
      traitNames: ["Guardians"],
    },
  ];
  const filters = {
    colorCodes: [],
    levels: [],
    ranges: [],
    rarityCode: null,
    setCodes: [],
    traitNames: ["Avengers", "Guardians"],
  } as unknown as Parameters<typeof filterCards>[2];

  assert.deepEqual(filterCards(filterableCards, "", filters), [
    filterableCards[0],
  ]);
});

test("filters by multiple sets, ranges, and levels with OR matching", () => {
  const filterableCards = [
    { ...cards[0], level: 1, range: "1", setCode: "BP01" },
    { ...cards[1], id: "variant-sp", level: 3, range: "3", setCode: "SP01" },
    { ...cards[0], id: "variant-sd", level: 5, range: "5", setCode: "SD01" },
  ];
  const filters = {
    colorCodes: [],
    levels: [1, 3],
    ranges: ["1", "3"],
    rarityCode: null,
    setCodes: ["BP01", "SP01"],
    traitNames: [],
  } as unknown as Parameters<typeof filterCards>[2];

  assert.deepEqual(filterCards(filterableCards, "", filters), [
    filterableCards[0],
    filterableCards[1],
  ]);
});

test("derives set and trait options from catalog cards", () => {
  const options = getFilterOptions([
    { ...cards[0], setCode: "SP01", traitNames: ["Avengers", "Hydra"] },
    { ...cards[1], setCode: "BP01", traitNames: ["Avengers", "Guardians"] },
  ]);

  assert.deepEqual(options, {
    sets: ["BP01", "SP01"],
    traits: ["Avengers", "Guardians", "Hydra"],
  });
});

test("keeps set filter labels on one line", () => {
  const source = readFileSync(new URL("./card-library.tsx", import.meta.url), "utf8");

  assert.match(source, /shrink-0 whitespace-nowrap/);
  assert.match(source, /<div className="flex flex-wrap gap-2">/);
});

test("does not treat a protocol-relative image URL as a local asset", () => {
  const markup = renderToStaticMarkup(
    <CardGridItem card={{ ...cards[0], imageUrl: "//example.com/card.jpg" }} />,
  );

  assert.doesNotMatch(markup, /example\.com/);
});

test("does not report a zero count when the catalog query fails", () => {
  const markup = renderToStaticMarkup(<CardLibrary cards={[]} loadError />);

  assert.match(markup, /Card count unavailable/);
  assert.doesNotMatch(markup, /0 cards found/);
});

test("uses shadcn controls and guest auth links", () => {
  const markup = renderToStaticMarkup(<CardLibrary cards={[]} />);

  assert.match(markup, /data-slot="input"/);
  assert.match(markup, /group\/button/);
  assert.match(markup, /role="group"/);
  assert.match(
    markup,
    /text-app-text-dim">IDN\u00a0\u00a0\u00b7\u00a0\u00a0Coming soon<\/span>/,
  );
  assert.doesNotMatch(markup, /data-slot="select-trigger"/);
  const source = readFileSync(new URL("./card-library.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /<DropdownMenuTrigger/);
  assert.doesNotMatch(source, /<DropdownMenuItem/);
  assert.doesNotMatch(source, /<TooltipTrigger/);
  assert.match(markup, /data-slot="sheet-trigger"/);
  assert.match(markup, /href="\/sign-in"/);
  assert.match(markup, /href="\/sign-up"/);
  assert.doesNotMatch(markup, /data-slot="avatar"/);
});

test("shows an authenticated user's avatar instead of guest auth links", () => {
  const markup = renderToStaticMarkup(
    <CardLibrary
      cards={[]}
      user={{
        email: "player@example.com",
        image: null,
        name: "Player One",
      }}
    />,
  );

  assert.match(markup, /data-slot="avatar"/);
  assert.match(markup, /data-slot="dropdown-menu-trigger"/);
  assert.match(markup, /aria-label="Open account menu"/);
  assert.match(markup, />PO</);
  assert.doesNotMatch(markup, /Account settings, coming soon/);
  assert.doesNotMatch(markup, /href="\/sign-in"/);
  assert.doesNotMatch(markup, /href="\/sign-up"/);
});
