import assert from "node:assert/strict";
import test from "node:test";

import rawCatalog from "../../cards.en.json";

import {
  applyAction,
  getCurrentPower,
  getLegalActions,
  setupGame,
} from "./engine";
import {
  createRuntimeEffectRegistry,
  createSupportedCardDefinitions,
  getSupportedCardCodes,
  SUPPORTED_CARD_CODES,
} from "./cards";
import {
  applyEffectChoice,
  parseAbilityText,
  queueTriggeredEffects,
  resolveEffectQueue,
} from "./effects";
import type {
  BattleSlot,
  GameEvent,
  GameState,
  PlayerId,
  SimulatorCatalogCard,
  Zone,
} from "./types";

const fixtureCatalog: SimulatorCatalogCard[] = rawCatalog.cards
  .filter((card) => /^BP01-0(?:0[1-9]|1[0-7])$/.test(card.card_code))
  .map((card) => {
    const variant = card.variants[0];
    if (!variant) throw new Error(`missing fixture variant for ${card.card_code}`);
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

test("the supported registry covers only the tested BP01-001..017 effects", () => {
  const supported = getSupportedCardCodes(fixtureCatalog);
  assert.deepEqual([...supported], [
    "BP01-001",
    "BP01-002",
    "BP01-003",
    "BP01-004",
    "BP01-005",
    "BP01-006",
    "BP01-007",
    "BP01-008",
    "BP01-009",
    "BP01-010",
    "BP01-011",
    "BP01-012",
    "BP01-013",
    "BP01-014",
    "BP01-015",
    "BP01-016",
    "BP01-017",
  ]);
  assert.deepEqual([...SUPPORTED_CARD_CODES], [...supported]);

  const registry = createRuntimeEffectRegistry(fixtureCatalog);
  assert.equal(registry.size, 18);
  assert.equal(registry.has("BP01-010#2"), true);
  assert.equal(registry.has("BP01-018#1"), false);
});

test("supported definitions retain catalog attributes and raw ability text", () => {
  const definitions = createSupportedCardDefinitions(fixtureCatalog);
  assert.equal(definitions.size, 17);

  const source = fixtureCatalog.find((card) => card.cardCode === "BP01-016");
  assert.ok(source);
  const definition = definitions.get(source.cardId);
  assert.ok(definition);
  assert.equal(definition.cardCode, source.cardCode);
  assert.equal(definition.abilityText, source.abilityText);
  assert.deepEqual(
    definition.effectIds,
    parseAbilityText(source.cardCode, source.abilityText).map(
      (ability) => ability.effectId,
    ),
  );
});

test("a malformed or incomplete catalog row is not advertised as supported", () => {
  const malformed = fixtureCatalog.map((card) =>
    card.cardCode === "BP01-016"
      ? { ...card, abilityText: "TRIG【BATTLE】 missing colon" }
      : card,
  );

  assert.equal(getSupportedCardCodes(malformed).has("BP01-016"), false);
  assert.doesNotThrow(() => createRuntimeEffectRegistry(malformed));
  assert.equal(createRuntimeEffectRegistry(malformed).has("BP01-016#1"), false);

  const incomplete = fixtureCatalog.map((card) =>
    card.cardCode === "BP01-016" ? { ...card, power: null } : card,
  );
  assert.equal(getSupportedCardCodes(incomplete).has("BP01-016"), false);
  assert.equal(createRuntimeEffectRegistry(incomplete).has("BP01-016#1"), false);
});

test("a card with an unsupported second clause is excluded from the registry", () => {
  const unsupported = fixtureCatalog.map((card) =>
    card.cardCode === "BP01-013"
      ? {
          ...card,
          abilityText: "TRIG【FIELD】:supported clause. ACTI【FIELD】:unsupported clause.",
        }
      : card,
  );

  assert.equal(getSupportedCardCodes(unsupported).has("BP01-013"), false);
  assert.equal(createRuntimeEffectRegistry(unsupported).has("BP01-013#1"), false);
});

test("catalog ability metadata must match the registered handler metadata", () => {
  const altered = fixtureCatalog.map((card) =>
    card.cardCode === "BP01-016"
      ? {
          ...card,
          abilityText:
            "TRIG【BATTLE/ONCE PER TURN】:A different body with the same effect shape.",
        }
      : card,
  );

  assert.equal(getSupportedCardCodes(altered).has("BP01-016"), false);
  assert.equal(createRuntimeEffectRegistry(altered).has("BP01-016#1"), false);
});

test("catalog identity fields are required for supplied runtime rows", () => {
  for (const field of ["cardId", "cardType", "isBase"] as const) {
    const malformed = fixtureCatalog.map((card) => {
      if (card.cardCode !== "BP01-016") return card;
      if (field === "cardId") return { ...card, cardId: "" };
      if (field === "cardType") return { ...card, cardType: null };
      return { ...card, isBase: false };
    });

    assert.equal(getSupportedCardCodes(malformed).has("BP01-016"), false, field);
    assert.equal(createRuntimeEffectRegistry(malformed).has("BP01-016#1"), false, field);
  }
});

test("duplicate catalog rows are excluded instead of being resolved by last-write order", () => {
  const duplicate = fixtureCatalog.find((card) => card.cardCode === "BP01-016");
  assert.ok(duplicate);
  const catalog = [...fixtureCatalog, { ...duplicate, abilityText: null }];

  assert.equal(getSupportedCardCodes(catalog).has("BP01-016"), false);
  assert.equal(createRuntimeEffectRegistry(catalog).has("BP01-016#1"), false);
});

test("only complete Base Character rows are advertised", () => {
  const invalidRows = fixtureCatalog.map((card) =>
    card.cardCode === "BP01-016"
      ? { ...card, isBase: false, cardType: "Event" }
      : card,
  );

  assert.equal(getSupportedCardCodes(invalidRows).has("BP01-016"), false);
  assert.equal(createRuntimeEffectRegistry(invalidRows).has("BP01-016#1"), false);
});

test("AUTO definitions are queried as current modifiers instead of queued", () => {
  const state = arrangeState(
    setupRuntimeState(),
    { front: findCard("player", "BP01-004") },
    {
      front: findCard("bot", "BP01-001"),
      back: findCard("bot", "BP01-002"),
    },
  );
  const source = state.players.player.battle.front;
  assert.ok(source);

  assert.equal(getCurrentPower(state, source), 2500);
  assert.equal(state.resolutionQueue.length, 0);
});

test("BP01-005 only offers red characters as attack targets", () => {
  const attacker = findCard("player", "BP01-001");
  const target = findCard("player", "BP01-002");
  const source = findCard("player", "BP01-005");
  const state = arrangeState(
    setupRuntimeState(),
    { front: attacker, wingLeft: target },
    {},
    [source],
  );
  state.cardMetadata = {
    ...state.cardMetadata,
    [state.instances[target].cardCode]: {
      ...state.cardMetadata![state.instances[target].cardCode],
      colorCode: "blue",
    },
  };
  const registry = createRuntimeEffectRegistry(fixtureCatalog);
  const event: GameEvent = {
    sequence: 1,
    type: "attack-declared",
    visibility: "public",
    playerId: "player",
    data: { attackerId: attacker },
  };
  state.events = [event];

  state.resolutionQueue = [...queueTriggeredEffects(state, event, registry)];
  resolveEffectQueue(state, registry);

  const choice = state.pendingChoice;
  assert.ok(choice);
  if (choice.type !== "target") return;
  assert.deepEqual(choice.options, [attacker]);
});

test("BP01-003 uses the source's current Power for X", () => {
  const source = findCard("player", "BP01-003");
  const target = findCard("bot", "BP01-001");
  const state = arrangeState(
    setupRuntimeState(),
    { wingLeft: source },
    { front: target },
  );
  state.instances[source] = {
    ...state.instances[source],
    modifiers: [{ attribute: "power", amount: 1000, expiresAtTurn: state.turnNumber }],
  };
  const registry = createRuntimeEffectRegistry(fixtureCatalog);
  const event = {
    sequence: 1,
    type: "turn-ended",
    visibility: "public",
    playerId: "player",
    data: { nonAttackingInstanceIds: [source] },
  } as GameEvent;
  state.events = [event];

  state.resolutionQueue = [...queueTriggeredEffects(state, event, registry)];
  resolveEffectQueue(state, registry);
  const choice = state.pendingChoice;
  assert.ok(choice);
  if (choice.type !== "target") return;
  assert.equal(applyEffectChoice(state, choice.choiceId, target), true);
  resolveEffectQueue(state, registry);

  assert.deepEqual(state.instances[target].modifiers, [
    { attribute: "power", amount: -4500, expiresAtTurn: state.turnNumber },
  ]);
});

test("turn-ended triggers resolve before the next turn resets state", () => {
  const source = findCard("player", "BP01-003");
  const target = findCard("bot", "BP01-001");
  const state = arrangeState(
    setupRuntimeState(),
    { wingLeft: source },
    { front: target },
  );
  state.phase = "counter";
  state.actionWindow = "counter-phase";
  state.priorityPlayer = "player";
  state.instances[source] = {
    ...state.instances[source],
    modifiers: [{ attribute: "power", amount: 1000, expiresAtTurn: state.turnNumber }],
  };
  state.battle = {
    attackerId: null,
    attackerSlot: null,
    targetId: null,
    targetSlot: null,
    consecutivePasses: 0,
    resolved: false,
    outcome: null,
  };

  const firstPass = applyAction(state, { type: "counter-pass", playerId: "player" });
  assert.equal(firstPass.ok, true);
  if (!firstPass.ok) return;
  const endPhase = applyAction(firstPass.state, { type: "counter-pass", playerId: "bot" });
  assert.equal(endPhase.ok, true);
  if (!endPhase.ok) return;
  assert.equal(endPhase.state.turnNumber, 1);

  const choice = endPhase.state.pendingChoice;
  assert.ok(choice);
  if (choice.type !== "target") return;
  assert.deepEqual(choice.options, [target]);
  const completed = applyAction(endPhase.state, {
    type: "choose-effect",
    playerId: "player",
    choiceId: choice.choiceId,
    value: target,
  });
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.state.turnNumber, 2);
  assert.equal(
    completed.events.some(
      (event) => event.type === "effect-modified" && event.data.amount === -4500,
    ),
    true,
  );
});

test("BP01-013 moves and covers its selected target", () => {
  const source = findCard("player", "BP01-013");
  const target = findCard("bot", "BP01-001");
  const state = arrangeState(
    setupRuntimeState(),
    { front: source },
    { front: target },
  );
  const registry = createRuntimeEffectRegistry(fixtureCatalog);
  const event = calledEvent(source, "player");
  state.events = [event];

  state.resolutionQueue = [...queueTriggeredEffects(state, event, registry)];
  resolveEffectQueue(state, registry);
  const choice = state.pendingChoice;
  assert.ok(choice);
  if (choice.type !== "target") return;
  assert.deepEqual(choice.options, [target]);
  assert.equal(applyEffectChoice(state, choice.choiceId, target), true);
  resolveEffectQueue(state, registry);

  assert.equal(state.instances[target].zone, "base");
  assert.equal(state.instances[target].covered, true);
  assert.equal(state.players.bot.base.includes(target), true);
});

test("BP01-013 does not offer a target when the opponent Base is full", () => {
  const source = findCard("player", "BP01-013");
  const target = findCard("bot", "BP01-001");
  const state = arrangeState(
    setupRuntimeState(),
    { front: source },
    { front: target },
  );
  fillBase(state, "bot", target);
  const registry = createRuntimeEffectRegistry(fixtureCatalog);
  const event = calledEvent(source, "player");
  state.events = [event];

  state.resolutionQueue = [...queueTriggeredEffects(state, event, registry)];
  resolveEffectQueue(state, registry);

  assert.deepEqual(state.resolutionQueue, []);
  assert.equal(state.pendingChoice, null);
});

test("BP01-013 rechecks Base capacity after a target choice is opened", () => {
  const source = findCard("player", "BP01-013");
  const target = findCard("bot", "BP01-001");
  const state = arrangeState(
    setupRuntimeState(),
    { front: source },
    { front: target },
  );
  const registry = createRuntimeEffectRegistry(fixtureCatalog);
  const event = calledEvent(source, "player");
  state.events = [event];
  state.resolutionQueue = [...queueTriggeredEffects(state, event, registry)];
  resolveEffectQueue(state, registry);
  const pending = state.pendingChoice;
  assert.ok(pending && pending.type === "target");
  assert.deepEqual(pending.options, [target]);

  fillBase(state, "bot", target);
  assert.equal(applyEffectChoice(state, "target", target), true);
  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, true);
  assert.equal(state.instances[target].zone, "front");
  assert.equal(state.pendingChoice, null);
});

