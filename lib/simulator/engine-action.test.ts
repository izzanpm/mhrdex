import assert from "node:assert/strict";
import test from "node:test";

import { applyAction, getLegalActions, setupGame } from "./engine";
import type {
  BattleSlot,
  GameState,
  SimulatorCardDefinition,
  SimulatorDeckEntry,
} from "./types";

const definitionsList: SimulatorCardDefinition[] = Array.from(
  { length: 17 },
  (_, index) => ({
    cardId: `card-${index + 1}`,
    cardCode: `BP01-${String(index + 1).padStart(3, "0")}`,
    name: `Fixture Character ${index + 1}`,
    colorCode: index < 16 ? "red" : "blue",
    level: [1, 2, 3, 4, 5, 6][index % 6],
    power: 1000 + index,
    range: 1 + (index % 4),
    traitNames: [],
    abilityText: null,
    effectIds: [],
  }),
);

const fixtureEntries: SimulatorDeckEntry[] = [
  ...definitionsList
    .slice(0, 16)
    .map((definition) => ({ cardId: definition.cardId, quantity: 3 })),
  { cardId: definitionsList[16].cardId, quantity: 2 },
];

const fixtureSetup = {
  playerEntries: fixtureEntries,
  botEntries: fixtureEntries,
  definitions: new Map(
    definitionsList.map((definition) => [definition.cardId, definition]),
  ),
  seed: 20260929,
  firstPlayer: "player" as const,
};

const BATTLE_SLOTS: readonly BattleSlot[] = [
  "front",
  "wingLeft",
  "wingRight",
  "back",
];

test("setup draws six cards, shuffles deterministically, and opens mulligan", () => {
  const state = setupGame(fixtureSetup);
  const repeated = setupGame(fixtureSetup);

  assert.deepEqual(repeated, state);
  assert.equal(state.phase, "mulligan");
  assert.equal(state.actionWindow, "mulligan");
  assert.equal(state.players.player.hand.length, 6);
  assert.equal(state.players.bot.hand.length, 6);
  assert.equal(state.players.player.rushPointDeck.length, 9);
  assert.equal(state.players.bot.rushPointDeck.length, 9);
  assert.deepEqual(state.pendingChoice, {
    type: "mulligan",
    playerId: "player",
    instanceIds: [],
  });
  assert.equal("seed" in state.events[0].data, false);
  assert.ok(
    state.events.every(
      (event, index) => event.sequence === index + 1,
    ),
  );
});

test("mulligan resolves the first player before the second player", () => {
  const initial = setupGame(fixtureSetup);
  const initialBefore = structuredClone(initial);
  const selected = initial.players.player.hand[0];

  const first = applyAction(initial, {
    type: "submit-mulligan",
    playerId: "player",
    instanceIds: [selected],
  });

  if (!first.ok) throw new Error(first.error.message);
  assert.equal(first.ok, true);
  assert.deepEqual(first.state.pendingChoice, {
    type: "mulligan",
    playerId: "bot",
    instanceIds: [],
  });
  assert.equal(getLegalActions(first.state, "player").length, 0);
  assert.ok(
    getLegalActions(first.state, "bot").some(
      (candidate) =>
        candidate.type === "submit-mulligan" &&
        candidate.instanceIds.length === 0,
    ),
  );
  assert.equal(first.state.players.player.hand.length, 6);
  assert.equal(first.state.players.player.hand.includes(selected), false);
  assert.equal(first.state.players.player.deck.includes(selected), true);
  assert.deepEqual(initial, initialBefore);

  const firstStateBefore = structuredClone(first.state);

  const second = applyAction(first.state, {
    type: "submit-mulligan",
    playerId: "bot",
    instanceIds: [],
  });

  if (!second.ok) throw new Error(second.error.message);
  assert.equal(second.ok, true);
  assert.equal(second.state.pendingChoice, null);
  assert.equal(second.state.phase, "action");
  assert.equal(second.state.actionWindow, "action");
  assert.equal(second.state.activePlayer, "player");
  assert.equal(second.state.priorityPlayer, "player");
  assert.equal(second.state.players.player.hand.length, 8);
  assert.equal(second.state.players.bot.hand.length, 6);
  assert.deepEqual(first.state, firstStateBefore);
});

