import assert from "node:assert/strict";
import test from "node:test";

import {
  AbilityParserError,
  applyEffectChoice,
  applyEffectOperation,
  parseAbilityText,
  queueTriggeredEffects,
  resolveEffectQueue,
  selectEffectTargets,
  type EffectOperation,
  type RuntimeEffectDefinition,
} from "./effects";
import type {
  CardInstance,
  GameEvent,
  GameState,
  PlayerState,
  Resolution,
} from "./types";

test("parses trigger metadata and preserves the raw effect body", () => {
  const parsed = parseAbilityText(
    "BP01-016",
    "TRIG【BATTLE/ONCE PER TURN】:When your character with Lv4 or above enters the field by calling, you may move 1 of your opponent's characters with Lv3 or below from BATTLE to your opponent's BASE.",
  );

  assert.deepEqual(parsed[0], {
    effectId: "BP01-016#1",
    kind: "trigger",
    counter: false,
    locations: ["BATTLE"],
    oncePerTurn: true,
    body: "When your character with Lv4 or above enters the field by calling, you may move 1 of your opponent's characters with Lv3 or below from BATTLE to your opponent's BASE.",
  });
});

test("parses counter, wrapped, spaced, and multiple clauses", () => {
  const parsed = parseAbilityText(
    "TEST-001",
    "COUNTER·ACTI 【 HAND 】 : discard this card. ACTI［BACK / ONCE PER TURN］ ： move a card. UNIQUE(AUTO【FIELD】: keep this effect.)",
  );

  assert.deepEqual(parsed, [
    {
      effectId: "TEST-001#1",
      kind: "activated",
      counter: true,
      locations: ["HAND"],
      oncePerTurn: false,
      body: "discard this card.",
    },
    {
      effectId: "TEST-001#2",
      kind: "activated",
      counter: false,
      locations: ["BACK"],
      oncePerTurn: true,
      body: "move a card.",
    },
    {
      effectId: "TEST-001#3",
      kind: "auto",
      counter: false,
      locations: ["FIELD"],
      oncePerTurn: false,
      body: "keep this effect.",
    },
  ]);

  const counterAuto = parseAbilityText(
    "TEST-002",
    "COUNTER(AUTO【HAND】: This card may be called in COUNTER PHASE.)",
  );
  assert.deepEqual(counterAuto[0], {
    effectId: "TEST-002#1",
    kind: "auto",
    counter: true,
    locations: ["HAND"],
    oncePerTurn: false,
    body: "This card may be called in COUNTER PHASE.",
  });
});

test("rejects malformed headers with a typed parser error", () => {
  assert.throws(
    () => parseAbilityText("BAD-001", "TRIG【FIELD】 missing colon"),
    (error: unknown) => {
      assert.ok(error instanceof AbilityParserError);
      assert.equal(error.code, "missing-colon");
      assert.equal(error.cardCode, "BAD-001");
      return true;
    },
  );
});

test("rejects a malformed later header with its clause index", () => {
  assert.throws(
    () => parseAbilityText("BAD-002", "TRIG【FIELD】:first clause. AUTO FIELD:malformed"),
    (error: unknown) => {
      assert.ok(error instanceof AbilityParserError);
      assert.equal(error.code, "missing-location");
      assert.equal(error.cardCode, "BAD-002");
      assert.equal(error.clauseIndex, 2);
      return true;
    },
  );
});

test("keeps header-like words in ability prose as body text", () => {
  const parsed = parseAbilityText(
    "TEST-003",
    "TRIG【FIELD】:AUTO effects remain in the body.",
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.body, "AUTO effects remain in the body.");
});

test("keeps uppercase header-like words in ability prose as body text", () => {
  const parsed = parseAbilityText(
    "TEST-004",
    "TRIG【FIELD】:first clause. AUTO Effects remain in the body.",
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.body, "first clause. AUTO Effects remain in the body.");
});

test("queues matching triggers in deterministic priority order", () => {
  const playerMetadata = parseAbilityText(
    "TEST-PLAYER",
    "TRIG【BATTLE】:player effect",
  )[0];
  const botMetadata = parseAbilityText(
    "TEST-BOT",
    "TRIG【BATTLE】:bot effect",
  )[0];
  assert.ok(playerMetadata);
  assert.ok(botMetadata);

  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      playerMetadata.effectId,
      {
        effectId: playerMetadata.effectId,
        metadata: playerMetadata,
        canResolve: () => true,
        resolve: () => [],
      },
    ],
    [
      botMetadata.effectId,
      {
        effectId: botMetadata.effectId,
        metadata: botMetadata,
        canResolve: () => true,
        resolve: () => [],
      },
    ],
  ]);

  const state = makeState({
    instances: {
      "player-source": instance("player-source", "TEST-PLAYER", "player", "front"),
      "bot-source": instance("bot-source", "TEST-BOT", "bot", "front"),
    },
    players: {
      player: playerState({ battle: { front: "player-source" } }),
      bot: playerState({ battle: { front: "bot-source" } }),
    },
  });
  const event: GameEvent = {
    sequence: 4,
    type: "attack-declared",
    visibility: "public",
    playerId: "player",
    data: { attackerId: "player-source" },
  };
  state.events = [event];

  const queued = queueTriggeredEffects(state, event, registry);
  assert.deepEqual(
    queued.map((resolution) => resolution.effectId),
    ["TEST-PLAYER#1", "TEST-BOT#1"],
  );
  assert.equal("resolve" in JSON.parse(JSON.stringify(queued[0])), false);
});

