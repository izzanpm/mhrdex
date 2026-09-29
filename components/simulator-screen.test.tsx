import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SimulatorBoard } from "./simulator-board";
import {
  buildBotView,
  createSimulatorUiState,
  getSimulatorLegalActions,
  getSimulatorGameStatus,
  SimulatorScreen,
  simulatorReducer,
  type SimulatorSetup,
} from "./simulator-screen";
import { SimulatorEventLog } from "./simulator-event-log";
import {
  createPendingChoiceAction,
  SimulatorStatus,
} from "./simulator-status";
import { mulliganActionLabel } from "./simulator-hand";
import { setupGame } from "../lib/simulator/engine";
import type {
  GameAction,
  GameState,
  SimulatorCardDefinition,
  SimulatorDeckEntry,
} from "../lib/simulator/types";

const definitions: SimulatorCardDefinition[] = Array.from(
  { length: 17 },
  (_, index) => ({
    cardId: `card-${index + 1}`,
    cardCode: `BP01-${String(index + 1).padStart(3, "0")}`,
    name: `Fixture Character ${index + 1}`,
    colorCode: "red",
    level: (index % 6) + 1,
    power: 1000 + index,
    range: index % 4,
    traitNames: [],
    abilityText: null,
    effectIds: [],
  }),
);

const playerEntries: SimulatorDeckEntry[] = [
  ...definitions
    .slice(0, 16)
    .map((definition) => ({ cardId: definition.cardId, quantity: 3 })),
  { cardId: definitions[16].cardId, quantity: 2 },
];

const setup = {
  kind: "ready",
  deck: {
    id: "deck-fixture",
    name: "Fixture Deck",
    cardCount: 50,
    colorCodes: ["red"],
    updatedAt: "2026-09-22T12:00:00.000Z",
    cards: definitions.map((definition) => ({
      cardId: definition.cardId,
      cardCode: definition.cardCode,
      name: definition.name,
      colorCode: definition.colorCode,
      imageUrl: `/cards/${definition.cardCode}-R.webp`,
      quantity: 3,
    })),
  },
  playerEntries,
  botEntries: playerEntries,
  definitions,
  cards: definitions.map((definition) => ({
    id: `variant-${definition.cardId}`,
    cardId: definition.cardId,
    cardCode: definition.cardCode,
    name: definition.name,
    cardType: "Character",
    rarityCode: "R",
    isBase: true,
    imageUrl: `/cards/${definition.cardCode}-R.webp`,
    power: definition.power,
    range: definition.range,
    abilityText: definition.abilityText,
    colorCode: definition.colorCode,
    level: definition.level,
    traitNames: [],
  })),
} satisfies Extract<SimulatorSetup, { kind: "ready" }>;

function createGame(): GameState {
  return setupGame({
    playerEntries,
    botEntries: setup.botEntries,
    definitions: new Map(definitions.map((definition) => [definition.cardId, definition])),
    seed: 20260929,
    firstPlayer: "player",
  });
}

function renderBoard(game: GameState) {
  return renderToStaticMarkup(
    <SimulatorBoard
      cards={setup.cards}
      game={game}
      legalActions={[]}
      onAction={() => undefined}
    />,
  );
}

test("starts a legal game through the reducer", () => {
  const initial = createSimulatorUiState(setup);
  const started = simulatorReducer(initial, {
    type: "start",
    seed: 20260929,
    firstPlayer: "player",
  });

  assert.equal(started.game?.phase, "mulligan");
  assert.equal(started.game?.players.player.hand.length, 6);
  assert.equal(started.game?.players.bot.hand.length, 6);
});

test("dispatches legal game actions through applyAction", () => {
  const initial = createSimulatorUiState(setup);
  const started = simulatorReducer(initial, {
    type: "start",
    seed: 20260929,
    firstPlayer: "player",
  });
  const action = started.game
    ? ({
        type: "submit-mulligan",
        playerId: "player",
        instanceIds: [],
      } satisfies GameAction)
    : null;

  assert.ok(action);
  const next = simulatorReducer(started, { type: "game", action });
  assert.equal(next.error, null);
  assert.equal(next.game?.pendingChoice?.playerId, "bot");
});

test("dispatches a click-equivalent legal action from the reducer contract", () => {
  const started = simulatorReducer(createSimulatorUiState(setup), {
    type: "start",
    seed: 20260929,
    firstPlayer: "player",
  });
  const action = getSimulatorLegalActions(started.game!, "player").find(
    (candidate) => candidate.type === "submit-mulligan",
  );

  assert.ok(action);
  const next = simulatorReducer(started, { type: "game", action });

  assert.equal(next.error, null);
  assert.notEqual(next.game?.events.length, started.game?.events.length);
});