test("BP01-010#2 resolves an attached Lv1 Machine set card back to Hand", () => {
  const state = setupRuntimeState();
  const source = Object.values(state.instances).find(
    (instance) => instance.ownerId === "player" && instance.cardCode === "BP01-010",
  );
  const target = Object.values(state.instances).find(
    (instance) =>
      instance.ownerId === "player" &&
      instance.cardCode === "BP01-010" &&
      instance.instanceId !== source?.instanceId,
  );
  const parent = Object.values(state.instances).find(
    (instance) => instance.ownerId === "player" && instance.cardCode === "BP01-001",
  );
  assert.ok(source);
  assert.ok(target);
  assert.ok(parent);

  const arranged = arrangeState(state, { back: source.instanceId }, {});
  arranged.players.player.void = arranged.players.player.void.filter(
    (instanceId) => instanceId !== parent.instanceId && instanceId !== target.instanceId,
  );
  arranged.players.player.base = [parent.instanceId];
  arranged.instances[parent.instanceId] = {
    ...arranged.instances[parent.instanceId],
    zone: "base",
    faceDown: true,
    attachmentIds: [target.instanceId],
  };
  arranged.instances[target.instanceId] = {
    ...arranged.instances[target.instanceId],
    zone: "base",
    faceDown: true,
    attachedTo: parent.instanceId,
  };

  const result = applyAction(arranged, {
    type: "activate-effect",
    playerId: "player",
    effectId: "BP01-010#2",
    sourceInstanceId: source.instanceId,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.pendingChoice?.type, "target");
  if (result.state.pendingChoice?.type !== "target") return;
  const completed = applyAction(result.state, {
    type: "choose-effect",
    playerId: "player",
    choiceId: result.state.pendingChoice.choiceId,
    value: target.instanceId,
  });

  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.state.instances[target.instanceId].zone, "hand");
  assert.equal(completed.state.instances[target.instanceId].attachedTo, null);
  assert.deepEqual(completed.state.instances[parent.instanceId].attachmentIds, []);
  assert.deepEqual(completed.state.players.player.hand, [target.instanceId]);
  assert.deepEqual(completed.state.players.player.base, [parent.instanceId]);
  assert.equal(
    completed.state.events.some((event) => event.type === "activate-effect"),
    true,
  );
  assert.equal(completed.state.resolutionQueue.length, 0);
});