test("ignores malformed effect events without mutating trigger state", () => {
  const metadata = parseAbilityText("TEST-PLAYER", "TRIG【BATTLE】:effect")[0];
  assert.ok(metadata);
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      metadata.effectId,
      {
        effectId: metadata.effectId,
        metadata,
        canResolve: () => true,
        resolve: () => [],
      },
    ],
  ]);
  const state = makeState({
    instances: { source: instance("source", "TEST-PLAYER", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
  });
  const before = JSON.stringify(state);
  const event = {
    sequence: 1,
    type: "called",
    visibility: "public",
    playerId: "player",
    data: { instanceId: { invalid: true } },
  } as unknown as GameEvent;

  assert.deepEqual(queueTriggeredEffects(state, event, registry), []);
  assert.equal(JSON.stringify(state), before);
});

test("ignores events whose payload source is not controlled by the event player", () => {
  const metadata = parseAbilityText("TEST-PLAYER", "TRIG【BATTLE】:player effect")[0];
  assert.ok(metadata);
  const state = makeState({
    instances: {
      "player-source": instance("player-source", "TEST-PLAYER", "player", "front"),
      "bot-source": instance("bot-source", "TEST-BOT", "bot", "front"),
    },
    players: {
      player: playerState({ battle: { front: "player-source" } }),
      bot: playerState({ battle: { front: "bot-source" } }),
    },
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      metadata.effectId,
      {
        effectId: metadata.effectId,
        metadata,
        canResolve: () => true,
        resolve: () => [],
      },
    ],
  ]);
  const event: GameEvent = {
    sequence: 1,
    type: "called",
    visibility: "public",
    playerId: "player",
    data: { instanceId: "bot-source" },
  };

  assert.deepEqual(queueTriggeredEffects(state, event, registry), []);
});

test("primitive operations update zones, attachments, modifiers, and typed targets", () => {
  const source = instance("source", "TEST-SOURCE", "player", "front");
  const target = instance("target", "TEST-TARGET", "bot", "wingLeft");
  const hand = instance("hand", "TEST-HAND", "player", "hand");
  const deck = instance("deck", "TEST-DECK", "player", "deck");
  const state = makeState({
    instances: { source, target, hand, deck },
    players: {
      player: playerState({ hand: ["hand"], deck: ["deck"], battle: { front: "source" } }),
      bot: playerState({ battle: { wingLeft: "target" } }),
    },
  });

  applyEffectOperation(state, { type: "draw", playerId: "player", count: 1 });
  assert.deepEqual(state.players.player.hand, ["hand", "deck"]);
  assert.deepEqual(state.players.player.deck, []);
  assert.equal(state.instances.deck.zone, "hand");

  applyEffectOperation(state, { type: "attach", instanceId: "hand", targetInstanceId: "source" });
  assert.equal(state.instances.hand.attachedTo, "source");
  assert.deepEqual(state.instances.source.attachmentIds, ["hand"]);

  applyEffectOperation(state, { type: "modify", instanceId: "source", attribute: "power", amount: 300 });
  assert.deepEqual(state.instances.source.modifiers, [
    { attribute: "power", amount: 300, expiresAtTurn: 1 },
  ]);

  const targets = selectEffectTargets(state, "player", {
    controller: "opponent",
    zones: ["wingLeft"],
    cardCodes: ["TEST-TARGET"],
  });
  assert.deepEqual(targets, ["target"]);

  applyEffectOperation(state, { type: "detach", instanceId: "hand", destination: "retreat" });
  assert.equal(state.instances.hand.attachedTo, null);
  assert.deepEqual(state.instances.source.attachmentIds, []);
  assert.equal(state.instances.hand.zone, "retreat");
});

test("effect draws move an attached tree into the hand coherently", () => {
  const parent = instance("parent", "TEST-PARENT", "player", "deck");
  const child = {
    ...instance("child", "TEST-CHILD", "player", "deck"),
    attachedTo: "parent",
  };
  parent.attachmentIds = ["child"];
  const state = makeState({
    instances: { parent, child },
    players: { player: playerState({ deck: ["parent"] }), bot: playerState() },
  });

  applyEffectOperation(state, { type: "draw", playerId: "player", count: 1 });

  assert.deepEqual(state.players.player.deck, []);
  assert.deepEqual(state.players.player.hand, ["parent"]);
  assert.equal(state.instances.parent.zone, "hand");
  assert.equal(state.instances.child.zone, "hand");
  assert.equal(state.instances.child.attachedTo, "parent");
});

