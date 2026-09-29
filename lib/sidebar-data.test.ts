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
      { href: "/decks", key: "decks" },
      { href: "/match", key: "match" },
      { href: "/simulator", key: "simulator" },
    ],
  );
  assert.equal(sidebarNavigationItems[1].comingSoon, undefined);
  assert.equal(sidebarNavigationItems[2].comingSoon, undefined);
  assert.equal(sidebarNavigationItems[2].icon, "match");
  assert.equal(sidebarNavigationItems[2].label, "Match");
  assert.equal(sidebarNavigationItems[3].comingSoon, undefined);
  assert.equal(sidebarNavigationItems[3].icon, "gamepad-2");
  assert.equal(sidebarNavigationItems[3].label, "SIM");
});