test("counter effects store their activation provenance before resolving", () => {
  const initial = setupRuntimeState();
  const source = Object.values(initial.instances).find(
    (instance) => instance.ownerId === "player" && instance.cardCode === "BP01-002",
  );
  const target = Object.values(initial.instances).find(
    (instance) => instance.ownerId === "bot" && instance.cardCode === "BP01-001",
  );
  assert.ok(source);
  assert.ok(target);

  const state = arrangeState(
    initial,
    {},
    { front: target.instanceId },
    [source.instanceId],
    [findCard("player", "BP01-003")],
    [findCard("bot", "BP01-003")],
  );
  state.phase = "counter";
  state.actionWindow = "counter-phase";
  state.priorityPlayer = "player";
  state.battle = {
    attackerId: null,
    attackerSlot: null,
    targetId: null,
    targetSlot: null,
    consecutivePasses: 1,
    resolved: false,
    outcome: null,
  };

  const result = applyAction(state, {
    type: "counter-effect",
    playerId: "player",
    effectId: "BP01-002#1",
    sourceInstanceId: source.instanceId,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.state.events.some((event) => event.type === "activate-effect"),
    true,
  );
  assert.equal(result.state.pendingChoice?.type, "target");
  assert.equal(result.state.battle?.consecutivePasses, 0);
  assert.equal(result.state.priorityPlayer, "player");

  if (result.state.pendingChoice?.type !== "target") return;
  const completed = applyAction(result.state, {
    type: "choose-effect",
    playerId: "player",
    choiceId: result.state.pendingChoice.choiceId,
    value: target.instanceId,
  });
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.state.actionWindow, "counter-phase");
  assert.equal(completed.state.priorityPlayer, "bot");
  assert.equal(completed.state.battle?.consecutivePasses, 0);
});