test("derived triggers resolve before the queued resolution resumes", () => {
  const parsed = parseAbilityText(
    "TEST-SOURCE",
    "AUTO【FIELD】:current. TRIG【FIELD】:derived",
  );
  const current = parsed[0];
  const derived = parsed[1];
  const next = parseAbilityText("TEST-NEXT", "AUTO【FIELD】:next")[0];
  assert.ok(current);
  assert.ok(derived);
  assert.ok(next);
  const event: GameEvent = {
    sequence: 1,
    type: "called",
    visibility: "public",
    playerId: "player",
    data: { instanceId: "source" },
  };
  const state = makeState({
    instances: {
      source: instance("source", "TEST-SOURCE", "player", "front"),
      next: instance("next", "TEST-NEXT", "player", "back"),
    },
    players: {
      player: playerState({ battle: { front: "source", back: "next" } }),
      bot: playerState(),
    },
    events: [event],
    resolutionQueue: [
      {
        effectId: current.effectId,
        sourceInstanceId: "source",
        controllerId: "player",
        context: {
          "event:type": event.type,
          "event:sequence": event.sequence,
          "event:visibility": event.visibility,
          "event:playerId": "player",
          "event:data:instanceId": "source",
        },
      },
      {
        effectId: next.effectId,
        sourceInstanceId: "next",
        controllerId: "player",
        context: {
          "event:type": event.type,
          "event:sequence": event.sequence,
          "event:visibility": event.visibility,
          "event:playerId": "player",
          "event:data:instanceId": "source",
        },
      },
    ],
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      current.effectId,
      {
        effectId: current.effectId,
        metadata: current,
        canResolve: () => true,
        resolve: () => [{ type: "modify", instanceId: "source", attribute: "power", amount: 1 }],
      },
    ],
    [
      derived.effectId,
      {
        effectId: derived.effectId,
        metadata: derived,
        canResolve: (context) =>
          context.event.type === "effect-modified" && context.event.data.amount === 1,
        resolve: () => [{ type: "modify", instanceId: "source", attribute: "power", amount: 10 }],
      },
    ],
    [
      next.effectId,
      {
        effectId: next.effectId,
        metadata: next,
        canResolve: () => true,
        resolve: () => [{ type: "modify", instanceId: "source", attribute: "power", amount: 100 }],
      },
    ],
  ]);

  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, true);
  assert.deepEqual(
    state.instances.source.modifiers.map((modifier) => modifier.amount),
    [1, 10, 100],
  );
});

test("derived triggers do not re-evaluate remaining operations", () => {
  const current = parseAbilityText("TEST-CURRENT", "TRIG【FIELD】:current")[0];
  const derived = parseAbilityText("TEST-DERIVED", "TRIG【FIELD】:derived")[0];
  assert.ok(current);
  assert.ok(derived);
  const event: GameEvent = {
    sequence: 1,
    type: "called",
    visibility: "public",
    playerId: "player",
    data: { instanceId: "source" },
  };
  const state = makeState({
    instances: {
      source: instance("source", "TEST-CURRENT", "player", "front"),
      derived: instance("derived", "TEST-DERIVED", "player", "back"),
      first: instance("first", "TEST-FIRST", "player", "hand"),
      second: instance("second", "TEST-SECOND", "player", "hand"),
      third: instance("third", "TEST-THIRD", "player", "hand"),
    },
    players: {
      player: playerState({
        hand: ["first", "second", "third"],
        battle: { front: "source", back: "derived" },
      }),
      bot: playerState(),
    },
    events: [event],
    resolutionQueue: [
      {
        effectId: current.effectId,
        sourceInstanceId: "source",
        controllerId: "player",
        context: {
          "event:type": event.type,
          "event:sequence": event.sequence,
          "event:visibility": event.visibility,
          "event:playerId": "player",
          "event:data:instanceId": "source",
        },
      },
    ],
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      current.effectId,
      {
        effectId: current.effectId,
        metadata: current,
        canResolve: (context) => context.event.type === "called",
        resolve: (context) => {
          const [first, second] = context.state.players.player.hand;
          return [
            { type: "discard", instanceId: first! },
            { type: "discard", instanceId: second! },
          ];
        },
      },
    ],
    [
      derived.effectId,
      {
        effectId: derived.effectId,
        metadata: derived,
        canResolve: (context) =>
          context.event.type === "entered-retreat" &&
          context.event.data.instanceId === "first",
        resolve: () => [
          { type: "modify", instanceId: "source", attribute: "power", amount: 10 },
        ],
      },
    ],
  ]);

  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, true);
  assert.deepEqual(state.players.player.hand, ["third"]);
  assert.deepEqual(state.players.player.retreat, ["first", "second"]);
  assert.deepEqual(state.instances.source.modifiers.map((modifier) => modifier.amount), [10]);
});

test("target filters exclude attachments unless explicitly requested", () => {
  const parent = instance("parent", "TEST-PARENT", "bot", "front");
  const child = {
    ...instance("child", "TEST-CHILD", "bot", "front"),
    attachedTo: "parent",
  };
  parent.attachmentIds = ["child"];
  const state = makeState({
    instances: { parent, child },
    players: { player: playerState(), bot: playerState({ battle: { front: "parent" } }) },
  });

  assert.deepEqual(
    selectEffectTargets(state, "player", { controller: "opponent", zones: ["front"] }),
    ["parent"],
  );
  assert.deepEqual(
    selectEffectTargets(state, "player", {
      controller: "opponent",
      zones: ["front"],
      attached: "attached",
    }),
    ["child"],
  );
  const before = JSON.stringify(state);
  assert.deepEqual(
    applyEffectOperation(state, { type: "move", instanceId: "child", destination: "retreat" }),
    [],
  );
  assert.equal(JSON.stringify(state), before);
});