test("mulligan moves an attached tree with the selected parent", () => {
  const state = setupGame(fixtureSetup);
  const parent = state.players.player.hand[0];
  const child = state.players.player.hand[1];
  attachCard(state, parent, child);

  const result = applyAction(state, {
    type: "submit-mulligan",
    playerId: "player",
    instanceIds: [parent],
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.state.instances[parent].zone, "deck");
  assert.equal(result.state.instances[child].zone, "deck");
  assert.equal(result.state.instances[child].attachedTo, parent);
  assert.deepEqual(result.state.instances[parent].attachmentIds, [child]);
});

test("pending non-mulligan choices and resolution queues block unrelated actions", () => {
  const action = {
    type: "base-deploy" as const,
    playerId: "player" as const,
    instanceId: setupInActionPhase().players.player.hand[0],
  };
  const pendingChoice: NonNullable<GameState["pendingChoice"]> = {
    type: "effect",
    playerId: "player",
    choiceId: "choice-1",
    effectId: "effect-1",
    sourceInstanceId: action.instanceId,
    options: ["yes", "no"],
    min: 1,
    max: 1,
  };
  const pendingState = {
    ...setupInActionPhase(),
    pendingChoice,
  };
  const pendingResult = applyAction(pendingState, action);
  assert.equal(pendingResult.ok, false);
  assert.equal(pendingResult.state, pendingState);
  assert.equal(getLegalActions(pendingState, "player").length, 0);

  const queuedState = {
    ...setupInActionPhase(),
    resolutionQueue: [
      {
        effectId: "effect-1",
        sourceInstanceId: action.instanceId,
        controllerId: "player" as const,
        context: {},
      },
    ],
  };
  const queuedResult = applyAction(queuedState, action);
  assert.equal(queuedResult.ok, false);
  assert.equal(queuedResult.state, queuedState);
  assert.equal(getLegalActions(queuedState, "player").length, 0);
});

test("invalid action preserves the previous state", () => {
  const state = setupInActionPhase();
  const result = applyAction(state, {
    type: "base-deploy",
    playerId: "bot",
    instanceId: state.players.player.hand[0],
  });

  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.deepEqual(result.state, state);
});

test("only valid bot actions advance the engine RNG once", () => {
  const botState: GameState = {
    ...setupInActionPhase(),
    activePlayer: "bot",
    priorityPlayer: "bot",
    rngState: 1,
  };
  const botResult = applyAction(botState, {
    type: "end-action-phase",
    playerId: "bot",
  });

  assert.equal(botResult.ok, true);
  assert.equal(botResult.state.rngState, 270369);

  const playerState = setupInActionPhase();
  const playerResult = applyAction(playerState, {
    type: "end-action-phase",
    playerId: "player",
  });

  assert.equal(playerResult.ok, true);
  assert.equal(playerResult.state.rngState, playerState.rngState);

  const invalidState: GameState = {
    ...setupInActionPhase(),
    activePlayer: "bot",
    priorityPlayer: "bot",
    rngState: 1,
  };
  const invalidResult = applyAction(invalidState, {
    type: "base-deploy",
    playerId: "bot",
    instanceId: "missing-instance",
  });

  assert.equal(invalidResult.ok, false);
  assert.equal(invalidResult.state, invalidState);
  assert.equal(invalidResult.state.rngState, 1);
});

test("Base Deployment places one face-down card and draws one card", () => {
  const state = setupInActionPhase();
  const stateBefore = structuredClone(state);
  const instanceId = state.players.player.hand[0];
  const handBefore = state.players.player.hand;
  const deckBefore = state.players.player.deck;

  const result = applyAction(state, {
    type: "base-deploy",
    playerId: "player",
    instanceId,
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.ok, true);
  assert.equal(result.state.players.player.base.length, 1);
  assert.deepEqual(result.state.players.player.base, [instanceId]);
  assert.equal(result.state.instances[instanceId].zone, "base");
  assert.equal(result.state.instances[instanceId].faceDown, true);
  assert.equal(result.state.players.player.hand.length, handBefore.length);
  assert.equal(result.state.players.player.deck.length, deckBefore.length - 1);
  assert.equal(result.state.baseDeploymentUsed, true);
  assert.equal(result.state.actionCallsThisTurn, 0);
  assert.equal(result.events[0].type, "base-deployed");
  assert.equal(result.events[0].visibility, "public");
  assert.deepEqual(result.events[0].data, {});
  assert.equal(JSON.stringify(result.events[0].data).includes(instanceId), false);
  assert.equal(result.events[1].visibility, "private");
  assert.equal(result.events[1].data.instanceId, instanceId);
  assert.deepEqual(state, stateBefore);

  const duplicate = applyAction(result.state, {
    type: "base-deploy",
    playerId: "player",
    instanceId: result.state.players.player.hand[0],
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.state, result.state);
});

test("Lv1-Lv3 CALL enters the first open Battle slot without sacrifices", () => {
  const state = setupInActionPhase();
  const stateBefore = structuredClone(state);
  const instanceId = findPlayerCard(state, 1);

  const result = applyAction(state, {
    type: "call",
    playerId: "player",
    instanceId,
    sacrifices: [],
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.ok, true);
  assert.equal(result.state.players.player.battle.front, instanceId);
  assert.equal(result.state.instances[instanceId].zone, "front");
  assert.equal(result.state.instances[instanceId].faceDown, false);
  assert.equal(result.state.instances[instanceId].turnState.placed, true);
  assert.equal(result.state.actionCallsThisTurn, 1);
  assert.deepEqual(state, stateBefore);
});

test("Lv4+ CALL requires an exact level total and counts face-down Base cards as Lv1", () => {
  const initial = setupInActionPhase();
  const battleLevel3 = findPlayerCard(initial, 3);
  const baseLevel1 = findPlayerCard(initial, 1, [battleLevel3]);
  const baseLevel1Again = findPlayerCard(initial, 1, [battleLevel3, baseLevel1]);
  const calledLevel5 = findPlayerCard(initial, 5, [
    battleLevel3,
    baseLevel1,
    baseLevel1Again,
  ]);
  const state = arrangePlayer(initial, {
    hand: [calledLevel5],
    battle: { front: battleLevel3 },
    base: [baseLevel1, baseLevel1Again],
  });
  const stateBefore = structuredClone(state);

  const invalid = applyAction(state, {
    type: "call",
    playerId: "player",
    instanceId: calledLevel5,
    sacrifices: [battleLevel3, baseLevel1],
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.state, state);

  const result = applyAction(state, {
    type: "call",
    playerId: "player",
    instanceId: calledLevel5,
    sacrifices: [battleLevel3, baseLevel1, baseLevel1Again],
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.ok, true);
  assert.equal(result.state.players.player.battle.front, calledLevel5);
  assert.equal(result.state.players.player.battle.wingLeft, null);
  assert.deepEqual(result.state.players.player.base, []);
  assert.deepEqual(result.state.players.player.retreat, [
    battleLevel3,
    baseLevel1,
    baseLevel1Again,
  ]);
  assert.ok(
    [battleLevel3, baseLevel1, baseLevel1Again].every(
      (id) => result.state.instances[id].zone === "retreat",
    ),
  );
  assert.deepEqual(state, stateBefore);

  const missingMembership = {
    ...state,
    players: {
      ...state.players,
      player: {
        ...state.players.player,
        battle: { ...state.players.player.battle, front: null },
      },
    },
  };
  const missingMembershipResult = applyAction(missingMembership, {
    type: "call",
    playerId: "player",
    instanceId: calledLevel5,
    sacrifices: [battleLevel3, baseLevel1, baseLevel1Again],
  });
  assert.equal(missingMembershipResult.ok, false);
  assert.equal(missingMembershipResult.state, missingMembership);

  const mismatchedZone = {
    ...state,
    instances: {
      ...state.instances,
      [battleLevel3]: {
        ...state.instances[battleLevel3],
        zone: "hand" as const,
      },
    },
  };
  assert.equal(
    getLegalActions(mismatchedZone, "player").some(
      (candidate) =>
        candidate.type === "call" &&
        candidate.instanceId === calledLevel5 &&
        candidate.sacrifices.includes(battleLevel3),
    ),
    false,
  );
});

test("CALL moves sacrificed attachment trees to Retreat", () => {
  const initial = setupInActionPhase();
  const called = findPlayerCard(initial, 4);
  const sacrifice = findPlayerCard(initial, 4, [called]);
  const child = findPlayerCard(initial, 1, [called, sacrifice]);
  const state = arrangePlayer(initial, { hand: [called], battle: { front: sacrifice } });
  attachCard(state, sacrifice, child);

  const result = applyAction(state, {
    type: "call",
    playerId: "player",
    instanceId: called,
    sacrifices: [sacrifice],
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.state.instances[sacrifice].zone, "retreat");
  assert.equal(result.state.instances[child].zone, "retreat");
  assert.equal(result.state.instances[child].attachedTo, sacrifice);
});

test("missing original levels cannot make a CALL legal", () => {
  const initial = setupInActionPhase();
  const calledLevel5 = findPlayerCard(initial, 5);
  const state = arrangePlayer(initial, { hand: [calledLevel5] });
  const instances = { ...state.instances };
  delete instances[calledLevel5].originalLevel;
  const missingLevel = { ...state, instances };

  assert.equal(
    getLegalActions(missingLevel, "player").some(
      (candidate) =>
        candidate.type === "call" && candidate.instanceId === calledLevel5,
    ),
    false,
  );
  const result = applyAction(missingLevel, {
    type: "call",
    playerId: "player",
    instanceId: calledLevel5,
    sacrifices: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, missingLevel);
});

test("CALL is limited to one on the first player's first turn", () => {
  const state = setupInActionPhase();
  const first = findPlayerCard(state, 1);
  const second = findPlayerCard(state, 2, [first]);

  const firstResult = applyAction(state, {
    type: "call",
    playerId: "player",
    instanceId: first,
    sacrifices: [],
  });
  if (!firstResult.ok) throw new Error(firstResult.error.message);
  assert.equal(firstResult.ok, true);

  const secondResult = applyAction(firstResult.state, {
    type: "call",
    playerId: "player",
    instanceId: second,
    sacrifices: [],
  });
  assert.equal(secondResult.ok, false);
  assert.equal(secondResult.state, firstResult.state);
  assert.equal(
    getLegalActions(firstResult.state, "player").some(
      (action) => action.type === "call",
    ),
    false,
  );
});

test("a later turn allows three CALL actions but rejects the fourth", () => {
  let state = {
    ...setupInActionPhase(),
    turnNumber: 2,
  };
  const cards = [
    findPlayerCard(state, 1),
    findPlayerCard(state, 2),
    findPlayerCard(state, 3),
    findPlayerCard(state, 4),
  ];

  for (const instanceId of cards.slice(0, 3)) {
    const result = applyAction(state, {
      type: "call",
      playerId: "player",
      instanceId,
      sacrifices: [],
    });
    if (!result.ok) throw new Error(result.error.message);
    assert.equal(result.ok, true);
    state = result.state;
  }

  assert.equal(state.actionCallsThisTurn, 3);
  const fourth = applyAction(state, {
    type: "call",
    playerId: "player",
    instanceId: cards[3],
    sacrifices: [],
  });
  assert.equal(fourth.ok, false);
  assert.equal(fourth.state, state);
});

test("BATTLE-BASE MOVE is once per Character and excludes a Character placed this turn", () => {
  const initial = setupInActionPhase();
  const existing = findPlayerCard(initial, 1);
  const called = findPlayerCard(initial, 2, [existing]);
  const state = arrangePlayer(initial, {
    hand: [called],
    battle: { front: existing },
  });
  const stateBefore = structuredClone(state);

  const missingMembership = {
    ...state,
    players: {
      ...state.players,
      player: {
        ...state.players.player,
        battle: { ...state.players.player.battle, front: null },
      },
    },
  };
  const missingMembershipResult = applyAction(missingMembership, {
    type: "battle-base-move",
    playerId: "player",
    instanceId: existing,
    destination: "base",
  });
  assert.equal(missingMembershipResult.ok, false);
  assert.equal(missingMembershipResult.state, missingMembership);

  const directBattleMove = applyAction(state, {
    type: "battle-base-move",
    playerId: "player",
    instanceId: existing,
    destination: "back",
  });
  assert.equal(directBattleMove.ok, false);
  assert.equal(directBattleMove.state, state);

  const moved = applyAction(state, {
    type: "battle-base-move",
    playerId: "player",
    instanceId: existing,
    destination: "base",
  });
  if (!moved.ok) throw new Error(moved.error.message);
  assert.equal(moved.ok, true);
  assert.equal(moved.state.players.player.battle.front, null);
  assert.deepEqual(moved.state.players.player.base, [existing]);
  assert.equal(moved.state.instances[existing].zone, "base");
  assert.equal(moved.state.instances[existing].turnState.moved, true);
  assert.deepEqual(state, stateBefore);

  const movedAgain = applyAction(moved.state, {
    type: "battle-base-move",
    playerId: "player",
    instanceId: existing,
    destination: "back",
  });
  assert.equal(movedAgain.ok, false);
  assert.equal(movedAgain.state, moved.state);

  const calledResult = applyAction(moved.state, {
    type: "call",
    playerId: "player",
    instanceId: called,
    sacrifices: [],
  });
  if (!calledResult.ok) throw new Error(calledResult.error.message);
  assert.equal(calledResult.ok, true);
  const movedBeforeCall = structuredClone(moved.state);

  const calledMove = applyAction(calledResult.state, {
    type: "battle-base-move",
    playerId: "player",
    instanceId: called,
    destination: "wingRight",
  });
  assert.equal(calledMove.ok, false);
  assert.equal(calledMove.state, calledResult.state);
  assert.deepEqual(moved.state, movedBeforeCall);
});

test("BATTLE-BASE MOVE hides face-down Base identity from public events", () => {
  const initial = setupInActionPhase();
  const instanceId = findPlayerCard(initial, 1);
  const state = arrangePlayer(initial, {
    battle: { front: instanceId },
  });

  const result = applyAction(state, {
    type: "battle-base-move",
    playerId: "player",
    instanceId,
    destination: "base",
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.ok, true);
  assert.equal(result.state.instances[instanceId].faceDown, true);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].visibility, "public");
  assert.equal("instanceId" in result.events[0].data, false);
  assert.equal(result.events[0].data.destination, "base");
  assert.equal(result.events[1].type, "battle-base-moved-card");
  assert.equal(result.events[1].visibility, "private");
  assert.equal(result.events[1].playerId, "player");
  assert.equal(result.events[1].data.instanceId, instanceId);
});

test("BATTLE-BASE MOVE moves an attached tree with its parent", () => {
  const initial = setupInActionPhase();
  const parent = findPlayerCard(initial, 2);
  const child = findPlayerCard(initial, 1, [parent]);
  const state = arrangePlayer(initial, { battle: { front: parent } });
  attachCard(state, parent, child);

  const result = applyAction(state, {
    type: "battle-base-move",
    playerId: "player",
    instanceId: parent,
    destination: "base",
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.state.instances[parent].zone, "base");
  assert.equal(result.state.instances[child].zone, "base");
  assert.equal(result.state.instances[child].attachedTo, parent);
});

test("legal BATTLE-BASE MOVE actions require matching field membership", () => {
  const initial = setupInActionPhase();
  const battleInstanceId = findPlayerCard(initial, 1);
  const battleState = arrangePlayer(initial, {
    battle: { front: battleInstanceId },
  });
  const malformedBattle = {
    ...battleState,
    instances: {
      ...battleState.instances,
      [battleInstanceId]: {
        ...battleState.instances[battleInstanceId],
        zone: "base" as const,
      },
    },
  };
  assert.equal(
    getLegalActions(malformedBattle, "player").some(
      (action) =>
        action.type === "battle-base-move" &&
        action.instanceId === battleInstanceId,
    ),
    false,
  );

  const baseInstanceId = findPlayerCard(initial, 2, [battleInstanceId]);
  const baseState = arrangePlayer(initial, {
    base: [baseInstanceId],
    basePlaced: false,
  });
  const malformedBase = {
    ...baseState,
    instances: {
      ...baseState.instances,
      [baseInstanceId]: {
        ...baseState.instances[baseInstanceId],
        zone: "front" as const,
      },
    },
  };
  assert.equal(
    getLegalActions(malformedBase, "player").some(
      (action) =>
        action.type === "battle-base-move" &&
        action.instanceId === baseInstanceId,
    ),
    false,
  );
});

test("duplicate Battle and Base membership rejects moves", () => {
  const initial = setupInActionPhase();
  const instanceId = findPlayerCard(initial, 1);
  const state = arrangePlayer(initial, {
    battle: { front: instanceId },
    base: [instanceId],
    basePlaced: false,
  });

  assert.equal(
    getLegalActions(state, "player").some(
      (action) =>
        action.type === "battle-base-move" &&
        action.instanceId === instanceId,
    ),
    false,
  );

  const result = applyAction(state, {
    type: "battle-base-move",
    playerId: "player",
    instanceId,
    destination: "base",
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
});

test("legal actions include Base-to-Battle moves when Base is full", () => {
  const initial = setupInActionPhase();
  const base: string[] = [];
  for (const level of [1, 2, 3, 4, 5, 6]) {
    base.push(findPlayerCard(initial, level, base));
  }
  const state = arrangePlayer(initial, { base, basePlaced: false });
  const move = getLegalActions(state, "player").find(
    (candidate) =>
      candidate.type === "battle-base-move" &&
      candidate.instanceId === base[0] &&
      candidate.destination === "front",
  );

  assert.ok(move);
  const result = applyAction(state, move);
  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.state.players.player.battle.front, base[0]);
  assert.deepEqual(result.state.players.player.base, base.slice(1));
});

test("hand-limit enforcement moves attached trees with discarded parents", () => {
  const initial = setupInActionPhase();
  const playerCards = Object.values(initial.instances).filter(
    (instance) => instance.ownerId === "player" && instance.zone !== "rushPointDeck",
  );
  const hand = playerCards.slice(0, 10).map((instance) => instance.instanceId);
  const deck = playerCards.slice(10, 14).map((instance) => instance.instanceId);
  const voidIds = playerCards.slice(14).map((instance) => instance.instanceId);
  const parent = hand[9]!;
  const child = voidIds[0]!;
  const state = arrangePlayer(initial, { hand, deck, void: voidIds });
  attachCard(state, parent, child);
  state.phase = "counter";
  state.actionWindow = "counter-phase";
  state.priorityPlayer = "bot";
  state.pendingChoice = null;
  state.battle = {
    attackerId: null,
    attackerSlot: null,
    targetId: null,
    targetSlot: null,
    consecutivePasses: 1,
    resolved: false,
    outcome: null,
  };

  const result = applyAction(state, { type: "counter-pass", playerId: "bot" });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.state.players.player.hand.length, 9);
  assert.equal(result.state.instances[parent].zone, "retreat");
  assert.equal(result.state.instances[child].zone, "retreat");
  assert.equal(result.state.instances[child].attachedTo, parent);
});

test("field actions follow controller even when owner differs", () => {
  const initial = setupInActionPhase();
  const controlled = findPlayerCard(initial, 1);
  const arranged = arrangePlayer(initial, {
    battle: { front: controlled },
  });
  const instances = {
    ...arranged.instances,
    [controlled]: {
      ...arranged.instances[controlled],
      ownerId: "bot" as const,
      controllerId: "player" as const,
    },
  };
  const state = { ...arranged, instances };

  const result = applyAction(state, {
    type: "battle-base-move",
    playerId: "player",
    instanceId: controlled,
    destination: "base",
  });
  if (!result.ok) throw new Error(result.error.message);
  assert.deepEqual(result.state.players.player.base, [controlled]);
});

test("ending Action Phase opens the active player's Battle Phase", () => {
  const state = {
    ...setupInActionPhase(),
    turnNumber: 2,
    baseDeploymentUsed: true,
    actionCallsThisTurn: 2,
  };
  const stateBefore = structuredClone(state);

  const result = applyAction(state, {
    type: "end-action-phase",
    playerId: "player",
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.ok, true);
  assert.equal(result.state.phase, "battle");
  assert.equal(result.state.actionWindow, "battle-rearrange");
  assert.equal(result.state.activePlayer, "player");
  assert.equal(result.state.priorityPlayer, "player");
  assert.equal(result.state.turnNumber, 2);
  assert.equal(result.state.actionCallsThisTurn, 2);
  assert.equal(result.state.baseDeploymentUsed, true);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["action-phase-ended", "battle-phase-started"],
  );
  assert.deepEqual(state, stateBefore);
});

test("End Phase does not advance the turn after an effect causes deck-out", () => {
  const definitions = new Map(fixtureSetup.definitions);
  const sourceDefinition = definitions.get("card-11");
  assert.ok(sourceDefinition);
  definitions.set("card-11", {
    ...sourceDefinition,
    abilityText:
      "TRIG【FIELD】:When this card enters the field by calling, you draw 1 card. If you do, this card gets the second chance to attack character only in this turn.",
  });
  const state = setupGame({ ...fixtureSetup, definitions });
  const playerCards = Object.values(state.instances).filter(
    (instance) => instance.ownerId === "player" && instance.zone !== "rushPointDeck",
  );
  const source = playerCards.find((instance) => instance.cardCode === "BP01-011");
  const sacrifice = playerCards.find((instance) => instance.cardCode === "BP01-005");
  const topDeck = playerCards.find(
    (instance) =>
      instance.instanceId !== source?.instanceId &&
      instance.instanceId !== sacrifice?.instanceId,
  );
  assert.ok(source);
  assert.ok(sacrifice);
  assert.ok(topDeck);
  const voidIds = playerCards
    .filter(
      (instance) =>
        instance.instanceId !== source.instanceId &&
        instance.instanceId !== sacrifice.instanceId &&
        instance.instanceId !== topDeck.instanceId,
    )
    .map((instance) => instance.instanceId);
  state.players.player = {
    ...state.players.player,
    deck: [topDeck.instanceId],
    hand: [source.instanceId],
    base: [],
    timeline: [],
    retreat: [],
    void: voidIds,
    battle: { front: sacrifice.instanceId, wingLeft: null, wingRight: null, back: null },
  };
  for (const instance of playerCards) {
    state.instances[instance.instanceId] = {
      ...state.instances[instance.instanceId],
      zone:
        instance.instanceId === source.instanceId
          ? "hand"
          : instance.instanceId === sacrifice.instanceId
            ? "front"
          : instance.instanceId === topDeck.instanceId
            ? "deck"
            : "void",
      faceDown: instance.instanceId === topDeck.instanceId,
    };
  }
  state.phase = "action";
  state.actionWindow = "action";
  state.priorityPlayer = "player";
  state.pendingChoice = null;
  state.battle = null;
  state.pendingEndPhase = true;
  state.resolutionQueue = [];

  const result = applyAction(state, {
    type: "call",
    playerId: "player",
    instanceId: source.instanceId,
    sacrifices: [sacrifice.instanceId],
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.state.winner, "bot");
  assert.equal(result.state.phase, "game-over");
  assert.equal(result.state.actionWindow, "game-over");
  assert.equal(result.state.turnNumber, 1);
  assert.equal(result.state.pendingEndPhase, true);
});

function setupInActionPhase(): GameState {
  const initial = setupGame(fixtureSetup);
  const playerCards = Object.values(initial.instances).filter(
    (instance) =>
      instance.ownerId === "player" && instance.zone !== "rushPointDeck",
  );
  const hand = playerCards.slice(0, 8).map((instance) => instance.instanceId);
  const deck = playerCards.slice(8).map((instance) => instance.instanceId);

  return arrangePlayer(
    {
      ...initial,
      phase: "action",
      actionWindow: "action",
      activePlayer: "player",
      priorityPlayer: "player",
      pendingChoice: null,
      turnNumber: 1,
      actionCallsThisTurn: 0,
      baseDeploymentUsed: false,
    },
    { hand, deck },
  );
}

function arrangePlayer(
  state: GameState,
  zones: {
    hand?: readonly string[];
    deck?: readonly string[];
    void?: readonly string[];
    battle?: Partial<Record<BattleSlot, string>>;
    base?: readonly string[];
    basePlaced?: boolean;
  },
): GameState {
  const playerCards = Object.values(state.instances).filter(
    (instance) =>
      instance.ownerId === "player" && instance.zone !== "rushPointDeck",
  );
  const hand = zones.hand ?? [];
  const battle: Record<BattleSlot, string | null> = {
    front: zones.battle?.front ?? null,
    wingLeft: zones.battle?.wingLeft ?? null,
    wingRight: zones.battle?.wingRight ?? null,
    back: zones.battle?.back ?? null,
  };
  const battleIds = BATTLE_SLOTS.flatMap((slot) => {
    const instanceId = battle[slot];
    return instanceId === null ? [] : [instanceId];
  });
  const base = zones.base ?? [];
  const voidIds = zones.void ?? [];
  const placed = new Set([...hand, ...battleIds, ...base, ...voidIds]);
  const deck = zones.deck ?? playerCards
    .map((instance) => instance.instanceId)
    .filter((instanceId) => !placed.has(instanceId));
  const instances = { ...state.instances };

  for (const instance of playerCards) {
    const instanceId = instance.instanceId;
    const slot = BATTLE_SLOTS.find((candidate) => battle[candidate] === instanceId);
    const zone =
      slot ??
      (hand.includes(instanceId)
        ? "hand"
        : base.includes(instanceId)
          ? "base"
          : voidIds.includes(instanceId)
            ? "void"
            : "deck");
    instances[instanceId] = {
      ...instance,
      zone,
      faceDown: zone === "deck" || zone === "base",
      turnState: {
        ...instance.turnState,
        placed: zone === "base" && zones.basePlaced !== false,
        moved: false,
      },
    };
  }

  return {
    ...state,
    instances,
    players: {
      ...state.players,
      player: {
        ...state.players.player,
        deck,
        hand,
        battle,
        base,
        retreat: [],
        void: [...voidIds],
      },
    },
  };
}

function attachCard(state: GameState, parentId: string, childId: string): void {
  for (const player of Object.values(state.players)) {
    player.deck = player.deck.filter((instanceId) => instanceId !== childId);
    player.hand = player.hand.filter((instanceId) => instanceId !== childId);
    player.base = player.base.filter((instanceId) => instanceId !== childId);
    player.timeline = player.timeline.filter((instanceId) => instanceId !== childId);
    player.retreat = player.retreat.filter((instanceId) => instanceId !== childId);
    player.void = player.void.filter((instanceId) => instanceId !== childId);
    player.rushPointDeck = player.rushPointDeck.filter((instanceId) => instanceId !== childId);
    for (const slot of BATTLE_SLOTS) {
      if (player.battle[slot] === childId) player.battle[slot] = null;
    }
  }
  const parent = state.instances[parentId];
  const child = state.instances[childId];
  state.instances[parentId] = {
    ...parent,
    attachmentIds: parent.attachmentIds.includes(childId)
      ? parent.attachmentIds
      : [...parent.attachmentIds, childId],
  };
  state.instances[childId] = {
    ...child,
    zone: parent.zone,
    faceDown: parent.faceDown,
    attachedTo: parentId,
  };
}

function findPlayerCard(
  state: GameState,
  level: number,
  excluded: readonly string[] = [],
): string {
  const excludedSet = new Set(excluded);
  const instance = Object.values(state.instances).find(
    (candidate) =>
      candidate.ownerId === "player" &&
      candidate.zone !== "rushPointDeck" &&
      !excludedSet.has(candidate.instanceId) &&
      definitionFor(candidate.cardCode).level === level,
  );

  if (!instance) throw new Error(`missing fixture card at level ${level}`);
  return instance.instanceId;
}

function definitionFor(cardCode: string): SimulatorCardDefinition {
  const definition = definitionsList.find(
    (candidate) => candidate.cardCode === cardCode,
  );
  if (!definition) throw new Error(`missing fixture definition ${cardCode}`);
  return definition;
}
