import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Sidebar } from "./sidebar";

test("renders the approved legible desktop sidebar scale", () => {
  const markup = renderToStaticMarkup(<Sidebar />);
  const asideTag = markup.match(/<aside[^>]+>/)?.[0];
  const navigation = markup.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
  const navigationItems = Array.from(
    navigation.matchAll(/<(?:a|button)[^>]+>/g),
    (match) => match[0],
  );
  const navigationLabels = Array.from(
    navigation.matchAll(
      /<span class="text-\[10px\] font-medium md:font-mono md:text-\[10px\] md:uppercase md:tracking-\[0\.08em\]">([^<]+)<\/span>/g,
    ),
    (match) => match[1],
  );
  const iconWrappers = Array.from(
    navigation.matchAll(/<span class="shrink-0 [^"]+">/g),
    (match) => match[0],
  );
  const navigationIcons = Array.from(
    navigation.matchAll(/<svg[^>]+height="14"[^>]+width="14">/g),
  );
  const disabledNavigationItems = Array.from(
    navigation.matchAll(/<(?:a|button)[^>]+disabled(?:="")?[^>]*>/g),
  );
  const brandTitle = markup.match(/<p class="[^"]+">MHR Dex<\/p>/)?.[0];
  const brandSubtitle = markup.match(
    /<p class="[^"]+">MHR COMPANION APP<\/p>/,
  )?.[0];

  assert.ok(asideTag);
  assert.ok(brandTitle);
  assert.ok(brandSubtitle);
  assert.match(markup, /MHR COMPANION APP/);
  assert.doesNotMatch(markup, /Hero Rush/);
  assert.match(asideTag, /md:w-\[232px\]/);
  assert.equal(navigationItems.length, 3);
  navigationItems.forEach((item) => {
    assert.match(item, /min-h-11/);
    assert.match(item, /md:h-\[44px\]/);
  });
  assert.deepEqual(navigationLabels, ["Cards", "Decks", "Match"]);
  assert.equal(iconWrappers.length, 3);
  iconWrappers.forEach((wrapper) => {
    assert.match(wrapper, /md:\[&amp;&gt;svg\]:h-\[14px\]/);
    assert.match(wrapper, /md:\[&amp;&gt;svg\]:w-\[14px\]/);
  });
  assert.equal(navigationIcons.length, 3);
  assert.equal(disabledNavigationItems.length, 2);
  assert.doesNotMatch(navigation, /md:hidden">Soon<\/span>/);
  assert.match(brandTitle, /text-\[10px\]/);
  assert.match(brandTitle, /md:text-\[11px\]/);
  assert.match(brandSubtitle, /text-\[8px\]/);
  assert.match(brandSubtitle, /md:text-\[7px\]/);
  assert.match(markup, /before:w-\[2px\]/);
});

test("marks Cards active on the root route", () => {
  const markup = renderToStaticMarkup(<Sidebar />);
  const cardsLink = markup.match(/<a aria-current="page"[^>]+>/)?.[0];

  assert.ok(cardsLink);
  assert.match(cardsLink, /href="\/"/);
  assert.match(cardsLink, /bg-app-surface-active/);
});
