import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AppIcon } from "./app-icon";
import type { IconName } from "./app-icon";

const iconNames: readonly IconName[] = [
  "cards",
  "chevron",
  "close",
  "decks",
  "gamepad-2",
  "home",
  "list-sort-descending",
  "match",
  "minus",
  "pencil",
  "plus",
  "save",
  "search",
  "trash",
];

const lucideNames: Record<IconName, string> = {
  cards: "playing-cards-fan",
  chevron: "chevron-right",
  close: "x",
  decks: "layers",
  "gamepad-2": "gamepad-2",
  home: "house",
  "list-sort-descending": "list-sort-descending",
  match: "clock-3",
  minus: "minus",
  pencil: "pencil",
  plus: "plus",
  save: "save",
  search: "search",
  trash: "trash",
};

test("renders every app icon through Lucide with shared props", () => {
  for (const name of iconNames) {
    const markup = renderToStaticMarkup(<AppIcon name={name} size={12} />);

    assert.match(
      markup,
      new RegExp(`class="lucide lucide-${lucideNames[name]}(?: |")`),
    );
    assert.match(markup, /width="12"/);
    assert.match(markup, /height="12"/);
    assert.match(markup, /stroke-width="1\.5"/);
  assert.match(markup, /aria-hidden="true"/);
  }
});