test("counter effects return Battle Counter Step priority after a choice", () => {
  const initial = setupRuntimeState();
  const attacker = findCard("player", "BP01-001");
  const source = findCard("player", "BP01-002");
  const target = findCard("bot", "BP01-001");
  const playerDeckCard = findCard("player", "BP01-003");
  const botDeckCard = findCard("bot", "BP01-003");
  const arranged = arrangeState(
    initial,
    { front: attacker },
    { front: target },
    [source],
    [playerDeckCard],
    [botDeckCard],
  );
  arranged.turnNumber = 2;

  const endedAction = applyAction(arranged, {
    type: "end-action-phase",
    playerId: "player",
  });
  if (!endedAction.ok) throw new Error(endedAction.error.message);
  const rearranged = applyAction(endedAction.state, {
    type: "rearrange-battle",
    playerId: "player",
    order: { front: attacker, wingLeft: null, wingRight: null, back: null },
  });
  if (!rearranged.ok) throw new Error(rearranged.error.message);
  const declared = applyAction(rearranged.state, {
    type: "declare-attack",
    playerId: "player",
    attackerId: attacker,
  });
  if (!declared.ok) throw new Error(declared.error.message);
  const selected = applyAction(declared.state, {
    type: "select-attack-target",
    playerId: "player",
    targetId: target,
  });
  if (!selected.ok) throw new Error(selected.error.message);
  const passed = applyAction(selected.state, {
    type: "counter-pass",
    playerId: "bot",
  });
  if (!passed.ok) throw new Error(passed.error.message);

  const activated = applyAction(passed.state, {
    type: "counter-effect",
    playerId: "player",
    effectId: "BP01-002#1",
    sourceInstanceId: source,
  });
  assert.equal(activated.ok, true);
  if (!activated.ok) return;
  assert.equal(activated.state.battle?.consecutivePasses, 0);
  assert.equal(activated.state.pendingChoice?.type, "target");

  if (activated.state.pendingChoice?.type !== "target") return;
  const completed = applyAction(activated.state, {
    type: "choose-effect",
    playerId: "player",
    choiceId: activated.state.pendingChoice.choiceId,
    value: target,
  });
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.state.actionWindow, "battle-counter");
  assert.equal(completed.state.priorityPlayer, "bot");
  assert.equal(completed.state.battle?.consecutivePasses, 0);
});