test("bot turns apply a legal action without exposing player private zones", () => {
  const started = simulatorReducer(createSimulatorUiState(setup), {
    type: "start",
    seed: 20260929,
    firstPlayer: "bot",
  });
  const next = simulatorReducer(started, { type: "bot-turn" });

  assert.equal(next.error, null);
  assert.notEqual(next.game?.events.length, started.game?.events.length);
  assert.equal("hand" in buildBotView(next.game!).publicState.players.player, false);
  assert.equal("deck" in buildBotView(next.game!).publicState.players.player, false);
});

test("builds bot input without the player's private hand or deck", () => {
  const game = createGame();
  const view = buildBotView(game);

  assert.deepEqual(view.ownHand, game.players.bot.hand);
  assert.deepEqual(view.ownDeck, game.players.bot.deck);
  assert.equal(view.rngState, game.rngState);
  assert.equal("hand" in view.publicState.players.player, false);
  assert.equal("deck" in view.publicState.players.player, false);

  const markup = renderBoard(game);
  assert.doesNotMatch(markup, new RegExp(game.players.bot.hand[0] ?? "bot-hand"));
});

test("renders board areas and touch-sized focused controls", () => {
  const markup = renderBoard(createGame());
  const selectionMarkup = renderToStaticMarkup(
    <SimulatorScreen
      setup={{ kind: "select-deck", decks: [] }}
      user={{ email: "player@example.com", image: null, name: "Player One" }}
    />,
  );
  const readyMarkup = renderToStaticMarkup(
    <SimulatorScreen
      setup={setup}
      user={{ email: "player@example.com", image: null, name: "Player One" }}
    />,
  );
  const source = readFileSync(new URL("./simulator-screen.tsx", import.meta.url), "utf8");

  assert.match(markup, /Front/);
  assert.match(markup, /Wing left/);
  assert.match(markup, /Wing right/);
  assert.match(markup, /Back/);
  assert.match(markup, /Base/);
  assert.match(source, /min-h-11/);
  assert.match(source, /focus-visible:ring/);
  assert.match(source, /overflow-x-hidden/);
  assert.match(source, /min-w-0/);
  assert.match(selectionMarkup, /Manage decks/);
  assert.match(readyMarkup, /First player/);
  assert.match(source, /Manage decks[\s\S]*?inline-flex min-h-11 items-center/);
  assert.match(source, /"min-h-11 flex-1 rounded-\[4px\]/);
});

test("renders pending choices as typed controls", () => {
  const game = createGame();
  const longName = "A very long character name that must wrap inside the choice control";
  const targetInstanceId = game.players.player.hand[1]!;
  const targetCardCode = game.instances[targetInstanceId]!.cardCode;
  const targetMetadata = game.cardMetadata?.[targetCardCode];
  assert.ok(targetMetadata);
  const pendingGame: GameState = {
    ...game,
    cardMetadata: {
      ...game.cardMetadata,
      [targetCardCode]: { ...targetMetadata, name: longName },
    },
    phase: "action",
    actionWindow: "effect-choice",
    priorityPlayer: "player",
    pendingChoice: {
      type: "target",
      playerId: "player",
      choiceId: "choice-1",
      effectId: "BP01-001#1",
      sourceInstanceId: game.players.player.hand[0]!,
      options: [targetInstanceId],
      min: 1,
      max: 1,
      filter: { controller: "self", zones: ["hand"] },
    },
  };
  const markup = renderToStaticMarkup(
    <SimulatorStatus
      cards={setup.cards}
      game={pendingGame}
      legalActions={[]}
      onAction={() => undefined}
    />,
  );

  assert.match(markup, /Pending choice/);
  assert.match(markup, /Choose target/);
  assert.match(markup, /choice-1/);
  assert.match(markup, /data-action-type="choose-effect"/);
  assert.match(markup, /Submit choice/);
  assert.match(markup, new RegExp(longName));
  assert.match(markup, /min-w-0[^\"]*break-words[^\"]*whitespace-normal/);
});

test("hides opponent face-down identity from board, action, and status labels", () => {
  const game = createGame();
  const botHiddenId = game.players.bot.deck[0];
  assert.ok(botHiddenId);
  const ownHiddenId = game.players.player.deck.find(
    (instanceId) => game.instances[instanceId]?.cardCode !== game.instances[botHiddenId].cardCode,
  );
  assert.ok(ownHiddenId);
  const botHidden = game.instances[botHiddenId];
  const ownHidden = game.instances[ownHiddenId];
  assert.ok(botHidden);
  assert.ok(ownHidden);
  const botCard = setup.cards.find((card) => card.cardCode === botHidden.cardCode);
  const ownCard = setup.cards.find((card) => card.cardCode === ownHidden.cardCode);
  assert.ok(botCard);
  assert.ok(ownCard);

  const hiddenGame: GameState = {
    ...game,
    instances: {
      ...game.instances,
      [botHiddenId]: { ...botHidden, zone: "front", faceDown: true },
      [ownHiddenId]: { ...ownHidden, zone: "base", faceDown: true },
    },
    players: {
      ...game.players,
      bot: {
        ...game.players.bot,
        deck: game.players.bot.deck.filter((instanceId) => instanceId !== botHiddenId),
        battle: { ...game.players.bot.battle, front: botHiddenId },
      },
      player: {
        ...game.players.player,
        deck: game.players.player.deck.filter((instanceId) => instanceId !== ownHiddenId),
        base: [ownHiddenId],
      },
    },
    pendingChoice: {
      type: "target",
      playerId: "player",
      choiceId: "hidden-target",
      effectId: "TEST#1",
      sourceInstanceId: ownHiddenId,
      options: [botHiddenId, ownHiddenId],
      min: 1,
      max: 1,
      filter: { controller: "any", zones: ["front", "base"] },
    },
  };
  const boardMarkup = renderToStaticMarkup(
    <SimulatorBoard
      cards={setup.cards}
      game={hiddenGame}
      legalActions={[
        { type: "select-attack-target", playerId: "player", targetId: botHiddenId },
        { type: "battle-base-move", playerId: "player", instanceId: ownHiddenId, destination: "base" },
      ]}
      onAction={() => undefined}
    />,
  );
  const statusMarkup = renderToStaticMarkup(
    <SimulatorStatus
      cards={setup.cards}
      game={hiddenGame}
      legalActions={[]}
      onAction={() => undefined}
    />,
  );

  for (const markup of [boardMarkup, statusMarkup]) {
    assert.match(markup, /Face-down card/);
    assert.doesNotMatch(markup, new RegExp(botHidden.cardCode));
    assert.doesNotMatch(markup, new RegExp(botCard.name));
  }
  assert.match(boardMarkup, new RegExp(ownHidden.cardCode));
  assert.match(statusMarkup, new RegExp(ownCard.name));
});

test("builds the typed pending-choice action used by the submit control", () => {
  const action = createPendingChoiceAction(
    {
      type: "target",
      playerId: "player",
      choiceId: "choice-2",
      effectId: "BP01-001#1",
      sourceInstanceId: "source-1",
      options: ["target-1", "target-2"],
      min: 1,
      max: 1,
      filter: { controller: "self", zones: ["hand"] },
    },
    ["target-2"],
  );

  assert.deepEqual(action, {
    type: "choose-effect",
    playerId: "player",
    choiceId: "choice-2",
    value: ["target-2"],
  });
});

test("uses accurate mulligan labels for selecting and deselecting cards", () => {
  assert.equal(
    mulliganActionLabel("Fixture Character", false),
    "Select Fixture Character for mulligan",
  );
  assert.equal(
    mulliganActionLabel("Fixture Character", true),
    "Keep Fixture Character and remove it from mulligan selection",
  );
});

test("renders only public events in sequence order", () => {
  const game = createGame();
  const markup = renderToStaticMarkup(
    <SimulatorEventLog
      events={[
        ...game.events,
        {
          sequence: 2,
          type: "private-hand-drawn",
          visibility: "private",
          playerId: "bot",
          data: { instanceId: game.players.bot.hand[0]! },
        },
        {
          sequence: 3,
          type: "public-action",
          visibility: "public",
          playerId: "player",
          data: {},
        },
      ]}
    />,
  );

  assert.match(markup, /game setup/);
  assert.match(markup, /public action/);
  assert.doesNotMatch(markup, /private-hand-drawn/);
  assert.doesNotMatch(markup, new RegExp(game.players.bot.hand[0]!));
  assert.ok(markup.indexOf("game setup") < markup.indexOf("public action"));
});

test("renders the ready simulator shell and never renders the bot hand", () => {
  const markup = renderToStaticMarkup(<SimulatorScreen setup={setup} user={{ email: "player@example.com", image: null, name: "Player One" }} />);
  const source = readFileSync(new URL("./simulator-board.tsx", import.meta.url), "utf8");

  assert.match(markup, /Ready to operate/);
  assert.match(markup, /Start simulation/);
  assert.doesNotMatch(markup, /ENERGY 1/);
  assert.doesNotMatch(source, /players\.bot\.hand/);
  assert.match(source, /next\/image/);
});

test("shows a winner instead of the active game status after game over", () => {
  const activeGame = createGame();

  assert.equal(getSimulatorGameStatus(null), null);
  assert.equal(getSimulatorGameStatus(activeGame), "Game in progress");
  assert.equal(
    getSimulatorGameStatus({ ...activeGame, winner: "player" }),
    "Winner: Player",
  );
  assert.equal(
    getSimulatorGameStatus({ ...activeGame, winner: "bot" }),
    "Winner: Bot",
  );
});
