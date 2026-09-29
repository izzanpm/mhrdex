import assert from "node:assert/strict";
import test from "node:test";

import rawCatalog from "../../cards.en.json";

import { adaptBotDeck } from "./adapter";
import { BOT_DEMO_DECK, getSupportedCardCodes } from "./cards";
import { chooseBotAction } from "./bot";
import type {
  BotView,
  GameAction,
  SimulatorBotDeckEntry,
  SimulatorCatalogCard,
} from "./types";

const fixtureCatalog: SimulatorCatalogCard[] = rawCatalog.cards
  .filter((card) => /^BP01-0(?:0[1-9]|1[0-7])$/.test(card.card_code))
  .map((card) => {
    const variant = card.variants[0];
    if (variant === undefined) {
      throw new Error(`missing fixture variant for ${card.card_code}`);
    }
    return {
      cardId: `catalog-${card.card_code}`,
      cardCode: card.card_code,
      name: card.name,
      cardType: "Character",
      colorCode: card.color_code,
      isBase: true,
      level: variant.level,
      power: variant.power,
      range: variant.range,
      traitNames: card.traits,
      abilityText: card.ability_text,
    };
  });

const catalogByCardCode = new Map(
  fixtureCatalog.map((card) => [card.cardCode, card]),
);

test("the demo bot deck is a legal 50-card deck", () => {
  assert.equal(sumQuantities(BOT_DEMO_DECK), 50);
  assert.ok(BOT_DEMO_DECK.every((entry) => entry.quantity <= 3));
  assert.equal(getColorCount(BOT_DEMO_DECK), 1);
  assert.ok(
    BOT_DEMO_DECK.every(
      (entry) => catalogByCardCode.get(entry.cardCode)?.colorCode === "red",
    ),
  );

  const adapted = adaptBotDeck(
    BOT_DEMO_DECK,
    fixtureCatalog,
    getSupportedCardCodes(fixtureCatalog),
  );
  assert.equal(adapted.ok, true);
});

test("the bot always chooses a legal action", () => {
  const botView = createBotView([
    { type: "end-action-phase", playerId: "bot" },
  ]);
  const action = chooseBotAction(botView);

  assert.ok(
    action === null ||
      botView.legalActions.some(
        (candidate) => JSON.stringify(candidate) === JSON.stringify(action),
      ),
  );
});

test("the bot prioritizes an immediate winning Weakness target", () => {
  const view = createBotView(
    [
      { type: "end-action-phase", playerId: "bot" },
      { type: "call", playerId: "bot", instanceId: "bot-hand-1", sacrifices: [] },
      {
        type: "select-attack-target",
        playerId: "bot",
        targetId: "weakness:front",
      },
    ],
    {
      bot: { timeline: Array.from({ length: 8 }, (_, index) => `point-${index}`), rushPointDeckCount: 1 },
    },
  );

  assert.deepEqual(chooseBotAction(view), view.legalActions[2]);
});

test("the bot resolves mandatory choices before optional actions", () => {
  const view = createBotView([
    { type: "end-action-phase", playerId: "bot" },
    { type: "call", playerId: "bot", instanceId: "bot-hand-1", sacrifices: [] },
    {
      type: "choose-effect",
      playerId: "bot",
      choiceId: "choice-1",
      value: "yes",
    },
  ], { actionWindow: "effect-choice" });

  assert.deepEqual(chooseBotAction(view), view.legalActions[2]);
});

test("the bot prefers a useful CALL over movement and effects", () => {
  const view = createBotView([
    { type: "end-action-phase", playerId: "bot" },
    { type: "declare-attack", playerId: "bot", attackerId: "bot-field-1" },
    {
      type: "activate-effect",
      playerId: "bot",
      effectId: "BP01-001#1",
      sourceInstanceId: "bot-field-1",
    },
    { type: "call", playerId: "bot", instanceId: "bot-hand-1", sacrifices: [] },
  ]);

  assert.deepEqual(chooseBotAction(view), view.legalActions[3]);
});

test("the bot prefers a legal attack or move over a supported effect", () => {
  const view = createBotView([
    { type: "end-action-phase", playerId: "bot" },
    {
      type: "activate-effect",
      playerId: "bot",
      effectId: "BP01-001#1",
      sourceInstanceId: "bot-field-1",
    },
    { type: "declare-attack", playerId: "bot", attackerId: "bot-field-1" },
  ]);

  assert.deepEqual(chooseBotAction(view), view.legalActions[2]);
});

