import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("keeps the Match destination authenticated and available", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.match(source, /requireAuthSession\(\)/);
  assert.match(source, /Match/);
  assert.match(source, /Match tracking is coming soon/);
});
