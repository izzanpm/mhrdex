import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CardLibrary, filterCards } from "./card-library";
import { CardGridItem } from "./card-grid-item";

const cards = [
  {
    id: "variant-mr",
    cardCode: "MHR-001",
    name: "Iron Man",
    cardType: "Hero",
    rarityCode: "MR",
    imageUrl: "/cards/MHR-001-MR.webp",
  },
  {
    id: "variant-ur",
    cardCode: "MHR-001",
    name: "Iron Man",
    cardType: "Hero",
    rarityCode: "UR",
    imageUrl: "/cards/MHR-001-UR.webp",
  },
];

test("shows a useful empty state when the catalog has no cards", () => {
  const markup = renderToStaticMarkup(<CardLibrary cards={[]} />);

  assert.match(markup, /0 cards found/);
  assert.match(markup, /No cards in the catalog yet/);
  assert.match(markup, /Cards will appear here after catalog data is added/);
});

test("renders database cards in the reference card grid", () => {
  const markup = renderToStaticMarkup(<CardLibrary cards={cards} />);

  assert.match(markup, /2 cards found/);
  assert.equal((markup.match(/<article/g) ?? []).length, 2);
  assert.match(markup, /aria-label="Iron Man, MHR-001, MR"/);
  assert.match(markup, /aria-label="Iron Man, MHR-001, UR"/);
  assert.match(markup, /aspect-\[3\/4\]/);
  assert.match(markup, /uppercase[^>]*>Hero</);
});

test("filters cards by name or code without case sensitivity", () => {
  assert.deepEqual(filterCards(cards, "iron"), cards);
  assert.deepEqual(filterCards(cards, "mhr-001"), cards);
  assert.deepEqual(filterCards(cards, "  "), cards);
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

test("labels unavailable account settings honestly", () => {
  const markup = renderToStaticMarkup(<CardLibrary cards={[]} />);

  assert.match(markup, /aria-label="Account settings, coming soon"/);
});