test("the bot uses a supported effect before passing", () => {
  const view = createBotView([
    { type: "counter-pass", playerId: "bot" },
    {
      type: "counter-effect",
      playerId: "bot",
      effectId: "BP01-001#1",
      sourceInstanceId: "bot-field-1",
    },
  ], { actionWindow: "counter-phase" });

  assert.deepEqual(chooseBotAction(view), view.legalActions[1]);
});

test("the bot passes when no higher-priority action is available", () => {
  const view = createBotView([
    { type: "counter-pass", playerId: "bot" },
  ], { actionWindow: "counter-phase" });

  assert.deepEqual(chooseBotAction(view), view.legalActions[0]);
});

test("ties are deterministic for the same seeded bot view", () => {
  const legalActions: readonly GameAction[] = [
    { type: "call", playerId: "bot", instanceId: "bot-hand-1", sacrifices: [] },
    { type: "call", playerId: "bot", instanceId: "bot-hand-2", sacrifices: [] },
  ];
  const first = chooseBotAction(createBotView(legalActions));
  const second = chooseBotAction(createBotView(legalActions));

  assert.deepEqual(first, second);
  assert.ok(first !== null);
});

test("different engine RNG states can choose different tie actions", () => {
  const legalActions: readonly GameAction[] = [
    { type: "call", playerId: "bot", instanceId: "bot-hand-1", sacrifices: [] },
    { type: "call", playerId: "bot", instanceId: "bot-hand-2", sacrifices: [] },
  ];
  const first = chooseBotAction(createBotView(legalActions, { rngState: 1 }));
  const second = chooseBotAction(createBotView(legalActions, { rngState: 12345 }));

  assert.notDeepEqual(first, second);
});

test("player-private fields do not affect the bot decision", () => {
  const view = createBotView([
    { type: "call", playerId: "bot", instanceId: "bot-hand-1", sacrifices: [] },
    { type: "call", playerId: "bot", instanceId: "bot-hand-2", sacrifices: [] },
  ]);
  const first = withPlayerPrivateFields(view, ["player-secret-a"], ["player-deck-a"]);
  const second = withPlayerPrivateFields(view, ["player-secret-b"], ["player-deck-b"]);

  assert.deepEqual(chooseBotAction(first), chooseBotAction(second));
});

function sumQuantities(entries: readonly { quantity: number }[]) {
  return entries.reduce((total, entry) => total + entry.quantity, 0);
}

function getColorCount(entries: readonly SimulatorBotDeckEntry[]) {
  return new Set(
    entries.map((entry) => catalogByCardCode.get(entry.cardCode)?.colorCode),
  ).size;
}

type PublicPlayer = BotView["publicState"]["players"]["bot"];

function createBotView(
  legalActions: readonly GameAction[],
  options: {
    actionWindow?: BotView["publicState"]["actionWindow"];
    bot?: Partial<PublicPlayer>;
    rngState?: number;
  } = {},
): BotView {
  return {
    rngState: options.rngState ?? 1,
    ownHand: ["bot-hand-1", "bot-hand-2"],
    ownDeck: ["bot-deck-1", "bot-deck-2"],
    publicState: {
      phase: "action",
      actionWindow: options.actionWindow ?? "action",
      activePlayer: "bot",
      priorityPlayer: "bot",
      players: {
        player: createPublicPlayer(),
        bot: { ...createPublicPlayer(), ...options.bot },
      },
    },
    legalActions,
  };
}

function createPublicPlayer(): PublicPlayer {
  return {
    deckCount: 20,
    handCount: 5,
    battle: {
      front: null,
      wingLeft: null,
      wingRight: null,
      back: null,
    },
    base: [],
    timeline: [],
    retreat: [],
    void: [],
    rushPointDeckCount: 9,
  };
}

function withPlayerPrivateFields(
  view: BotView,
  hand: readonly string[],
  deck: readonly string[],
): BotView {
  const player = {
    ...view.publicState.players.player,
    hand,
    deck,
  };
  return {
    ...view,
    publicState: {
      ...view.publicState,
      players: {
        ...view.publicState.players,
        player,
      },
    },
  } as BotView;
}