test("effect targets hide face-down opponent cards but preserve own face-down cards", () => {
  const ownHidden = { ...instance("own-hidden", "TEST-OWN", "player", "front"), faceDown: true };
  const opponentHidden = { ...instance("opponent-hidden", "TEST-OPPONENT", "bot", "front"), faceDown: true };
  const state = makeState({
    instances: { ownHidden, opponentHidden },
    players: {
      player: playerState({ battle: { front: "own-hidden" } }),
      bot: playerState({ battle: { front: "opponent-hidden" } }),
    },
  });

  assert.deepEqual(
    selectEffectTargets(state, "player", {
      controller: "opponent",
      zones: ["front"],
    }),
    [],
  );
  assert.deepEqual(
    selectEffectTargets(state, "player", {
      controller: "self",
      zones: ["front"],
    }),
    ["own-hidden"],
  );
  assert.deepEqual(
    selectEffectTargets(state, "player", {
      controller: "any",
      zones: ["front"],
    }),
    ["own-hidden"],
  );
});

test("reattaching a parent moves all of its descendants coherently", () => {
  const target = instance("target", "TEST-TARGET", "player", "front");
  const parent = instance("parent", "TEST-PARENT", "player", "back");
  const child = { ...instance("child", "TEST-CHILD", "player", "back"), attachedTo: "parent" };
  parent.attachmentIds = ["child"];
  const state = makeState({
    instances: { target, parent, child },
    players: { player: playerState({ battle: { front: "target", back: "parent" } }), bot: playerState() },
  });

  applyEffectOperation(state, { type: "attach", instanceId: "parent", targetInstanceId: "target" });

  assert.equal(state.instances.parent.zone, "front");
  assert.equal(state.instances.child.zone, "front");
  assert.equal(state.instances.child.attachedTo, "parent");
  assert.deepEqual(state.instances.target.attachmentIds, ["parent"]);
});

test("rejects malformed resolutions without mutating state", () => {
  const metadata = parseAbilityText("TEST-SOURCE", "TRIG【FIELD】:draw")[0];
  assert.ok(metadata);
  const state = makeState({
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
  });
  state.resolutionQueue = [
    {
      effectId: metadata.effectId,
      sourceInstanceId: "source",
      controllerId: "bot",
      context: {
        "event:type": "called",
        "event:sequence": {} as unknown as number,
        "event:visibility": "public",
        "event:playerId": "bot",
      },
    } as unknown as Resolution,
  ];
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      metadata.effectId,
      {
        effectId: metadata.effectId,
        metadata,
        canResolve: () => true,
        resolve: () => [{ type: "draw", playerId: "bot", count: 1 }],
      },
    ],
  ]);
  const before = JSON.stringify(state);

  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

