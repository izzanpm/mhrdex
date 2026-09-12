import assert from "node:assert/strict";
import test from "node:test";

import { sidebarNavigationItems } from "./sidebar-data";

test("shared sidebar keeps navigation destinations honest", () => {
  assert.deepEqual(
    sidebarNavigationItems.map((item) => ({
      href: item.href,
      key: item.key,
    })),
    [
      { href: "/", key: "cards" },
      { href: undefined, key: "decks" },
      { href: undefined, key: "match" },
    ],
  );
  assert.equal(sidebarNavigationItems[1].comingSoon, true);
  assert.equal(sidebarNavigationItems[2].comingSoon, true);
});
