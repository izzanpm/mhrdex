import assert from "node:assert/strict";
import test from "node:test";

import type {
  CardInstance,
  GameAction,
  GameState,
  PlayerState,
} from "./types";

const playerState: PlayerState = {
  deck: ["player-deck-1"],
  hand: ["player-hand-1"],
  battle: {
    front: "player-front-1",
    wingLeft: null,
    wingRight: null,
    back: null,
  },
  base: ["player-base-1"],
  timeline: [],
  retreat: [],
  void: [],
  rushPointDeck: ["player-rush-1"],
};

const botState: PlayerState = {
  deck: ["bot-deck-1"],
  hand: [],
  battle: {
    front: null,
    wingLeft: "bot-wing-left-1",
    wingRight: null,
    back: null,
  },
  base: [],
  timeline: ["bot-rush-1"],
  retreat: [],
  void: [],
  rushPointDeck: [],
};

const attachedCard: CardInstance = {
  instanceId: "player-attachment-1",
  cardCode: "BP01-002",
  ownerId: "player",
  controllerId: "player",
  zone: "front",
  faceDown: false,
  covered: false,
  attachedTo: "player-front-1",
  attachmentIds: [],
  modifiers: [
    {
      attribute: "power",
      amount: 100,
      expiresAtTurn: 2,
    },
  ],
  turnState: {
    attacked: false,
    moved: false,
    placed: true,
    usedEffectIds: ["BP01-002#1"],
  },
};

const sampleState: GameState = {
  rulesetVersion: "1.03",
  engineVersion: "0.1.0",
  seed: 12345,
  rngState: 67890,
  turnNumber: 1,
  actionCallsThisTurn: 1,
  baseDeploymentUsed: true,
  battleRearrangementUsed: false,
  firstPlayer: "player",
  activePlayer: "player",
  priorityPlayer: "player",
  phase: "action",
  actionWindow: "effect-choice",
  battle: {
    attackerId: "player-front-1",
    attackerSlot: "front",
    targetId: "weakness:front",
    targetSlot: "front",
    consecutivePasses: 1,
    resolved: false,
    outcome: null,
  },
  players: {
    player: playerState,
    bot: botState,
  },
  instances: {
    "player-base-1": {
      instanceId: "player-base-1",
      cardCode: "BP01-001",
      ownerId: "player",
      controllerId: "player",
      zone: "base",
      faceDown: true,
      covered: false,
      attachedTo: null,
      attachmentIds: ["player-attachment-1"],
      modifiers: [],
      turnState: {
        attacked: false,
        moved: false,
        placed: true,
        usedEffectIds: [],
      },
    },
    "player-front-1": {
      instanceId: "player-front-1",
      cardCode: "BP01-003",
      ownerId: "player",
      controllerId: "player",
  zone: "front",
  faceDown: false,
  covered: false,
  attachedTo: null,
      attachmentIds: ["player-attachment-1"],
      modifiers: [],
      turnState: {
        attacked: true,
        moved: false,
        placed: false,
        usedEffectIds: [],
      },
    },
    "player-attachment-1": attachedCard,
  },
  pendingChoice: {
    type: "effect",
    playerId: "player",
    choiceId: "choose-target",
    effectId: "BP01-003#1",
    sourceInstanceId: "player-front-1",
    options: ["bot-wing-left-1"],
    min: 1,
    max: 1,
  },
  resolutionQueue: [
    {
      effectId: "BP01-003#1",
      sourceInstanceId: "player-front-1",
      controllerId: "player",
      context: {
        targetZone: "battle",
        amount: 1,
      },
    },
  ],
  events: [
    {
      sequence: 1,
      type: "base-deployed",
      visibility: "public",
      playerId: "player",
      data: {
        instanceId: "player-base-1",
      },
    },
  ],
  winner: null,
};

test("simulator state is JSON serializable", () => {
  const restored = JSON.parse(JSON.stringify(sampleState)) as GameState;

  assert.deepEqual(restored, sampleState);
  assert.equal(restored.instances["player-base-1"].faceDown, true);
  assert.deepEqual(restored.instances["player-base-1"].attachmentIds, [
    "player-attachment-1",
  ]);
  assert.deepEqual(restored.battle, {
    attackerId: "player-front-1",
    attackerSlot: "front",
    targetId: "weakness:front",
    targetSlot: "front",
    consecutivePasses: 1,
    resolved: false,
    outcome: null,
  });
  if (restored.pendingChoice?.type === "effect") {
    assert.deepEqual(restored.pendingChoice.options, ["bot-wing-left-1"]);
  } else {
    assert.fail("expected the pending effect choice to survive serialization");
  }
});

test("game actions keep their discriminated payloads serializable", () => {
  const actions: readonly GameAction[] = [
    {
      type: "submit-mulligan",
      playerId: "player",
      instanceIds: ["player-hand-1"],
    },
    { type: "base-deploy", playerId: "player", instanceId: "player-hand-1" },
    {
      type: "call",
      playerId: "player",
      instanceId: "player-hand-1",
      sacrifices: ["player-front-1"],
    },
    {
      type: "battle-base-move",
      playerId: "player",
      instanceId: "player-front-1",
      destination: "back",
    },
    { type: "end-action-phase", playerId: "player" },
    {
      type: "rearrange-battle",
      playerId: "player",
      order: {
        front: "player-front-1",
        wingLeft: null,
        wingRight: null,
        back: null,
      },
    },
    {
      type: "declare-attack",
      playerId: "player",
      attackerId: "player-front-1",
    },
    {
      type: "select-attack-target",
      playerId: "player",
      targetId: "weakness:front",
    },
    { type: "battle-confirmation", playerId: "player" },
    { type: "counter-pass", playerId: "bot" },
    {
      type: "counter-call",
      playerId: "bot",
      instanceId: "bot-hand-1",
      sacrifices: [],
    },
    {
      type: "counter-effect",
      playerId: "bot",
      effectId: "BP01-004#1",
      sourceInstanceId: "bot-wing-left-1",
    },
    {
      type: "choose-effect",
      playerId: "player",
      choiceId: "choose-target",
      value: ["bot-wing-left-1"],
    },
  ];

  assert.deepEqual(JSON.parse(JSON.stringify(actions)), actions);
});