test("BP01-008 asks before pruning attachments and honors No", () => {
  const source = findCard("player", "BP01-008");
  const attachment = findCard("player", "BP01-001");
  const state = arrangeState(setupRuntimeState(), { front: source }, {});
  state.players.player.void = state.players.player.void.filter((id) => id !== attachment);
  state.instances[source] = {
    ...state.instances[source],
    attachmentIds: [attachment],
  };
  state.instances[attachment] = {
    ...state.instances[attachment],
    zone: "front",
    faceDown: false,
    attachedTo: source,
  };
  state.events = [calledEvent(source, "player")];
  const registry = createRuntimeEffectRegistry(fixtureCatalog);

  state.resolutionQueue = [...queueTriggeredEffects(state, state.events[0]!, registry)];
  resolveEffectQueue(state, registry);
  const choice = state.pendingChoice;
  assert.ok(choice?.type === "effect");
  assert.deepEqual(choice.options, ["yes", "no"]);

  assert.equal(applyEffectChoice(state, choice.choiceId, "no", registry), true);
  resolveEffectQueue(state, registry);

  assert.equal(state.instances[attachment].zone, "front");
  assert.equal(state.instances[attachment].attachedTo, source);
});

test("BP01-012 asks before placing its two cards and honors No", () => {
  const source = findCard("player", "BP01-012");
  const top = findCard("player", "BP01-001");
  const second = findCard("player", "BP01-002");
  const redBase = findCard("player", "BP01-003");
  const state = arrangeState(
    setupRuntimeState(),
    { front: source },
    {},
    [],
    [top, second],
  );
  state.players.player.void = state.players.player.void.filter((id) => id !== redBase);
  state.players.player.base = [redBase];
  state.instances[redBase] = {
    ...state.instances[redBase],
    zone: "base",
    faceDown: true,
  };
  state.events = [calledEvent(source, "player")];
  const registry = createRuntimeEffectRegistry(fixtureCatalog);

  state.resolutionQueue = [...queueTriggeredEffects(state, state.events[0]!, registry)];
  resolveEffectQueue(state, registry);
  const choice = state.pendingChoice;
  assert.ok(choice?.type === "effect");
  assert.deepEqual(choice.options, ["yes", "no"]);

  assert.equal(applyEffectChoice(state, choice.choiceId, "no", registry), true);
  resolveEffectQueue(state, registry);

  assert.deepEqual(state.players.player.deck, [top, second]);
  assert.deepEqual(state.players.player.base, [redBase]);
});

test("BP01-016 does not offer a target when the opponent Base is full", () => {
  const source = findCard("player", "BP01-016");
  const target = findCard("bot", "BP01-001");
  const state = arrangeState(
    setupRuntimeState(),
    { front: source },
    { front: target },
  );
  fillBase(state, "bot", target);
  const registry = createRuntimeEffectRegistry(fixtureCatalog);
  const event = calledEvent(source, "player");
  state.events = [event];

  state.resolutionQueue = [...queueTriggeredEffects(state, event, registry)];
  resolveEffectQueue(state, registry);

  assert.deepEqual(state.resolutionQueue, []);
  assert.equal(state.pendingChoice, null);
});