test("rejects activated resolutions without legal action provenance", () => {
  const metadata = parseAbilityText("TEST-SOURCE", "ACTI【BATTLE】:activate")[0];
  assert.ok(metadata);
  const state = makeState({
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    resolutionQueue: [
      {
        effectId: metadata.effectId,
        sourceInstanceId: "source",
        controllerId: "player",
        context: {
          "event:type": "activate-effect",
          "event:sequence": 1,
          "event:visibility": "private",
          "event:playerId": "player",
          "event:data:effectId": metadata.effectId,
          "event:data:sourceInstanceId": "source",
        },
      },
    ],
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      metadata.effectId,
      {
        effectId: metadata.effectId,
        metadata,
        canResolve: () => true,
        resolve: () => [
          { type: "modify", instanceId: "source", attribute: "power", amount: 100 },
        ],
      },
    ],
  ]);
  const before = JSON.stringify(state);

  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

test("rejects arbitrary choice context keys", () => {
  const metadata = parseAbilityText("TEST-SOURCE", "TRIG【FIELD】:choose")[0];
  assert.ok(metadata);
  const state = makeState({
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    resolutionQueue: [{
      effectId: metadata.effectId,
      sourceInstanceId: "source",
      controllerId: "player",
      context: {
        "event:type": "called",
        "event:sequence": 1,
        "event:visibility": "public",
        "event:playerId": "player",
        "event:data:instanceId": "source",
        "choice:forged": ["target"],
      },
    }],
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      metadata.effectId,
      {
        effectId: metadata.effectId,
        metadata,
        canResolve: () => true,
        resolve: () => [{
          type: "choose-target",
          choiceId: "target",
          playerId: "player",
          filter: { controller: "opponent", zones: ["front"] },
          min: 0,
          max: 1,
        }],
      },
    ],
  ]);
  const before = JSON.stringify(state);

  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

test("rejects serialized choice values outside the current operation", () => {
  const metadata = parseAbilityText("TEST-SOURCE", "TRIG【FIELD】:choose")[0];
  assert.ok(metadata);
  const event: GameEvent = {
    sequence: 1,
    type: "called",
    visibility: "public",
    playerId: "player",
    data: { instanceId: "source" },
  };
  const state = makeState({
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    events: [event],
    resolutionQueue: [{
      effectId: metadata.effectId,
      sourceInstanceId: "source",
      controllerId: "player",
      context: {
        "event:type": event.type,
        "event:sequence": event.sequence,
        "event:visibility": event.visibility,
        "event:playerId": "player",
        "event:data:instanceId": "source",
        "choice:target": ["forged-target"],
      },
    }],
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      metadata.effectId,
      {
        effectId: metadata.effectId,
        metadata,
        canResolve: () => true,
        resolve: () => [{
          type: "choose-options",
          choiceId: "target",
          playerId: "player",
          options: ["yes", "no"],
          min: 1,
          max: 1,
        }],
      },
    ],
  ]);
  const before = JSON.stringify(state);

  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

test("requires a resolution context to match the stored source event", () => {
  const metadata = parseAbilityText("TEST-SOURCE", "TRIG【FIELD】:effect")[0];
  assert.ok(metadata);
  const storedEvent: GameEvent = {
    sequence: 1,
    type: "called",
    visibility: "public",
    playerId: "player",
    data: { instanceId: "source" },
  };
  const state = makeState({
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    events: [storedEvent],
    resolutionQueue: [{
      effectId: metadata.effectId,
      sourceInstanceId: "source",
      controllerId: "player",
      context: {
        "event:type": "called",
        "event:sequence": 1,
        "event:visibility": "public",
        "event:playerId": "player",
        "event:data:instanceId": "other-source",
      },
    }],
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [metadata.effectId, { effectId: metadata.effectId, metadata, canResolve: () => true, resolve: () => [] }],
  ]);
  const before = JSON.stringify(state);

  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

test("rejects a malformed operation without applying earlier operations", () => {
  const metadata = parseAbilityText("TEST-SOURCE", "TRIG【FIELD】:mutate")[0];
  assert.ok(metadata);
  const state = makeState({
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    resolutionQueue: [
      {
        effectId: metadata.effectId,
        sourceInstanceId: "source",
        controllerId: "player",
        context: {
          "event:type": "called",
          "event:sequence": 1,
          "event:visibility": "public",
          "event:playerId": "player",
          "event:data:instanceId": "source",
        },
      },
    ],
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      metadata.effectId,
      {
        effectId: metadata.effectId,
        metadata,
        canResolve: () => true,
        resolve: () => [
          { type: "modify", instanceId: "source", attribute: "power", amount: 100 },
          {
            type: "move",
            instanceId: "source",
            destination: "unknown-zone",
          } as unknown as EffectOperation,
        ],
      },
    ],
  ]);
  const before = JSON.stringify(state);

  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

test("rejects malformed choices and target selections without mutating state", () => {
  const metadata = parseAbilityText("TEST-SOURCE", "TRIG【FIELD】:choose")[0];
  assert.ok(metadata);
  const state = makeState({
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    resolutionQueue: [
      {
        effectId: metadata.effectId,
        sourceInstanceId: "source",
        controllerId: "player",
        context: {
          "event:type": "called",
          "event:sequence": 1,
          "event:visibility": "public",
          "event:playerId": "player",
        },
      },
    ],
    pendingChoice: {
      type: "target",
      playerId: "player",
      choiceId: "target",
      effectId: metadata.effectId,
      sourceInstanceId: "source",
      options: ["missing-target"],
      min: 1,
      max: 1,
      filter: { controller: "opponent", zones: ["front"] },
    },
  });
  const before = JSON.stringify(state);

  assert.equal(applyEffectChoice(state, "target", "missing-target"), false);
  assert.equal(JSON.stringify(state), before);
});

test("rejects duplicate target selections without mutation", () => {
  const source = instance("source", "TEST-SOURCE", "player", "front");
  const target = instance("target", "TEST-TARGET", "bot", "front");
  const other = instance("other", "TEST-OTHER", "bot", "back");
  const state = makeState({
    actionWindow: "effect-choice",
    instances: { source, target, other },
    players: {
      player: playerState({ battle: { front: "source" } }),
      bot: playerState({ battle: { front: "target", back: "other" } }),
    },
    resolutionQueue: [resolution("TEST-SOURCE#1", "source", "player")],
    pendingChoice: {
      type: "target",
      playerId: "player",
      choiceId: "target",
      effectId: "TEST-SOURCE#1",
      sourceInstanceId: "source",
      options: ["target", "other"],
      min: 1,
      max: 2,
      filter: { controller: "opponent", zones: ["front", "back"] },
    },
  });
  const before = JSON.stringify(state);

  assert.equal(applyEffectChoice(state, "target", ["target", "target"]), false);
  assert.equal(JSON.stringify(state), before);
});

test("rechecks target membership and filter when applying a choice", () => {
  const source = instance("source", "TEST-SOURCE", "player", "front");
  const target = instance("target", "TEST-TARGET", "bot", "front");
  const state = makeState({
    actionWindow: "effect-choice",
    instances: { source, target },
    players: {
      player: playerState({ battle: { front: "source" } }),
      bot: playerState({ base: ["target"] }),
    },
    resolutionQueue: [resolution("TEST-SOURCE#1", "source", "player")],
    pendingChoice: {
      type: "target",
      playerId: "player",
      choiceId: "target",
      effectId: "TEST-SOURCE#1",
      sourceInstanceId: "source",
      options: ["target"],
      min: 1,
      max: 1,
      filter: { controller: "opponent", zones: ["front"] },
    },
  });
  state.instances.target = { ...state.instances.target, zone: "base" };
  const before = JSON.stringify(state);

  assert.equal(applyEffectChoice(state, "target", "target"), false);
  assert.equal(JSON.stringify(state), before);
});

test("rejects malformed resume context without mutation", () => {
  const state = makeState({
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    resolutionQueue: [{
      ...resolution("TEST-SOURCE#1", "source", "player"),
      context: {
        ...resolution("TEST-SOURCE#1", "source", "player").context,
        "resume:actionWindow": "invalid-window",
      },
    }],
    pendingChoice: {
      type: "effect",
      playerId: "player",
      choiceId: "mode",
      effectId: "TEST-SOURCE#1",
      sourceInstanceId: "source",
      options: ["yes"],
      min: 1,
      max: 1,
    },
  });
  const before = JSON.stringify(state);

  assert.equal(applyEffectChoice(state, "mode", "yes"), false);
  assert.equal(JSON.stringify(state), before);
});

test("rejects a pending choice whose resolution context is missing", () => {
  const state = makeState({
    actionWindow: "effect-choice",
    priorityPlayer: "player",
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    resolutionQueue: [{
      effectId: "TEST-SOURCE#1",
      sourceInstanceId: "source",
      controllerId: "player",
      context: undefined,
    } as unknown as Resolution],
    pendingChoice: {
      type: "effect",
      playerId: "player",
      choiceId: "mode",
      effectId: "TEST-SOURCE#1",
      sourceInstanceId: "source",
      options: ["yes"],
      min: 1,
      max: 1,
    },
  });

  assert.doesNotThrow(() => {
    assert.equal(applyEffectChoice(state, "mode", "yes"), false);
  });
});

test("rejects a pending choice without a resumable action window", () => {
  const event: GameEvent = {
    sequence: 1,
    type: "called",
    visibility: "public",
    playerId: "player",
    data: { instanceId: "source" },
  };
  const state = makeState({
    actionWindow: "effect-choice",
    priorityPlayer: "player",
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    events: [event],
    resolutionQueue: [{
      effectId: "TEST-SOURCE#1",
      sourceInstanceId: "source",
      controllerId: "player",
      context: {
        "event:type": event.type,
        "event:sequence": event.sequence,
        "event:visibility": event.visibility,
        "event:playerId": "player",
        "event:data:instanceId": "source",
      },
    }],
    pendingChoice: {
      type: "effect",
      playerId: "player",
      choiceId: "mode",
      effectId: "TEST-SOURCE#1",
      sourceInstanceId: "source",
      options: ["yes"],
      min: 1,
      max: 1,
    },
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      "TEST-SOURCE#1",
      {
        effectId: "TEST-SOURCE#1",
        metadata: parseAbilityText("TEST-SOURCE", "TRIG【FIELD】:choose")[0]!,
        canResolve: () => true,
        resolve: (context) => context.resolutionContext?.["choice:mode"] === undefined
          ? [{ type: "choose-options", choiceId: "mode", playerId: "player", options: ["yes"], min: 1, max: 1 }]
          : [],
      },
    ],
  ]);

  assert.equal(applyEffectChoice(state, "mode", "yes", registry), false);
});

test("skips an optional target choice when no targets are available", () => {
  const metadata = parseAbilityText("TEST-SOURCE", "TRIG【FIELD】:choose")[0];
  assert.ok(metadata);
  const state = makeState({
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    events: [{
      sequence: 1,
      type: "called",
      visibility: "public",
      playerId: "player",
      data: { instanceId: "source" },
    }],
    resolutionQueue: [
      {
        effectId: metadata.effectId,
        sourceInstanceId: "source",
        controllerId: "player",
        context: {
          "event:type": "called",
          "event:sequence": 1,
          "event:visibility": "public",
          "event:playerId": "player",
          "event:data:instanceId": "source",
        },
      },
    ],
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      metadata.effectId,
      {
        effectId: metadata.effectId,
        metadata,
        canResolve: () => true,
        resolve: (context) => {
          if (context.resolutionContext?.["choice:target"] !== undefined) return [];
          return [
            {
              type: "choose-target",
              choiceId: "target",
              playerId: "player",
              filter: { controller: "opponent", zones: ["front"] },
              min: 0,
              max: 1,
            },
          ];
        },
      },
    ],
  ]);

  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, true);
  assert.equal(state.pendingChoice, null);
  assert.equal(state.resolutionQueue.length, 0);
});

test("rejects unauthorized operations and unknown destinations without mutation", () => {
  const state = makeState({
    instances: { source: instance("source", "TEST-SOURCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
  });
  const before = JSON.stringify(state);

  const events = applyEffectOperation(
    state,
    {
      type: "move",
      instanceId: "source",
      destination: "unknown-zone",
    } as unknown as Extract<EffectOperation, { type: "move" }>,
    { controllerId: "bot", sourceInstanceId: "source" },
  );

  assert.deepEqual(events, []);
  assert.equal(JSON.stringify(state), before);
});

test("rejects malformed target filters and numeric turn values", () => {
  const source = instance("source", "TEST-SOURCE", "player", "front");
  const state = makeState({
    instances: { source },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
  });
  const before = JSON.stringify(state);

  assert.doesNotThrow(() =>
    selectEffectTargets(state, "player", {
      controller: "self",
      zones: ["front"],
      nameIncludes: 7 as unknown as string,
    }),
  );
  assert.deepEqual(
    selectEffectTargets(state, "player", {
      controller: "self",
      zones: ["front"],
      nameIncludes: 7 as unknown as string,
    }),
    [],
  );
  assert.deepEqual(
    applyEffectOperation(
      state,
      { type: "set-turn-state", instanceId: "source", field: "additionalAttacks", value: -1 },
      { controllerId: "player", sourceInstanceId: "source" },
    ),
    [],
  );
  assert.deepEqual(
    applyEffectOperation(
      state,
      { type: "set-turn-state", instanceId: "source", field: "additionalAttacks", value: 1.5 },
      { controllerId: "player", sourceInstanceId: "source" },
    ),
    [],
  );
  assert.deepEqual(
    applyEffectOperation(
      state,
      { type: "modify", instanceId: "source", attribute: "power", amount: Number.NaN },
      { controllerId: "player", sourceInstanceId: "source" },
    ),
    [],
  );
  assert.equal(JSON.stringify(state), before);
});

test("rejects movement into an occupied battle slot without mutation", () => {
  const source = instance("source", "TEST-SOURCE", "player", "front");
  const target = instance("target", "TEST-TARGET", "player", "back");
  const state = makeState({
    instances: { source, target },
    players: {
      player: playerState({ battle: { front: "source", back: "target" } }),
      bot: playerState(),
    },
  });
  const before = JSON.stringify(state);

  assert.deepEqual(
    applyEffectOperation(
      state,
      { type: "move", instanceId: "source", destination: "back" },
      { controllerId: "player", sourceInstanceId: "source" },
    ),
    [],
  );
  assert.equal(JSON.stringify(state), before);
});

test("moves attached cards with their parent and preserves attachment invariants", () => {
  const parent = instance("parent", "TEST-PARENT", "player", "front");
  const attachment = {
    ...instance("attachment", "TEST-ATTACHMENT", "player", "front"),
    attachedTo: "parent",
  };
  parent.attachmentIds = ["attachment"];
  const state = makeState({
    instances: { parent, attachment },
    players: { player: playerState({ battle: { front: "parent" } }), bot: playerState() },
  });

  const events = applyEffectOperation(
    state,
    { type: "move", instanceId: "parent", destination: "base" },
    { controllerId: "player", sourceInstanceId: "parent" },
  );

  assert.equal(events.length > 0, true);
  assert.equal(state.instances.parent.zone, "base");
  assert.equal(state.instances.attachment.zone, "base");
  assert.equal(state.instances.attachment.attachedTo, "parent");
  assert.deepEqual(state.instances.parent.attachmentIds, ["attachment"]);
  assert.equal(state.players.player.base.includes("parent"), true);
  assert.equal(state.players.player.battle.front, null);
  assert.equal(state.players.player.base.includes("attachment"), false);
});

test("rejects detaching a Base attachment into a full Base without mutation", () => {
  const parent = instance("parent", "TEST-PARENT", "player", "base");
  const attachment = {
    ...instance("attachment", "TEST-ATTACHMENT", "player", "base"),
    attachedTo: "parent",
  };
  const baseCards = [
    parent,
    ...Array.from({ length: 5 }, (_, index) =>
      instance(`base-${index}`, "TEST-BASE", "player", "base"),
    ),
  ];
  parent.attachmentIds = ["attachment"];
  const state = makeState({
    instances: Object.fromEntries(
      [...baseCards, attachment].map((card) => [card.instanceId, card]),
    ),
    players: {
      player: playerState({ base: baseCards.map((card) => card.instanceId) }),
      bot: playerState(),
    },
  });
  const before = JSON.stringify(state);

  assert.deepEqual(
    applyEffectOperation(
      state,
      { type: "detach", instanceId: "attachment", destination: "base" },
      { controllerId: "player", sourceInstanceId: "attachment" },
    ),
    [],
  );
  assert.equal(JSON.stringify(state), before);
});

test("rejects cyclic attachment state before resolving effects", () => {
  const parent = {
    ...instance("parent", "TEST-PARENT", "player", "front"),
    attachedTo: "attachment",
    attachmentIds: ["attachment"],
  };
  const attachment = {
    ...instance("attachment", "TEST-ATTACHMENT", "player", "front"),
    attachedTo: "parent",
    attachmentIds: ["parent"],
  };
  const state = makeState({
    instances: { parent, attachment },
    players: { player: playerState(), bot: playerState() },
  });
  const before = JSON.stringify(state);

  const result = resolveEffectQueue(state, new Map());

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

test("rejects dangling player-area references before resolving effects", () => {
  const state = makeState({
    players: {
      player: playerState({ hand: ["missing"] }),
      bot: playerState(),
    },
  });
  const before = JSON.stringify(state);

  const result = resolveEffectQueue(state, new Map());

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

test("failed once-per-turn resolutions do not consume their marker", () => {
  const metadata = parseAbilityText(
    "TEST-ONCE",
    "TRIG【FIELD/ONCE PER TURN】:effect",
  )[0];
  assert.ok(metadata);
  const event: GameEvent = {
    sequence: 1,
    type: "called",
    visibility: "public",
    playerId: "player",
    data: { instanceId: "source" },
  };
  const state = makeState({
    instances: { source: instance("source", "TEST-ONCE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    events: [event],
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      metadata.effectId,
      {
        effectId: metadata.effectId,
        metadata,
        canResolve: () => true,
        resolve: () => [
          {
            type: "move",
            instanceId: "source",
            destination: "invalid",
          } as unknown as EffectOperation,
        ],
      },
    ],
  ]);
  state.resolutionQueue = [...queueTriggeredEffects(state, event, registry)];

  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, false);
  assert.deepEqual(state.instances.source.turnState.usedEffectIds, []);
});

test("rejects activated resolutions replayed from an earlier turn", () => {
  const metadata = parseAbilityText("TEST-ACTIVE", "ACTI【BATTLE】:activate")[0];
  assert.ok(metadata);
  const event: GameEvent = {
    sequence: 1,
    type: "activate-effect",
    visibility: "private",
    playerId: "player",
    data: {
      effectId: metadata.effectId,
      sourceInstanceId: "source",
      phase: "action",
      window: "action",
      turnNumber: 1,
      counter: false,
    },
  };
  const state = makeState({
    turnNumber: 2,
    phase: "action",
    actionWindow: "action",
    instances: { source: instance("source", "TEST-ACTIVE", "player", "front") },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    events: [event],
    resolutionQueue: [{
      effectId: metadata.effectId,
      sourceInstanceId: "source",
      controllerId: "player",
      context: {
        "event:type": event.type,
        "event:sequence": event.sequence,
        "event:visibility": event.visibility,
        "event:playerId": "player",
        "event:data:effectId": metadata.effectId,
        "event:data:sourceInstanceId": "source",
        "event:data:phase": "action",
        "event:data:window": "action",
        "event:data:turnNumber": 1,
        "event:data:counter": false,
        "action:phase": "action",
        "action:window": "action",
        "action:counter": false,
      },
    }],
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      metadata.effectId,
      {
        effectId: metadata.effectId,
        metadata,
        canResolve: () => true,
        resolve: () => [
          { type: "modify", instanceId: "source", attribute: "power", amount: 1 },
        ],
      },
    ],
  ]);

  const result = resolveEffectQueue(state, registry);

  assert.equal(result.ok, false);
  assert.deepEqual(state.instances.source.modifiers, []);
});

test("face-down battle sources do not queue battle triggers", () => {
  const metadata = parseAbilityText("TEST-HIDDEN", "TRIG【BATTLE】:effect")[0];
  assert.ok(metadata);
  const event: GameEvent = {
    sequence: 1,
    type: "called",
    visibility: "public",
    playerId: "player",
    data: { instanceId: "source" },
  };
  const state = makeState({
    instances: {
      source: { ...instance("source", "TEST-HIDDEN", "player", "front"), faceDown: true },
    },
    players: { player: playerState({ battle: { front: "source" } }), bot: playerState() },
    events: [event],
  });
  const registry = new Map<string, RuntimeEffectDefinition>([
    [
      metadata.effectId,
      { effectId: metadata.effectId, metadata, canResolve: () => true, resolve: () => [] },
    ],
  ]);

  assert.deepEqual(queueTriggeredEffects(state, event, registry), []);
});

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    rulesetVersion: "1.03",
    engineVersion: "0.1.0",
    seed: 1,
    rngState: 1,
    turnNumber: 1,
    actionCallsThisTurn: 0,
    baseDeploymentUsed: false,
    battleRearrangementUsed: true,
    firstPlayer: "player",
    activePlayer: "player",
    priorityPlayer: "player",
    phase: "action",
    actionWindow: "action",
    battle: null,
    players: {
      player: playerState(),
      bot: playerState(),
    },
    instances: {},
    pendingChoice: null,
    resolutionQueue: [],
    events: [],
    winner: null,
    ...overrides,
  };
}

function playerState(
  overrides: Partial<Omit<PlayerState, "battle">> & {
    battle?: Partial<PlayerState["battle"]>;
  } = {},
): PlayerState {
  const { battle, ...rest } = overrides;
  return {
    deck: [],
    hand: [],
    base: [],
    timeline: [],
    retreat: [],
    void: [],
    rushPointDeck: [],
    ...rest,
    battle: {
      front: null,
      wingLeft: null,
      wingRight: null,
      back: null,
      ...battle,
    },
  };
}

function instance(
  instanceId: string,
  cardCode: string,
  controllerId: "player" | "bot",
  zone: CardInstance["zone"],
): CardInstance {
  return {
    instanceId,
    cardCode,
    originalLevel: 1,
    originalPower: 1000,
    originalRange: 1,
    ownerId: controllerId,
    controllerId,
    zone,
    faceDown: zone === "deck" || zone === "base",
    covered: false,
    attachedTo: null,
    attachmentIds: [],
    modifiers: [],
    turnState: { attacked: false, moved: false, placed: false, usedEffectIds: [] },
  };
}

function resolution(effectId: string, sourceInstanceId: string, controllerId: "player" | "bot"): Resolution {
  return {
    effectId,
    sourceInstanceId,
    controllerId,
    context: {
      "event:type": "called",
      "event:sequence": 1,
      "event:visibility": "public",
      "event:playerId": controllerId,
    },
  };
}
