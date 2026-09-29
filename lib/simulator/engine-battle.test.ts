import assert from "node:assert/strict";
import test from "node:test";

import { applyAction, getLegalActions, setupGame } from "./engine";
import type {
  BattleSlot,
  BattleOutcome,
  BattleTarget,
  GameAction,
  GameState,
  PlayerId,
  SimulatorCardDefinition,
  SimulatorDeckEntry,
} from "./types";
import { getLegalBattleTargets } from "./rules";

const BATTLE_SLOTS: readonly BattleSlot[] = [
  "front",
  "wingLeft",
  "wingRight",
  "back",
];

const definitionsList: SimulatorCardDefinition[] = Array.from(
  { length: 17 },
  (_, index) => ({
    cardId: `card-${index + 1}`,
    cardCode: `BP01-${String(index + 1).padStart(3, "0")}`,
    name: `Battle Fixture ${index + 1}`,
    colorCode: "red",
    level: (index % 6) + 1,
    power: 1000 + index * 100,
    range: index % 4,
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

test("a successful Weakness attack moves one Rush Point to Timeline", () => {
  const state = setupWeaknessAttackState();
  const attackerId = state.players.player.battle.front;
  assert.ok(attackerId);

  const result = applyActionsForTest(state, [
    declareAttack("player", attackerId),
    selectTarget("player", "weakness:front"),
    counterPass("bot"),
    counterPass("player"),
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.state.players.player.timeline.length, 1);
  assert.equal(result.state.actionWindow, "battle-confirmation");
});

test("legal targets use current Range and Front, Wing, Back distance", () => {
  for (const range of [0, 1, 2, 3]) {
    const attackerCode = `BP01-${String(range + 1).padStart(3, "0")}`;
    const state = setupBattleState({
      playerBattle: { front: cardForCode("player", attackerCode) },
      botBattle: {
        front: cardForCode("bot", "BP01-005"),
        wingLeft: cardForCode("bot", "BP01-006"),
        wingRight: cardForCode("bot", "BP01-007"),
        back: cardForCode("bot", "BP01-008"),
      },
    });
    const attackerId = state.players.player.battle.front;
    assert.ok(attackerId);

    const declared = applyAction(state, declareAttack("player", attackerId));
    if (!declared.ok) throw new Error(declared.error.message);
    const targets = getLegalActions(declared.state, "player")
      .filter((action) => action.type === "select-attack-target")
      .map((action) => action.targetId);
    const expected = [
      state.players.bot.battle.front,
      ...(range >= 1 ? [state.players.bot.battle.wingLeft] : []),
      ...(range >= 2 ? [state.players.bot.battle.wingRight] : []),
      ...(range >= 3 ? [state.players.bot.battle.back] : []),
    ];

    assert.deepEqual(targets, expected);
  }
});

test("a current Range modifier expands target legality", () => {
  const attackerId = cardForCode("player", "BP01-001");
  const state = setupBattleState({
    playerBattle: { front: attackerId },
    botBattle: { wingLeft: cardForCode("bot", "BP01-005") },
  });
  state.instances[attackerId] = {
    ...state.instances[attackerId],
    modifiers: [
      {
        attribute: "range",
        amount: 1,
        expiresAtTurn: null,
      },
    ],
  };

  const declared = applyAction(state, declareAttack("player", attackerId));
  if (!declared.ok) throw new Error(declared.error.message);
  assert.ok(
    getLegalActions(declared.state, "player").some(
      (action) =>
        action.type === "select-attack-target" &&
        action.targetId === state.players.bot.battle.wingLeft,
    ),
  );
});

test("unavailable targets are rejected while reachable empty slots are Weakness", () => {
  const attackerId = cardForCode("player", "BP01-002");
  const targetId = cardForCode("bot", "BP01-005");
  const state = setupBattleState({
    playerBattle: { front: attackerId },
    botBattle: { front: targetId },
  });
  const declared = applyAction(state, declareAttack("player", attackerId));
  if (!declared.ok) throw new Error(declared.error.message);

  const legalTargets = getLegalActions(declared.state, "player")
    .filter((action) => action.type === "select-attack-target")
    .map((action) => action.targetId);
  assert.deepEqual(legalTargets, [targetId, "weakness:wingLeft"]);

  const invalid = applyAction(
    declared.state,
    selectTarget("player", "weakness:back"),
  );
  assert.equal(invalid.ok, false);
  assert.equal(invalid.state, declared.state);
});

test("a character-only attack cannot be declared when only Weakness is reachable", () => {
  const attackerId = cardForCode("player", "BP01-011");
  const state = setupBattleState({
    playerBattle: { front: attackerId },
    botBattle: {},
  });
  state.instances[attackerId] = {
    ...state.instances[attackerId],
    turnState: {
      ...state.instances[attackerId].turnState,
      attacked: true,
      additionalAttacks: 1,
      attackCharactersOnly: true,
    },
  };
  const before = JSON.stringify(state);

  assert.deepEqual(
    getLegalActions(state, "player").filter((action) => action.type === "declare-attack"),
    [],
  );
  const result = applyAction(state, declareAttack("player", attackerId));

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result.state), before);
});

test("rearrangement changes Battle slots once and preserves attack eligibility", () => {
  const front = cardForCode("player", "BP01-001");
  const back = cardForCode("player", "BP01-002");
  const state = setupBattleState({
    playerBattle: { front, back },
    botBattle: {},
  });
  const rearrangeState = {
    ...state,
    actionWindow: "battle-rearrange" as const,
    battleRearrangementUsed: false,
  };

  const result = applyAction(rearrangeState, {
    type: "rearrange-battle",
    playerId: "player",
    order: { front: back, wingLeft: null, wingRight: null, back: front },
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.state.players.player.battle.front, back);
  assert.equal(result.state.players.player.battle.back, front);
  assert.equal(result.state.instances[front].zone, "back");
  assert.equal(result.state.instances[back].zone, "front");
  assert.equal(result.state.battleRearrangementUsed, true);
  assert.equal(result.state.actionWindow, "battle-select-attacker");
  assert.deepEqual(state.players.player.battle, {
    front,
    wingLeft: null,
    wingRight: null,
    back,
  });
});

test("battle rearrangement moves an attached tree with its parent", () => {
  const parent = cardForCode("player", "BP01-001");
  const child = cardForCode("player", "BP01-002");
  const state = setupBattleState({
    playerBattle: { front: parent },
    botBattle: {},
  });
  attachCard(state, parent, child);

  const result = applyAction(
    { ...state, actionWindow: "battle-rearrange", battleRearrangementUsed: false },
    {
      type: "rearrange-battle",
      playerId: "player",
      order: { front: null, wingLeft: parent, wingRight: null, back: null },
    },
  );

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.state.instances[parent].zone, "wingLeft");
  assert.equal(result.state.instances[child].zone, "wingLeft");
  assert.equal(result.state.instances[child].attachedTo, parent);
});

test("attacks resolve Front, either Wing, then Back and only once per Character", () => {
  const front = cardForCode("player", "BP01-001");
  const left = cardForCode("player", "BP01-002");
  const right = cardForCode("player", "BP01-003");
  const back = cardForCode("player", "BP01-004");
  let state = setupBattleState({
    playerBattle: { front, wingLeft: left, wingRight: right, back },
    botBattle: {},
  });

  assert.deepEqual(
    getLegalActions(state, "player")
      .filter((action) => action.type === "declare-attack")
      .map((action) => action.attackerId),
    [front],
  );

  state = completeWeaknessAttack(state, front);
  assert.deepEqual(
    getLegalActions(state, "player")
      .filter((action) => action.type === "declare-attack")
      .map((action) => action.attackerId),
    [left, right],
  );

  state = completeWeaknessAttack(state, right);
  assert.deepEqual(
    getLegalActions(state, "player")
      .filter((action) => action.type === "declare-attack")
      .map((action) => action.attackerId),
    [left],
  );

  state = completeWeaknessAttack(state, left);
  assert.deepEqual(
    getLegalActions(state, "player")
      .filter((action) => action.type === "declare-attack")
      .map((action) => action.attackerId),
    [back],
  );

  const declared = applyAction(state, declareAttack("player", back));
  if (!declared.ok) throw new Error(declared.error.message);
  assert.equal(declared.state.instances[back].turnState.attacked, true);
});

test("equal Power retreats both Characters", () => {
  const attackerId = cardForCode("player", "BP01-004");
  const targetId = cardForCode("bot", "BP01-005");
  const state = withPower(
    setupBattleState({
      playerBattle: { front: attackerId },
      botBattle: { back: targetId },
    }),
    attackerId,
    targetId,
    3000,
  );
  const result = resolveBattle(state, attackerId, targetId);

  assert.deepEqual(result.state.players.player.battle.front, null);
  assert.deepEqual(result.state.players.bot.battle.back, null);
  assert.deepEqual(result.state.players.player.retreat, [attackerId]);
  assert.deepEqual(result.state.players.bot.retreat, [targetId]);
});

test("higher Power retreats the defender and lower Power retreats the attacker", () => {
  const attackerId = cardForCode("player", "BP01-004");
  const targetId = cardForCode("bot", "BP01-005");
  const attackerWins = withPower(
    setupBattleState({
      playerBattle: { front: attackerId },
      botBattle: { back: targetId },
    }),
    attackerId,
    targetId,
    4000,
    3000,
  );
  const attackerResult = resolveBattle(attackerWins, attackerId, targetId);
  assert.equal(attackerResult.state.players.player.battle.front, attackerId);
  assert.equal(attackerResult.state.players.bot.battle.back, null);
  assert.deepEqual(attackerResult.state.players.bot.retreat, [targetId]);

  const defenderWins = withPower(
    setupBattleState({
      playerBattle: { front: attackerId },
      botBattle: { back: targetId },
    }),
    attackerId,
    targetId,
    2000,
    3000,
  );
  const defenderResult = resolveBattle(defenderWins, attackerId, targetId);
  assert.equal(defenderResult.state.players.player.battle.front, null);
  assert.equal(defenderResult.state.players.bot.battle.back, targetId);
  assert.deepEqual(defenderResult.state.players.player.retreat, [attackerId]);
});

test("battle retreat moves an attached tree with the retreating Character", () => {
  const attackerId = cardForCode("player", "BP01-004");
  const targetId = cardForCode("bot", "BP01-005");
  const childId = cardForCode("player", "BP01-002");
  const state = setupBattleState({
    playerBattle: { front: attackerId },
    botBattle: { back: targetId },
  });
  attachCard(state, attackerId, childId);
  const result = resolveBattle(
    withPower(state, attackerId, targetId, 2000, 3000),
    attackerId,
    targetId,
  );

  assert.equal(result.state.instances[attackerId].zone, "retreat");
  assert.equal(result.state.instances[childId].zone, "retreat");
  assert.equal(result.state.instances[childId].attachedTo, attackerId);
});

test("Counter Step gives the opponent priority and confirmation advances the battle", () => {
  const state = setupWeaknessAttackState();
  const attackerId = state.players.player.battle.front;
  assert.ok(attackerId);
  const declared = applyAction(state, declareAttack("player", attackerId));
  if (!declared.ok) throw new Error(declared.error.message);
  const selected = applyAction(
    declared.state,
    selectTarget("player", "weakness:front"),
  );
  if (!selected.ok) throw new Error(selected.error.message);
  assert.equal(selected.state.actionWindow, "battle-counter");
  assert.equal(selected.state.priorityPlayer, "bot");

  const firstPass = applyAction(selected.state, counterPass("bot"));
  if (!firstPass.ok) throw new Error(firstPass.error.message);
  assert.equal(firstPass.state.priorityPlayer, "player");
  assert.equal(firstPass.state.players.player.timeline.length, 0);

  const secondPass = applyAction(firstPass.state, counterPass("player"));
  if (!secondPass.ok) throw new Error(secondPass.error.message);
  assert.equal(secondPass.state.actionWindow, "battle-confirmation");
  assert.equal(secondPass.state.priorityPlayer, "player");

  const confirmed = applyAction(secondPass.state, battleConfirmation("player"));
  if (!confirmed.ok) throw new Error(confirmed.error.message);
  assert.equal(confirmed.state.phase, "counter");
  assert.equal(confirmed.state.actionWindow, "counter-phase");
});

test("Counter CALL is legal in both counter windows without consuming Action CALLs", () => {
  const attackerId = cardForCode("player", "BP01-001");
  const targetId = cardForCode("bot", "BP01-005");
  const battleState = setupBattleState({
    playerBattle: { front: attackerId },
    botBattle: { front: targetId },
  });
  const botCard = cardForCode("bot", "BP01-002");
  const normalBotCard = cardForCode("bot", "BP01-003");
  const counterCallText =
    "COUNTER(AUTO【HAND】: This card may be called in COUNTER PHASE or COUNTER STEP.)";
  const botCardMetadata = battleState.cardMetadata?.["BP01-002"];
  const normalBotCardMetadata = battleState.cardMetadata?.["BP01-003"];
  assert.ok(botCardMetadata);
  assert.ok(normalBotCardMetadata);
  battleState.cardMetadata = {
    ...battleState.cardMetadata,
    "BP01-002": { ...botCardMetadata, abilityText: counterCallText },
    "BP01-003": { ...normalBotCardMetadata, abilityText: null },
  };
  battleState.players.bot.deck = battleState.players.bot.deck.filter(
    (instanceId) => instanceId !== botCard && instanceId !== normalBotCard,
  );
  battleState.players.bot.hand = [botCard, normalBotCard];
  battleState.instances[botCard] = {
    ...battleState.instances[botCard],
    zone: "hand",
    faceDown: false,
  };
  battleState.instances[normalBotCard] = {
    ...battleState.instances[normalBotCard],
    zone: "hand",
    faceDown: false,
  };

  const declared = applyAction(battleState, declareAttack("player", attackerId));
  if (!declared.ok) throw new Error(declared.error.message);
  const selected = applyAction(
    declared.state,
    selectTarget("player", targetId),
  );
  if (!selected.ok) throw new Error(selected.error.message);

  const battleCounterCall = getLegalActions(selected.state, "bot").find(
    (action) => action.type === "counter-call" && action.instanceId === botCard,
  );
  assert.ok(battleCounterCall);
  assert.equal(
    getLegalActions(selected.state, "bot").some(
      (action) => action.type === "counter-call" && action.instanceId === normalBotCard,
    ),
    false,
  );
  const battleResult = applyAction(selected.state, battleCounterCall);
  if (!battleResult.ok) throw new Error(battleResult.error.message);
  assert.equal(battleResult.state.actionWindow, "battle-counter");
  assert.equal(battleResult.state.priorityPlayer, "player");
  assert.equal(battleResult.state.actionCallsThisTurn, 0);
  assert.equal(battleResult.state.players.bot.battle.wingLeft, botCard);
  assert.equal(battleResult.events[0]?.type, "called");
  assert.equal(battleResult.events[0]?.data.counter, true);

  const counterPhaseState = setupBattleState({
    playerBattle: {},
    botBattle: {},
  });
  const playerCard = cardForCode("player", "BP01-002");
  const normalPlayerCard = cardForCode("player", "BP01-003");
  const playerCardMetadata = counterPhaseState.cardMetadata?.["BP01-002"];
  const normalPlayerCardMetadata = counterPhaseState.cardMetadata?.["BP01-003"];
  assert.ok(playerCardMetadata);
  assert.ok(normalPlayerCardMetadata);
  counterPhaseState.cardMetadata = {
    ...counterPhaseState.cardMetadata,
    "BP01-002": { ...playerCardMetadata, abilityText: counterCallText },
    "BP01-003": { ...normalPlayerCardMetadata, abilityText: null },
  };
  counterPhaseState.players.player.deck = counterPhaseState.players.player.deck.filter(
    (instanceId) => instanceId !== playerCard && instanceId !== normalPlayerCard,
  );
  counterPhaseState.players.player.hand = [playerCard, normalPlayerCard];
  counterPhaseState.instances[playerCard] = {
    ...counterPhaseState.instances[playerCard],
    zone: "hand",
    faceDown: false,
  };
  counterPhaseState.instances[normalPlayerCard] = {
    ...counterPhaseState.instances[normalPlayerCard],
    zone: "hand",
    faceDown: false,
  };
  counterPhaseState.phase = "counter";
  counterPhaseState.actionWindow = "counter-phase";
  counterPhaseState.priorityPlayer = "player";
  counterPhaseState.actionCallsThisTurn = 3;
  counterPhaseState.battle = {
    attackerId: null,
    attackerSlot: null,
    targetId: null,
    targetSlot: null,
    consecutivePasses: 0,
    resolved: false,
    outcome: null,
  };

  const counterPhaseActions = getLegalActions(counterPhaseState, "player");
  assert.equal(
    counterPhaseActions.some(
      (action) => action.type === "counter-call" && action.instanceId === playerCard,
    ),
    true,
  );
  assert.equal(
    counterPhaseActions.some(
      (action) => action.type === "counter-call" && action.instanceId === normalPlayerCard,
    ),
    false,
  );
  assert.equal(counterPhaseActions.some((action) => action.type === "call"), false);

  const counterPhaseCall = counterPhaseActions.find(
    (action) => action.type === "counter-call" && action.instanceId === playerCard,
  );
  assert.ok(counterPhaseCall);
  const counterPhaseResult = applyAction(counterPhaseState, counterPhaseCall);
  if (!counterPhaseResult.ok) throw new Error(counterPhaseResult.error.message);
  assert.equal(counterPhaseResult.state.actionCallsThisTurn, 3);
  assert.equal(counterPhaseResult.state.priorityPlayer, "bot");
  assert.equal(counterPhaseResult.state.players.player.battle.front, playerCard);
  assert.equal(counterPhaseResult.events[0]?.data.counter, true);

  const forgedNormalCall = applyAction(counterPhaseState, {
    type: "counter-call",
    playerId: "player",
    instanceId: normalPlayerCard,
    sacrifices: [],
  });
  assert.equal(forgedNormalCall.ok, false);
  assert.equal(forgedNormalCall.state, counterPhaseState);

  const actionState = {
    ...counterPhaseState,
    phase: "action" as const,
    actionWindow: "action" as const,
    battle: null,
  };
  const rejected = applyAction(actionState, counterPhaseCall);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.state, actionState);
});

test("the first player skips the first Battle Phase", () => {
  const state = {
    ...setupBattleState({ playerBattle: {}, botBattle: {} }),
    phase: "action" as const,
    actionWindow: "action" as const,
    turnNumber: 1,
    battleRearrangementUsed: false,
  };
  const result = applyAction(state, {
    type: "end-action-phase",
    playerId: "player",
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.state.phase, "counter");
  assert.equal(result.state.actionWindow, "counter-phase");
  assert.equal(result.state.priorityPlayer, "player");
});

test("a successful Weakness attack wins at nine Timeline points", () => {
  const state = setupWeaknessAttackState();
  const attackerId = state.players.player.battle.front;
  assert.ok(attackerId);
  const timeline = state.players.player.rushPointDeck.slice(0, 8);
  const rushPointDeck = state.players.player.rushPointDeck.slice(8);
  const instances = { ...state.instances };
  for (const instanceId of timeline) {
    instances[instanceId] = { ...instances[instanceId], zone: "timeline" };
  }
  const winningState = {
    ...state,
    instances,
    players: {
      ...state.players,
      player: {
        ...state.players.player,
        timeline,
        rushPointDeck,
      },
    },
  };
  const result = applyActionsForTest(winningState, [
    declareAttack("player", attackerId),
    selectTarget("player", "weakness:front"),
    counterPass("bot"),
    counterPass("player"),
  ]);

  assert.equal(result.state.winner, "player");
  assert.equal(result.state.phase, "game-over");
  assert.equal(result.state.actionWindow, "game-over");
});

test("reaching an empty deck after a rule draw ends the game", () => {
  const initial = setupBattleState({ playerBattle: {}, botBattle: {} });
  const handId = initial.players.player.deck[0];
  const deckId = initial.players.player.deck[1];
  assert.ok(handId);
  assert.ok(deckId);
  const voidIds = initial.players.player.deck.filter(
    (instanceId) => instanceId !== handId && instanceId !== deckId,
  );
  const instances = {
    ...initial.instances,
    [handId]: { ...initial.instances[handId], zone: "hand" as const },
    [deckId]: { ...initial.instances[deckId], zone: "deck" as const },
  };
  for (const instanceId of voidIds) {
    instances[instanceId] = { ...instances[instanceId], zone: "void" };
  }
  const state = {
    ...initial,
    phase: "action" as const,
    actionWindow: "action" as const,
    activePlayer: "player" as const,
    priorityPlayer: "player" as const,
    instances,
    players: {
      ...initial.players,
      player: {
        ...initial.players.player,
        hand: [handId],
        deck: [deckId],
        void: voidIds,
      },
    },
  };

  const result = applyAction(state, {
    type: "base-deploy",
    playerId: "player",
    instanceId: handId,
  });

  if (!result.ok) throw new Error(result.error.message);
  assert.equal(result.state.winner, "bot");
  assert.equal(result.state.phase, "game-over");
});

test("End Phase removes expired modifiers and enforces the nine-card hand limit", () => {
  const initial = setupBattleState({ playerBattle: {}, botBattle: {} });
  const hand = initial.players.player.deck.slice(0, 10);
  const deck = initial.players.player.deck.slice(10);
  const extra = hand[9];
  assert.ok(extra);
  const instances = { ...initial.instances };
  for (const instanceId of hand) {
    instances[instanceId] = {
      ...instances[instanceId],
      zone: "hand",
      modifiers:
        instanceId === hand[0]
          ? [{ attribute: "power", amount: 500, expiresAtTurn: 2 }]
          : [],
    };
  }
  for (const instanceId of deck) {
    instances[instanceId] = { ...instances[instanceId], zone: "deck" };
  }
  const state = {
    ...initial,
    phase: "counter" as const,
    actionWindow: "counter-phase" as const,
    activePlayer: "player" as const,
    priorityPlayer: "player" as const,
    turnNumber: 2,
    battle: {
      attackerId: null,
      attackerSlot: null,
      targetId: null,
      targetSlot: null,
      consecutivePasses: 0,
      resolved: false,
      outcome: null,
    },
    instances,
    players: {
      ...initial.players,
      player: {
        ...initial.players.player,
        hand,
        deck,
        retreat: [],
      },
    },
  };

  const firstPass = applyAction(state, counterPass("player"));
  if (!firstPass.ok) throw new Error(firstPass.error.message);
  const result = applyAction(firstPass.state, counterPass("bot"));
  if (!result.ok) throw new Error(result.error.message);

  assert.equal(result.state.players.player.hand.length, 9);
  assert.deepEqual(result.state.players.player.retreat, [extra]);
  assert.deepEqual(result.state.instances[hand[0]].modifiers, []);
  assert.equal(result.state.activePlayer, "bot");
  assert.equal(result.state.phase, "action");
});

test("stale attacker context is rejected without mutation", () => {
  const state = setupWeaknessAttackState();
  const attackerId = state.players.player.battle.front;
  assert.ok(attackerId);
  const stale = {
    ...state,
    actionWindow: "battle-counter" as const,
    priorityPlayer: "bot" as const,
    players: {
      ...state.players,
      player: {
        ...state.players.player,
        battle: { ...state.players.player.battle, front: null },
      },
    },
    battle: {
      attackerId,
      attackerSlot: "front" as const,
      targetId: "weakness:front" as const,
      targetSlot: "front" as const,
      consecutivePasses: 1,
      resolved: false,
      outcome: null,
    },
  };

  const result = applyAction(stale, counterPass("bot"));
  assert.equal(result.ok, false);
  assert.equal(result.state, stale);
  assert.equal(result.state.players.player.timeline.length, 0);
});

test("stale target membership is rejected without mutation", () => {
  const attackerId = cardForCode("player", "BP01-001");
  const targetId = cardForCode("bot", "BP01-005");
  const state = setupBattleState({
    playerBattle: { front: attackerId },
    botBattle: { front: targetId },
  });
  const stale = {
    ...state,
    actionWindow: "battle-counter" as const,
    priorityPlayer: "bot" as const,
    players: {
      ...state.players,
      bot: {
        ...state.players.bot,
        battle: { ...state.players.bot.battle, front: null },
      },
    },
    battle: {
      attackerId,
      attackerSlot: "front" as const,
      targetId,
      targetSlot: "front" as const,
      consecutivePasses: 1,
      resolved: false,
      outcome: null,
    },
  };

  const result = applyAction(stale, counterPass("bot"));
  assert.equal(result.ok, false);
  assert.equal(result.state, stale);
});

test("forged Weakness tokens cannot resolve or move Rush Points", () => {
  const state = setupWeaknessAttackState();
  const attackerId = state.players.player.battle.front;
  assert.ok(attackerId);
  const forged = {
    ...state,
    actionWindow: "battle-counter" as const,
    priorityPlayer: "bot" as const,
    battle: {
      attackerId,
      attackerSlot: "front" as const,
      targetId: "weakness:front:forged" as BattleTarget,
      targetSlot: "front" as const,
      consecutivePasses: 1,
      resolved: false,
      outcome: null,
    },
  };

  const result = applyAction(forged, counterPass("bot"));
  assert.equal(result.ok, false);
  assert.equal(result.state, forged);
  assert.equal(result.state.players.player.timeline.length, 0);
});

test("battle confirmation requires a resolved battle after two passes", () => {
  const state = setupWeaknessAttackState();
  const attackerId = state.players.player.battle.front;
  assert.ok(attackerId);
  const beforeResolution = {
    ...state,
    actionWindow: "battle-confirmation" as const,
    priorityPlayer: "player" as const,
    battle: {
      attackerId,
      attackerSlot: "front" as const,
      targetId: "weakness:front" as const,
      targetSlot: "front" as const,
      consecutivePasses: 1,
      resolved: false,
      outcome: null,
    },
  };
  const early = applyAction(
    beforeResolution,
    battleConfirmation("player"),
  );
  assert.equal(early.ok, false);
  assert.equal(early.state, beforeResolution);

  const forgedPasses = {
    ...beforeResolution,
    battle: { ...beforeResolution.battle, consecutivePasses: 2 },
  };
  const forged = applyAction(forgedPasses, battleConfirmation("player"));
  assert.equal(forged.ok, false);
  assert.equal(forged.state, forgedPasses);
});

test("attackers need a valid Range and at least one legal target", () => {
  const attackerId = cardForCode("player", "BP01-001");
  const validState = setupBattleState({
    playerBattle: { front: attackerId },
    botBattle: {},
  });
  const missingRange = {
    ...validState,
    instances: {
      ...validState.instances,
      [attackerId]: { ...validState.instances[attackerId], originalRange: undefined },
    },
  };
  assert.equal(
    getLegalActions(missingRange, "player").some(
      (action) => action.type === "declare-attack",
    ),
    false,
  );
  const missingRangeResult = applyAction(
    missingRange,
    declareAttack("player", attackerId),
  );
  assert.equal(missingRangeResult.ok, false);
  assert.equal(missingRangeResult.state, missingRange);

  const noTargetId = cardForCode("bot", "BP01-005");
  const noTarget = setupBattleState({
    playerBattle: { front: attackerId },
    botBattle: { front: noTargetId },
  });
  const noTargetState = {
    ...noTarget,
    instances: {
      ...noTarget.instances,
      [attackerId]: { ...noTarget.instances[attackerId], originalRange: 0 },
      [noTargetId]: {
        ...noTarget.instances[noTargetId],
        controllerId: "player" as const,
      },
    },
  };
  assert.equal(
    getLegalActions(noTargetState, "player").some(
      (action) => action.type === "declare-attack",
    ),
    false,
  );
  const noTargetResult = applyAction(
    noTargetState,
    declareAttack("player", attackerId),
  );
  assert.equal(noTargetResult.ok, false);
  assert.equal(noTargetResult.state, noTargetState);
});

test("rearrangement actions contain every Battle card exactly once", () => {
  const front = cardForCode("player", "BP01-001");
  const back = cardForCode("player", "BP01-002");
  const state = {
    ...setupBattleState({ playerBattle: { front, back }, botBattle: {} }),
    actionWindow: "battle-rearrange" as const,
    battleRearrangementUsed: false,
  };
  const actions = getLegalActions(state, "player").filter(
    (action): action is Extract<GameAction, { type: "rearrange-battle" }> =>
      action.type === "rearrange-battle",
  );

  assert.ok(actions.length > 0);
  for (const action of actions) {
    const cards = Object.values(action.order).filter(
      (instanceId): instanceId is string => instanceId !== null,
    );
    assert.equal(cards.length, 2);
    assert.deepEqual(new Set(cards), new Set([front, back]));
  }
});

test("an unrelated duplicate in the opponent Battle blocks all targets", () => {
  const attackerId = cardForCode("player", "BP01-001");
  const targetId = cardForCode("bot", "BP01-005");
  const base = setupBattleState({
    playerBattle: { front: attackerId },
    botBattle: { front: targetId },
  });
  const malformed = {
    ...base,
    players: {
      ...base.players,
      bot: {
        ...base.players.bot,
        battle: { ...base.players.bot.battle, wingLeft: targetId },
      },
    },
  };

  assert.deepEqual(
    getLegalBattleTargets(malformed, "player", attackerId, 3),
    [],
  );
  assert.equal(
    getLegalActions(malformed, "player").some(
      (action) => action.type === "declare-attack",
    ),
    false,
  );
});

test("a Battle-plus-Base duplicate target is rejected without mutation", () => {
  const attackerId = cardForCode("player", "BP01-001");
  const targetId = cardForCode("bot", "BP01-005");
  const base = setupBattleState({
    playerBattle: { front: attackerId },
    botBattle: { front: targetId },
  });
  const malformed = {
    ...base,
    actionWindow: "battle-counter" as const,
    priorityPlayer: "bot" as const,
    players: {
      ...base.players,
      bot: {
        ...base.players.bot,
        base: [targetId],
      },
    },
    battle: {
      attackerId,
      attackerSlot: "front" as const,
      targetId,
      targetSlot: "front" as const,
      consecutivePasses: 1,
      resolved: false,
      outcome: null,
    },
  };

  const result = applyAction(malformed, counterPass("bot"));
  assert.equal(result.ok, false);
  assert.equal(result.state, malformed);
});

test("a cross-player Battle duplicate is rejected without mutation", () => {
  const attackerId = cardForCode("player", "BP01-001");
  const targetId = cardForCode("bot", "BP01-005");
  const base = setupBattleState({
    playerBattle: { front: attackerId },
    botBattle: { front: targetId },
  });
  const malformed = {
    ...base,
    actionWindow: "battle-counter" as const,
    priorityPlayer: "bot" as const,
    players: {
      ...base.players,
      player: {
        ...base.players.player,
        battle: { ...base.players.player.battle, wingLeft: targetId },
      },
    },
    battle: {
      attackerId,
      attackerSlot: "front" as const,
      targetId,
      targetSlot: "front" as const,
      consecutivePasses: 1,
      resolved: false,
      outcome: null,
    },
  };

  const result = applyAction(malformed, counterPass("bot"));
  assert.equal(result.ok, false);
  assert.equal(result.state, malformed);
});

test("battle confirmation revalidates attacker membership and attributes", () => {
  const state = setupWeaknessAttackState();
  const attackerId = state.players.player.battle.front;
  assert.ok(attackerId);
  const malformed = {
    ...state,
    actionWindow: "battle-confirmation" as const,
    priorityPlayer: "player" as const,
    players: {
      ...state.players,
      player: {
        ...state.players.player,
        battle: { ...state.players.player.battle, front: null },
      },
    },
    instances: {
      ...state.instances,
      [attackerId]: {
        ...state.instances[attackerId],
        originalPower: undefined,
      },
    },
    battle: {
      attackerId,
      attackerSlot: "front" as const,
      targetId: "weakness:front" as const,
      targetSlot: "front" as const,
      consecutivePasses: 2,
      resolved: true,
      outcome: null,
    },
  };

  const result = applyAction(malformed, battleConfirmation("player"));
  assert.equal(result.ok, false);
  assert.equal(result.state, malformed);
});

test("battle confirmation rejects a target that was never legal", () => {
  const state = setupWeaknessAttackState();
  const attackerId = state.players.player.battle.front;
  const targetId = cardForCode("bot", "BP01-005");
  assert.ok(attackerId);
  const malformed = {
    ...state,
    actionWindow: "battle-confirmation" as const,
    priorityPlayer: "player" as const,
    battle: {
      attackerId,
      attackerSlot: "front" as const,
      targetId,
      targetSlot: "front" as const,
      consecutivePasses: 2,
      resolved: true,
      outcome: null,
    },
  };

  const result = applyAction(malformed, battleConfirmation("player"));
  assert.equal(result.ok, false);
  assert.equal(result.state, malformed);
});

test("Counter Phase rejects invalid pass counts without mutation", () => {
  for (const consecutivePasses of [-1, 2, Number.NaN, 1.5]) {
    const base = setupBattleState({ playerBattle: {}, botBattle: {} });
    const malformed = {
      ...base,
      phase: "counter" as const,
      actionWindow: "counter-phase" as const,
      priorityPlayer: "player" as const,
      battle: {
        attackerId: null,
        attackerSlot: null,
        targetId: null,
        targetSlot: null,
        consecutivePasses,
        resolved: false,
        outcome: null,
      },
    };

    const result = applyAction(malformed, counterPass("player"));
    assert.equal(result.ok, false);
    assert.equal(result.state, malformed);
  }
});

test("occupied-target confirmation rejects an impossible double retreat", () => {
  const attackerId = cardForCode("player", "BP01-004");
  const targetId = cardForCode("bot", "BP01-005");
  const state = withPower(
    setupBattleState({
      playerBattle: { front: attackerId },
      botBattle: { front: targetId },
    }),
    attackerId,
    targetId,
    4000,
    3000,
  );
  const resolved = resolveBattle(state, attackerId, targetId).state;
  const forged = {
    ...resolved,
    players: {
      ...resolved.players,
      player: {
        ...resolved.players.player,
        battle: { ...resolved.players.player.battle, front: null },
        retreat: [...resolved.players.player.retreat, attackerId],
      },
    },
    instances: {
      ...resolved.instances,
      [attackerId]: { ...resolved.instances[attackerId], zone: "retreat" as const },
    },
  };

  const result = applyAction(forged, battleConfirmation("player"));
  assert.equal(result.ok, false);
  assert.equal(result.state, forged);
});

test("Weakness confirmation rejects an attacker that retreated", () => {
  const state = setupWeaknessAttackState();
  const attackerId = state.players.player.battle.front;
  assert.ok(attackerId);
  const resolved = applyActionsForTest(state, [
    declareAttack("player", attackerId),
    selectTarget("player", "weakness:front"),
    counterPass("bot"),
    counterPass("player"),
  ]).state;
  const forged = {
    ...resolved,
    players: {
      ...resolved.players,
      player: {
        ...resolved.players.player,
        battle: { ...resolved.players.player.battle, front: null },
        retreat: [...resolved.players.player.retreat, attackerId],
      },
    },
    instances: {
      ...resolved.instances,
      [attackerId]: { ...resolved.instances[attackerId], zone: "retreat" as const },
    },
  };

  const result = applyAction(forged, battleConfirmation("player"));
  assert.equal(result.ok, false);
  assert.equal(result.state, forged);
});

test("confirmation rejects an unknown occupied-target outcome type", () => {
  const attackerId = cardForCode("player", "BP01-004");
  const targetId = cardForCode("bot", "BP01-005");
  const state = withPower(
    setupBattleState({
      playerBattle: { front: attackerId },
      botBattle: { front: targetId },
    }),
    attackerId,
    targetId,
    4000,
    3000,
  );
  const resolved = resolveBattle(state, attackerId, targetId).state;
  assert.ok(resolved.battle);
  const forged = {
    ...resolved,
    battle: {
      ...resolved.battle,
      outcome: {
        type: "unknown",
        attackerPower: 4000,
        targetPower: 3000,
      } as unknown as BattleOutcome,
    },
  };

  const result = applyAction(forged, battleConfirmation("player"));
  assert.equal(result.ok, false);
  assert.equal(result.state, forged);
});

test("confirmation rejects an occupied outcome with an extra field", () => {
  const attackerId = cardForCode("player", "BP01-004");
  const targetId = cardForCode("bot", "BP01-005");
  const state = withPower(
    setupBattleState({
      playerBattle: { front: attackerId },
      botBattle: { front: targetId },
    }),
    attackerId,
    targetId,
    4000,
    3000,
  );
  const resolved = resolveBattle(state, attackerId, targetId).state;
  assert.ok(resolved.battle?.outcome?.type === "defender-retreat");
  const forged = {
    ...resolved,
    battle: {
      ...resolved.battle!,
      outcome: {
        ...resolved.battle.outcome,
        extra: true,
      } as unknown as BattleOutcome,
    },
  };

  const result = applyAction(forged, battleConfirmation("player"));
  assert.equal(result.ok, false);
  assert.equal(result.state, forged);
});

test("Weakness confirmation rejects a prior Timeline point substitution", () => {
  const state = setupWeaknessAttackState();
  const attackerId = state.players.player.battle.front;
  const priorRushPointId = state.players.player.rushPointDeck[0];
  assert.ok(attackerId);
  assert.ok(priorRushPointId);
  const withPriorTimeline = {
    ...state,
    instances: {
      ...state.instances,
      [priorRushPointId]: {
        ...state.instances[priorRushPointId],
        zone: "timeline" as const,
        faceDown: false,
      },
    },
    players: {
      ...state.players,
      player: {
        ...state.players.player,
        timeline: [priorRushPointId],
        rushPointDeck: state.players.player.rushPointDeck.slice(1),
      },
    },
  };
  const resolved = applyActionsForTest(withPriorTimeline, [
    declareAttack("player", attackerId),
    selectTarget("player", "weakness:front"),
    counterPass("bot"),
    counterPass("player"),
  ]).state;
  assert.ok(resolved.battle?.outcome?.type === "weakness");
  const forged = {
    ...resolved,
    battle: {
      ...resolved.battle!,
      outcome: {
        ...resolved.battle.outcome,
        rushPointId: priorRushPointId,
      },
    },
  };

  const result = applyAction(forged, battleConfirmation("player"));
  assert.equal(result.ok, false);
  assert.equal(result.state, forged);
});

function setupWeaknessAttackState(): GameState {
  return setupBattleState({
    playerBattle: { front: cardForCode("player", "BP01-001") },
    botBattle: {},
  });
}

function setupBattleState(input: {
  playerBattle: Partial<Record<BattleSlot, string>>;
  botBattle: Partial<Record<BattleSlot, string>>;
}): GameState {
  const initial = setupGame(fixtureSetup);
  const instances = { ...initial.instances };
  const players = {
    player: arrangePlayer(initial, "player", input.playerBattle, instances),
    bot: arrangePlayer(initial, "bot", input.botBattle, instances),
  };

  return {
    ...initial,
    phase: "battle",
    actionWindow: "battle-select-attacker",
    turnNumber: 2,
    battleRearrangementUsed: true,
    activePlayer: "player",
    priorityPlayer: "player",
    pendingChoice: null,
    resolutionQueue: [],
    instances,
    players,
    battle: {
      attackerId: null,
      attackerSlot: null,
      targetId: null,
      targetSlot: null,
      consecutivePasses: 0,
      resolved: false,
      outcome: null,
    },
  };
}

function arrangePlayer(
  state: GameState,
  playerId: PlayerId,
  battleInput: Partial<Record<BattleSlot, string>>,
  instances: Record<string, GameState["instances"][string]>,
) {
  const cards = Object.values(state.instances).filter(
    (instance) =>
      instance.ownerId === playerId && instance.zone !== "rushPointDeck",
  );
  const battle: Record<BattleSlot, string | null> = {
    front: battleInput.front ?? null,
    wingLeft: battleInput.wingLeft ?? null,
    wingRight: battleInput.wingRight ?? null,
    back: battleInput.back ?? null,
  };
  const battleIds = new Set(
    BATTLE_SLOTS.flatMap((slot) => {
      const instanceId = battle[slot];
      return instanceId === null ? [] : [instanceId];
    }),
  );
  const deck = cards
    .map((instance) => instance.instanceId)
    .filter((instanceId) => !battleIds.has(instanceId));
  for (const instance of cards) {
    const slot = BATTLE_SLOTS.find(
      (candidate) => battle[candidate] === instance.instanceId,
    );
    const zone = slot ?? "deck";
    instances[instance.instanceId] = {
      ...instance,
      zone,
      faceDown: false,
      turnState: {
        ...instance.turnState,
        attacked: false,
        moved: false,
        placed: false,
      },
    };
  }
  return {
    ...state.players[playerId],
    deck,
    hand: [],
    battle,
    base: [],
    retreat: [],
    timeline: [],
    void: [],
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

function cardForCode(playerId: PlayerId, cardCode: string): string {
  const state = setupGame(fixtureSetup);
  const instance = Object.values(state.instances).find(
    (candidate) =>
      candidate.ownerId === playerId && candidate.cardCode === cardCode,
  );
  if (!instance) throw new Error(`missing ${playerId} card ${cardCode}`);
  return instance.instanceId;
}

function withPower(
  state: GameState,
  attackerId: string,
  targetId: string,
  attackerPower: number,
  targetPower = attackerPower,
): GameState {
  return {
    ...state,
    instances: {
      ...state.instances,
      [attackerId]: { ...state.instances[attackerId], originalPower: attackerPower },
      [targetId]: { ...state.instances[targetId], originalPower: targetPower },
    },
  };
}

function declareAttack(playerId: PlayerId, attackerId: string): GameAction {
  return { type: "declare-attack", playerId, attackerId };
}

function selectTarget(
  playerId: PlayerId,
  targetId: string | `weakness:${BattleSlot}`,
): GameAction {
  return { type: "select-attack-target", playerId, targetId };
}

function counterPass(playerId: PlayerId): GameAction {
  return { type: "counter-pass", playerId };
}

function battleConfirmation(playerId: PlayerId): GameAction {
  return { type: "battle-confirmation", playerId };
}

function completeWeaknessAttack(
  state: GameState,
  attackerId: string,
): GameState {
  return applyActionsForTest(state, [
    declareAttack("player", attackerId),
    selectTarget("player", "weakness:front"),
    counterPass("bot"),
    counterPass("player"),
    battleConfirmation("player"),
  ]).state;
}

function resolveBattle(
  state: GameState,
  attackerId: string,
  targetId: string,
) {
  return applyActionsForTest(state, [
    declareAttack("player", attackerId),
    selectTarget("player", targetId),
    counterPass("bot"),
    counterPass("player"),
  ]);
}

function applyActionsForTest(
  state: GameState,
  actions: readonly GameAction[],
) {
  let current = state;
  for (const action of actions) {
    const result = applyAction(current, action);
    if (!result.ok) throw new Error(result.error.message);
    assert.equal(result.ok, true);
    current = result.state;
  }
  return { ok: true as const, state: current };
}