test("activated effects reject actions from the wrong action window", () => {
  const source = findCard("player", "BP01-010");
  const target = Object.values(setupRuntimeState().instances).find(
    (instance) => instance.ownerId === "player" && instance.cardCode === "BP01-010" && instance.instanceId !== source,
  );
  assert.ok(target);
  const state = arrangeState(setupRuntimeState(), { back: source }, {});
  state.players.player.base = [target.instanceId];
  state.instances[target.instanceId] = {
    ...state.instances[target.instanceId],
    zone: "base",
    faceDown: true,
  };
  state.phase = "battle";
  state.actionWindow = "battle-select-target";
  state.priorityPlayer = "player";
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "activate-effect",
    playerId: "player",
    effectId: "BP01-010#2",
    sourceInstanceId: source,
  });

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

test("activated effects reject a player who does not control the source", () => {
  const source = findCard("player", "BP01-010");
  const state = arrangeState(setupRuntimeState(), { back: source }, {});
  state.priorityPlayer = "bot";
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "activate-effect",
    playerId: "bot",
    effectId: "BP01-010#2",
    sourceInstanceId: source,
  });

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

test("optional trigger targets pause and resume the same serializable resolution", () => {
  const state = arrangeState(
    setupRuntimeState(),
    { front: findCard("player", "BP01-015") },
    { front: findCard("bot", "BP01-002") },
  );
  const source = state.players.player.battle.front;
  const target = state.players.bot.battle.front;
  assert.ok(source);
  assert.ok(target);
  const registry = createRuntimeEffectRegistry(fixtureCatalog);
  const event = calledEvent(source, "player");
  state.events = [event];
  state.resolutionQueue = [...queueTriggeredEffects(state, event, registry)];

  resolveEffectQueue(state, registry);
  assert.equal(state.pendingChoice?.type, "target");
  assert.deepEqual(state.pendingChoice?.options, [target]);
  assert.equal(state.actionWindow, "effect-choice");
  assert.equal(JSON.stringify(state).includes("resolve"), false);

  assert.ok(state.pendingChoice);
  const choiceId = state.pendingChoice.choiceId;
  assert.equal(applyEffectChoice(state, choiceId, target), true);
  resolveEffectQueue(state, registry);
  assert.equal(state.pendingChoice, null);
  assert.equal(state.actionWindow, "action");
  assert.equal(state.instances[target].zone, "void");
});

test("once-per-turn trigger markers commit when the resolution starts", () => {
  const state = arrangeState(
    setupRuntimeState(),
    { front: findCard("player", "BP01-016") },
    { front: findCard("bot", "BP01-002") },
  );
  const source = state.players.player.battle.front;
  const called = findCard("player", "BP01-001");
  assert.ok(source);
  const registry = createRuntimeEffectRegistry(fixtureCatalog);
  const event = calledEvent(called, "player");
  state.events = [event];

  const first = queueTriggeredEffects(state, event, registry);
  assert.deepEqual(first.map((entry) => entry.effectId), ["BP01-016#1"]);
  assert.deepEqual(state.instances[source].turnState.usedEffectIds, []);
  state.resolutionQueue = first;
  const result = resolveEffectQueue(state, registry);
  assert.equal(result.ok, true);
  assert.deepEqual(state.instances[source].turnState.usedEffectIds, ["BP01-016#1"]);
  assert.deepEqual(queueTriggeredEffects(state, event, registry), []);
});

