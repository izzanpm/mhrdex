import assert from "node:assert/strict";
import test from "node:test";

import {
  getAreaLimit,
  getBattleDistance,
  getOpponent,
  isBattleSlot,
  isWinningTimeline,
} from "./rules";

test("returns the configured limits for constrained areas", () => {
  assert.equal(getAreaLimit("deck"), 50);
  assert.equal(getAreaLimit("hand"), 9);
  assert.equal(getAreaLimit("front"), 1);
  assert.equal(getAreaLimit("wingLeft"), 1);
  assert.equal(getAreaLimit("wingRight"), 1);
  assert.equal(getAreaLimit("back"), 1);
  assert.equal(getAreaLimit("base"), 6);
  assert.equal(getAreaLimit("timeline"), 9);
  assert.equal(getAreaLimit("rushPointDeck"), 9);
});

test("returns no limit for discard-like and removed-card areas", () => {
  assert.equal(getAreaLimit("retreat"), null);
  assert.equal(getAreaLimit("void"), null);
});

test("measures battle distance across the ordered battle slots", () => {
  assert.equal(getBattleDistance("front", "front"), 0);
  assert.equal(getBattleDistance("front", "wingLeft"), 1);
  assert.equal(getBattleDistance("front", "wingRight"), 2);
  assert.equal(getBattleDistance("front", "back"), 3);
  assert.equal(getBattleDistance("back", "front"), 3);
  assert.equal(getBattleDistance("wingRight", "wingLeft"), 1);
});

test("recognizes only battle slots", () => {
  assert.equal(isBattleSlot("front"), true);
  assert.equal(isBattleSlot("wingLeft"), true);
  assert.equal(isBattleSlot("wingRight"), true);
  assert.equal(isBattleSlot("back"), true);
  assert.equal(isBattleSlot("base"), false);
  assert.equal(isBattleSlot("hand"), false);
});

test("finds the other player", () => {
  assert.equal(getOpponent("player"), "bot");
  assert.equal(getOpponent("bot"), "player");
});

test("wins when a Timeline contains nine Rush Points", () => {
  assert.equal(isWinningTimeline([]), false);
  assert.equal(isWinningTimeline(["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"]), false);
  assert.equal(
    isWinningTimeline(["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"]),
    true,
  );
  assert.equal(
    isWinningTimeline([
      "r1",
      "r2",
      "r3",
      "r4",
      "r5",
      "r6",
      "r7",
      "r8",
      "r9",
      "r10",
    ]),
    true,
  );
});