test("a triggered draw that removes the last deck card uses engine deck-out", () => {
  const state = arrangeState(
    setupRuntimeState(),
    {},
    {},
    [findCard("player", "BP01-011")],
    [findCard("player", "BP01-001")],
  );
  const source = state.players.player.hand[0];
  const topDeck = state.players.player.deck[0];
  assert.ok(source);
  assert.ok(topDeck);

  const result = applyAction(state, {
    type: "call",
    playerId: "player",
    instanceId: source,
    sacrifices: [],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.winner, "bot");
  assert.equal(result.state.events.some((event) => event.type === "deck-out"), true);
  assert.equal(result.state.instances[topDeck].zone, "hand");
});

test("BP01-011 grants one additional character-only attack after its first attack", () => {
  const initial = setupRuntimeState();
  const source = findCard("player", "BP01-011");
  const drawOne = findCard("player", "BP01-001");
  const drawTwo = findCard("player", "BP01-003");
  const targets = Object.values(initial.instances)
    .filter(
      (instance) =>
        instance.ownerId === "bot" && instance.cardCode === "BP01-002",
    )
    .slice(0, 1)
    .map((instance) => instance.instanceId);
  assert.equal(targets.length, 1);

  const state = arrangeState(
    initial,
    {},
    { front: targets[0]! },
    [source],
    [drawOne, drawTwo],
  );
  const botDeckCard = Object.values(initial.instances).find(
    (instance) =>
      instance.ownerId === "bot" &&
      !targets.includes(instance.instanceId),
  );
  assert.ok(botDeckCard);
  state.players.bot.deck = [botDeckCard.instanceId];
  state.players.bot.void = state.players.bot.void.filter(
    (instanceId) => instanceId !== botDeckCard.instanceId,
  );
  state.instances[botDeckCard.instanceId] = {
    ...state.instances[botDeckCard.instanceId],
    zone: "deck",
    faceDown: true,
  };
  state.turnNumber = 2;

  const called = applyAction(state, {
    type: "call",
    playerId: "player",
    instanceId: source,
    sacrifices: [],
  });
  if (!called.ok) throw new Error(called.error.message);
  assert.equal(called.state.instances[source].turnState.additionalAttacks, 1);
  assert.equal(called.state.instances[source].turnState.attackCharactersOnly, true);

  const endedAction = applyAction(called.state, {
    type: "end-action-phase",
    playerId: "player",
  });
  if (!endedAction.ok) throw new Error(endedAction.error.message);
  const rearranged = applyAction(endedAction.state, {
    type: "rearrange-battle",
    playerId: "player",
    order: { front: source, wingLeft: null, wingRight: null, back: null },
  });
  if (!rearranged.ok) throw new Error(rearranged.error.message);

  const firstDeclared = applyAction(rearranged.state, {
    type: "declare-attack",
    playerId: "player",
    attackerId: source,
  });
  if (!firstDeclared.ok) throw new Error(firstDeclared.error.message);
  const firstTarget = applyAction(firstDeclared.state, {
    type: "select-attack-target",
    playerId: "player",
    targetId: "weakness:wingLeft",
  });
  if (!firstTarget.ok) throw new Error(firstTarget.error.message);
  const firstPass = applyAction(firstTarget.state, {
    type: "counter-pass",
    playerId: "bot",
  });
  if (!firstPass.ok) throw new Error(firstPass.error.message);
  const firstResolved = applyAction(firstPass.state, {
    type: "counter-pass",
    playerId: "player",
  });
  if (!firstResolved.ok) throw new Error(firstResolved.error.message);
  const afterFirst = applyAction(firstResolved.state, {
    type: "battle-confirmation",
    playerId: "player",
  });
  if (!afterFirst.ok) throw new Error(afterFirst.error.message);
  assert.equal(
    getLegalActions(afterFirst.state, "player").some(
      (action) => action.type === "declare-attack" && action.attackerId === source,
    ),
    true,
  );
  assert.equal(afterFirst.state.instances[source].turnState.additionalAttacks, 1);

  const secondDeclared = applyAction(afterFirst.state, {
    type: "declare-attack",
    playerId: "player",
    attackerId: source,
  });
  if (!secondDeclared.ok) throw new Error(secondDeclared.error.message);
  assert.equal(secondDeclared.state.instances[source].turnState.additionalAttacks, 0);
  const secondTarget = applyAction(secondDeclared.state, {
    type: "select-attack-target",
    playerId: "player",
    targetId: targets[0]!,
  });
  if (!secondTarget.ok) throw new Error(secondTarget.error.message);
  const secondPass = applyAction(secondTarget.state, {
    type: "counter-pass",
    playerId: "bot",
  });
  if (!secondPass.ok) throw new Error(secondPass.error.message);
  const secondResolved = applyAction(secondPass.state, {
    type: "counter-pass",
    playerId: "player",
  });
  if (!secondResolved.ok) throw new Error(secondResolved.error.message);
  const afterSecond = applyAction(secondResolved.state, {
    type: "battle-confirmation",
    playerId: "player",
  });
  if (!afterSecond.ok) throw new Error(afterSecond.error.message);
  assert.equal(
    getLegalActions(afterSecond.state, "player").some(
      (action) => action.type === "declare-attack" && action.attackerId === source,
    ),
    false,
  );
});

function setupRuntimeState(): GameState {
  return setupGame({
    playerEntries: fixtureCatalog.map((card) => ({ cardId: card.cardId, quantity: card.cardCode === "BP01-017" ? 2 : 3 })),
    botEntries: fixtureCatalog.map((card) => ({ cardId: card.cardId, quantity: card.cardCode === "BP01-017" ? 2 : 3 })),
    definitions: createSupportedCardDefinitions(fixtureCatalog),
    seed: 20260929,
    firstPlayer: "player",
  });
}

function arrangeState(
  state: GameState,
  playerBattle: Partial<Record<BattleSlot, string>>,
  botBattle: Partial<Record<BattleSlot, string>>,
  playerHand: readonly string[] = [],
  playerDeck: readonly string[] = [],
  botDeck: readonly string[] = [],
): GameState {
  const instances = { ...state.instances };
  const players = {
    player: arrangePlayer(state, "player", playerBattle, playerHand, playerDeck, instances),
    bot: arrangePlayer(state, "bot", botBattle, [], botDeck, instances),
  };
  return {
    ...state,
    phase: "action",
    actionWindow: "action",
    activePlayer: "player",
    priorityPlayer: "player",
    pendingChoice: null,
    resolutionQueue: [],
    instances,
    players,
  };
}

function arrangePlayer(
  state: GameState,
  playerId: PlayerId,
  input: Partial<Record<BattleSlot, string>>,
  hand: readonly string[],
  deck: readonly string[],
  instances: GameState["instances"],
) {
  const battle: Record<BattleSlot, string | null> = {
    front: input.front ?? null,
    wingLeft: input.wingLeft ?? null,
    wingRight: input.wingRight ?? null,
    back: input.back ?? null,
  };
  const selected = new Set([
    ...Object.values(battle).filter((id): id is string => id !== null),
    ...hand,
    ...deck,
  ]);
  const cards = Object.values(state.instances).filter(
    (instance) => instance.ownerId === playerId && instance.zone !== "rushPointDeck",
  );
  const voidCards = cards
    .map((instance) => instance.instanceId)
    .filter((instanceId) => !selected.has(instanceId));
  for (const instance of cards) {
    const slot = Object.entries(battle).find(([, id]) => id === instance.instanceId)?.[0] as BattleSlot | undefined;
    const zone: Zone = slot ?? (hand.includes(instance.instanceId) ? "hand" : deck.includes(instance.instanceId) ? "deck" : "void");
    instances[instance.instanceId] = {
      ...instance,
      zone,
      faceDown: zone === "deck",
      turnState: { ...instance.turnState, attacked: false, moved: false, placed: false },
    };
  }
  return {
    ...state.players[playerId],
    deck: [...deck],
    hand: [...hand],
    battle,
    base: [],
    retreat: [],
    void: voidCards,
  };
}

function findCard(playerId: PlayerId, cardCode: string): string {
  const state = setupRuntimeState();
  const instance = Object.values(state.instances).find(
    (candidate) => candidate.ownerId === playerId && candidate.cardCode === cardCode,
  );
  if (!instance) throw new Error(`missing ${playerId} card ${cardCode}`);
  return instance.instanceId;
}

function fillBase(state: GameState, playerId: PlayerId, keepOut: string): void {
  const ids = Object.values(state.instances)
    .filter((instance) => instance.ownerId === playerId && instance.instanceId !== keepOut)
    .slice(0, 6)
    .map((instance) => instance.instanceId);
  const baseIds = new Set(ids);
  const player = state.players[playerId];
  player.deck = player.deck.filter((instanceId) => !baseIds.has(instanceId));
  player.hand = player.hand.filter((instanceId) => !baseIds.has(instanceId));
  player.retreat = player.retreat.filter((instanceId) => !baseIds.has(instanceId));
  player.void = player.void.filter((instanceId) => !baseIds.has(instanceId));
  player.rushPointDeck = player.rushPointDeck.filter((instanceId) => !baseIds.has(instanceId));
  for (const slot of ["front", "wingLeft", "wingRight", "back"] as const) {
    if (player.battle[slot] !== null && baseIds.has(player.battle[slot]!)) {
      player.battle[slot] = null;
    }
  }
  player.base = ids;
  for (const instanceId of ids) {
    state.instances[instanceId] = {
      ...state.instances[instanceId],
      zone: "base",
      faceDown: true,
    };
  }
}

function calledEvent(instanceId: string, playerId: PlayerId): GameEvent {
  return {
    sequence: 1,
    type: "called",
    visibility: "public",
    playerId,
    data: { instanceId, destination: "front", sacrifices: [] },
  };
}
