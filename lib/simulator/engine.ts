import { createRuntimeRushPointDeck } from "./adapter";
import { createRuntimeEffectRegistry } from "./cards";
import {
  applyEffectChoice,
  getCurrentCardAttribute,
  moveCardTreeToZone,
  parseAbilityText,
  queueTriggeredEffects,
  resolveEffectQueue,
  syncAttachedTreeZone,
} from "./effects";
import {
  getAreaLimit,
  getBattleDistance,
  getLegalBattleTargets,
  getOpponent,
  hasUniqueFieldMemberships,
  isBattleSlot,
  isWinningTimeline,
} from "./rules";
import type {
  BattleSlot,
  BattleContext,
  BattleOutcome,
  BattleTarget,
  CardInstance,
  EngineResult,
  GameAction,
  GameEvent,
  GameState,
  PendingChoice,
  PlayerId,
  PlayerState,
  RuntimeCardMetadata,
  SimulatorCardDefinition,
  SimulatorDeckEntry,
} from "./types";

const BATTLE_SLOTS: readonly BattleSlot[] = [
  "front",
  "wingLeft",
  "wingRight",
  "back",
];

type EventSpec = Omit<GameEvent, "sequence">;

type ValidBattleContext = {
  attackerId: string;
  attackerSlot: BattleSlot;
  targetId: BattleTarget;
  targetSlot: BattleSlot;
};

type SetupInput = {
  playerEntries: readonly SimulatorDeckEntry[];
  botEntries: readonly SimulatorDeckEntry[];
  definitions: ReadonlyMap<string, SimulatorCardDefinition>;
  seed: number;
  firstPlayer: PlayerId;
};

export function setupGame(input: SetupInput): GameState {
  let rngState = normalizeSeed(input.seed);
  const instances: Record<string, CardInstance> = {};
  const playerDeck = createCharacterDeck(
    "player",
    input.playerEntries,
    input.definitions,
    instances,
  );
  const botDeck = createCharacterDeck(
    "bot",
    input.botEntries,
    input.definitions,
    instances,
  );
  const playerRushPointDeck = createRushPointDeck("player", instances);
  const botRushPointDeck = createRushPointDeck("bot", instances);
  const cardMetadata = createCardMetadata(input.definitions);

  let shuffled: readonly string[];
  ({ values: shuffled, rngState } = shuffle(playerDeck, rngState));
  const shuffledPlayerDeck = [...shuffled];
  ({ values: shuffled, rngState } = shuffle(botDeck, rngState));
  const shuffledBotDeck = [...shuffled];
  ({ values: shuffled, rngState } = shuffle(playerRushPointDeck, rngState));
  const shuffledPlayerRushPointDeck = [...shuffled];
  ({ values: shuffled, rngState } = shuffle(botRushPointDeck, rngState));
  const shuffledBotRushPointDeck = [...shuffled];

  const players: Record<PlayerId, PlayerState> = {
    player: createPlayerState(
      shuffledPlayerDeck,
      shuffledPlayerRushPointDeck,
    ),
    bot: createPlayerState(shuffledBotDeck, shuffledBotRushPointDeck),
  };
  const state: GameState = {
    rulesetVersion: "1.03",
    engineVersion: "0.1.0",
    seed: input.seed,
    rngState,
    turnNumber: 1,
    actionCallsThisTurn: 0,
    baseDeploymentUsed: false,
    battleRearrangementUsed: false,
    firstPlayer: input.firstPlayer,
    activePlayer: input.firstPlayer,
    priorityPlayer: input.firstPlayer,
    phase: "mulligan",
    actionWindow: "mulligan",
    battle: null,
    players,
    instances,
    cardMetadata,
    pendingChoice: {
      type: "mulligan",
      playerId: input.firstPlayer,
      instanceIds: [],
    },
    resolutionQueue: [],
    pendingEndPhase: false,
    events: [
      {
        sequence: 1,
        type: "game-setup",
        visibility: "public",
        playerId: null,
        data: {
          firstPlayer: input.firstPlayer,
        },
      },
    ],
    winner: null,
  };
  drawCards(state, "player", 6);
  drawCards(state, "bot", 6);
  return state;
}

export function getLegalActions(
  state: GameState,
  playerId: PlayerId,
): readonly GameAction[] {
  if (
    state.winner !== null ||
    state.phase === "game-over" ||
    state.priorityPlayer !== playerId
  ) {
    return [];
  }

  if (state.pendingChoice !== null) {
    if (
      state.pendingChoice.playerId !== playerId ||
      state.pendingChoice.type !== "mulligan"
    ) return [];
    return getMulliganActions(state.players[playerId].hand, playerId);
  }

  if (state.resolutionQueue.length > 0) {
    return [];
  }

  if (state.phase === "battle") {
    return getLegalBattleActions(state, playerId);
  }
  if (state.phase === "counter" && state.actionWindow === "counter-phase") {
    return isValidCounterPhaseContext(state)
      ? [
          { type: "counter-pass" as const, playerId },
          ...getLegalCallActions(state, playerId, "counter-call"),
          ...getLegalEffectActions(state, playerId, true),
        ]
      : [];
  }
  if (state.phase !== "action" || state.actionWindow !== "action") {
    return [];
  }

  const actions: GameAction[] = [];
  const player = state.players[playerId];
  const hand = player.hand.filter((instanceId) => {
    const instance = state.instances[instanceId];
    return isControlledBy(instance, playerId) && instance.zone === "hand";
  });

  if (!state.baseDeploymentUsed && player.base.length < getBaseLimit()) {
    for (const instanceId of hand) {
      actions.push({ type: "base-deploy", playerId, instanceId });
    }
  }

  if (state.actionCallsThisTurn < getCallLimit(state)) {
    actions.push(...getLegalCallActions(state, playerId, "call"));
  }

  actions.push(...getLegalMoveActions(state, playerId));
  actions.push(...getLegalEffectActions(state, playerId, false));
  actions.push({ type: "end-action-phase", playerId });
  return actions;
}

export function applyAction(
  state: GameState,
  action: GameAction,
): EngineResult {
  const result = applyActionInternal(state, action);
  if (!result.ok || action.playerId !== "bot") return result;

  const next = cloneState(result.state);
  next.rngState = nextRandom(next.rngState).rngState;
  return { ok: true, state: next, events: result.events };
}

function applyActionInternal(
  state: GameState,
  action: GameAction,
): EngineResult {
  if (!isPlayerId(action.playerId)) {
    return failure(state, "invalid-player", "The action player is invalid.");
  }
  if (state.winner !== null || state.phase === "game-over") {
    return failure(state, "game-over", "The game is already over.");
  }

  if (state.pendingChoice !== null) {
    if (
      state.pendingChoice.type === "mulligan" &&
      action.type === "submit-mulligan"
    ) {
      return applyMulligan(state, action);
    }
    if (
      (state.pendingChoice.type === "effect" ||
        state.pendingChoice.type === "target") &&
      action.type === "choose-effect"
    ) {
      return applyEffectChoiceAction(state, action);
    }
    return failure(
      state,
      "invalid-action",
      "A pending choice must be resolved before another action.",
    );
  }

  if (state.resolutionQueue.length > 0) {
    return failure(
      state,
      "invalid-action",
      "The resolution queue must be resolved before another action.",
    );
  }
  if (action.type === "submit-mulligan") {
    return failure(
      state,
      "invalid-phase",
      "Mulligan decisions are not open in this phase.",
    );
  }
  if (action.playerId !== state.priorityPlayer) {
    return failure(
      state,
      "not-priority-player",
      "Only the priority player may act.",
    );
  }

  if (state.phase === "action" && state.actionWindow === "action") {
    switch (action.type) {
      case "base-deploy":
        return applyBaseDeployment(state, action);
      case "call":
        return applyCall(state, action);
      case "battle-base-move":
        return applyBattleBaseMove(state, action);
      case "activate-effect":
        return applyEffectAction(state, action, false);
      case "end-action-phase":
        return applyEndActionPhase(state, action);
      default:
        return failure(
          state,
          "invalid-action",
          "That action is not implemented in the current engine phase.",
        );
    }
  }

  if (state.phase === "battle") {
    switch (action.type) {
      case "rearrange-battle":
        return applyBattleRearrangement(state, action);
      case "declare-attack":
        return applyDeclareAttack(state, action);
      case "select-attack-target":
        return applySelectAttackTarget(state, action);
      case "counter-pass":
        return applyBattleCounterPass(state, action);
      case "counter-call":
        return applyCall(state, action);
      case "counter-effect":
        return applyEffectAction(state, action, true);
      case "activate-effect":
        return applyEffectAction(state, action, false);
      case "battle-confirmation":
        return applyBattleConfirmation(state, action);
      default:
        return failure(
          state,
          "invalid-action",
          "That action is not implemented in the current battle window.",
        );
    }
  }

  if (state.phase === "counter" && state.actionWindow === "counter-phase") {
    if (action.type === "counter-pass") {
      return applyCounterPhasePass(state, action);
    }
    if (action.type === "counter-call") {
      return applyCall(state, action);
    }
    if (action.type === "counter-effect") {
      return applyEffectAction(state, action, true);
    }
    return failure(
      state,
      "invalid-action",
      "Only passing is available in the current Counter Phase.",
    );
  }

  return failure(
    state,
    "invalid-phase",
    "This action is not available in the current phase.",
  );
}

function applyEffectAction(
  state: GameState,
  action: Extract<GameAction, { type: "activate-effect" | "counter-effect" }>,
  counter: boolean,
): EngineResult {
  if (!isPermittedEffectActionWindow(state, counter)) {
    return failure(state, "invalid-phase", "The effect action window is not open.");
  }
  const registry = createRuntimeEffectRegistry(
    state.cardMetadata === undefined ? undefined : Object.values(state.cardMetadata),
  );
  const definition = registry.get(action.effectId);
  const source = state.instances[action.sourceInstanceId];
  if (
    definition === undefined ||
    definition.metadata.kind !== "activated" ||
    definition.metadata.counter !== counter ||
    source === undefined ||
    source.controllerId !== action.playerId ||
    !effectSourceAtLocation(
      source.zone,
      source.faceDown,
      definition.metadata.locations,
    ) ||
    (definition.metadata.oncePerTurn &&
      source.turnState.usedEffectIds.includes(action.effectId))
  ) {
    return failure(state, "invalid-target", "The effect cannot be activated from this state.");
  }

  const event: GameEvent = {
    sequence: (state.events.at(-1)?.sequence ?? 0) + 1,
    type: "activate-effect",
    visibility: "private",
    playerId: action.playerId,
    data: {
      effectId: action.effectId,
      sourceInstanceId: action.sourceInstanceId,
      phase: state.phase,
      window: state.actionWindow,
      turnNumber: state.turnNumber,
      counter,
    },
  };
  const context = {
    state,
    sourceInstanceId: action.sourceInstanceId,
    controllerId: action.playerId,
    event,
    registry,
  };
  if (!definition.canResolve(context)) {
    return failure(state, "invalid-target", "The effect conditions are not met.");
  }

  const next = cloneState(state);
  if (counter && next.battle !== null) {
    next.battle = { ...next.battle, consecutivePasses: 0 };
  }
  next.resolutionQueue = [
    ...next.resolutionQueue,
    {
      effectId: action.effectId,
      sourceInstanceId: action.sourceInstanceId,
      controllerId: action.playerId,
      context: {
        "event:type": event.type,
        "event:sequence": event.sequence,
        "event:visibility": event.visibility,
        "event:playerId": action.playerId,
        "event:data:effectId": action.effectId,
        "event:data:sourceInstanceId": action.sourceInstanceId,
        "event:data:phase": state.phase,
        "event:data:window": state.actionWindow,
        "event:data:turnNumber": state.turnNumber,
        "event:data:counter": counter,
        "action:phase": state.phase,
        "action:window": state.actionWindow,
        "action:counter": counter,
      },
    },
  ];
  const result = success(next, [
    {
      type: event.type,
      visibility: event.visibility,
      playerId: event.playerId,
      data: event.data,
    },
    {
      type: "effect-activated",
      visibility: "private",
      playerId: action.playerId,
      data: {
        effectId: action.effectId,
        sourceInstanceId: action.sourceInstanceId,
      },
    },
  ]);
  if (
    result.ok &&
    counter &&
    result.state.pendingChoice === null &&
    result.state.resolutionQueue.length === 0
  ) {
    resetCounterPriority(result.state, action.playerId);
  }
  return result;
}

function isPermittedEffectActionWindow(
  state: GameState,
  counter: boolean,
): boolean {
  if (counter) {
    return (
      state.phase === "battle" && state.actionWindow === "battle-counter"
    ) || (
      state.phase === "counter" && state.actionWindow === "counter-phase"
    );
  }
  return (
    state.phase === "action" && state.actionWindow === "action"
  ) || (
    state.phase === "battle" && state.actionWindow === "battle-select-attacker"
  );
}

function applyEffectChoiceAction(
  state: GameState,
  action: Extract<GameAction, { type: "choose-effect" }>,
): EngineResult {
  if (state.pendingChoice?.playerId !== action.playerId) {
    return failure(state, "not-priority-player", "The pending effect choice belongs to the other player.");
  }
  const next = cloneState(state);
  const registry = createRuntimeEffectRegistry(
    state.cardMetadata === undefined ? undefined : Object.values(state.cardMetadata),
  );
  if (!applyEffectChoice(next, action.choiceId, action.value, registry)) {
    return failure(state, "invalid-target", "The chosen effect value is not legal.");
  }
  const counterEffectPlayer =
    state.resolutionQueue[0]?.context["action:counter"] === true
      ? state.resolutionQueue[0].controllerId
      : null;
  const result = success(next, [
    {
      type: "effect-choice-selected",
      visibility: "private",
      playerId: action.playerId,
      data: { choiceId: action.choiceId },
    },
  ]);
  if (
    result.ok &&
    counterEffectPlayer !== null &&
    result.state.pendingChoice === null &&
    result.state.resolutionQueue.length === 0
  ) {
    resetCounterPriority(result.state, counterEffectPlayer);
  }
  return result;
}

function applyMulligan(
  state: GameState,
  action: Extract<GameAction, { type: "submit-mulligan" }>,
): EngineResult {
  const pending = state.pendingChoice;
  if (
    pending === null ||
    pending.type !== "mulligan" ||
    state.phase !== "mulligan" ||
    state.actionWindow !== "mulligan"
  ) {
    return failure(state, "invalid-state", "No mulligan is pending.");
  }
  if (action.playerId !== pending.playerId) {
    return failure(
      state,
      "not-priority-player",
      "The other player must resolve the current mulligan first.",
    );
  }

  const hand = state.players[action.playerId].hand;
  const selected = [...action.instanceIds];
  if (new Set(selected).size !== selected.length) {
    return failure(
      state,
      "invalid-target",
      "A mulligan card may only be selected once.",
    );
  }
  for (const instanceId of selected) {
    const instance = state.instances[instanceId];
    if (
      !hand.includes(instanceId) ||
      !isControlledBy(instance, action.playerId) ||
      instance.zone !== "hand"
    ) {
      return failure(
        state,
        "invalid-target",
        "Mulligan cards must come from the acting player's hand.",
      );
    }
  }

  const next = cloneState(state);
  const player = next.players[action.playerId];
  const selectedSet = new Set(selected);
  player.hand = player.hand.filter((instanceId) => !selectedSet.has(instanceId));
  player.deck = [...player.deck, ...selected];
  for (const instanceId of selected) {
    syncAttachedTreeZone(next, instanceId, "deck");
  }
  drawCards(next, action.playerId, selected.length);
  const shuffled = shuffle(player.deck, next.rngState);
  player.deck = [...shuffled.values];
  next.rngState = shuffled.rngState;

  const events: EventSpec[] = [
    {
      type: "mulligan-submitted",
      visibility: "private",
      playerId: action.playerId,
      data: { count: selected.length },
    },
  ];

  const deckOutEvents = applyDeckOut(next);
  if (deckOutEvents.length > 0) {
    return success(next, [...events, ...deckOutEvents]);
  }

  if (action.playerId === state.firstPlayer) {
    next.priorityPlayer = getOpponent(action.playerId);
    next.pendingChoice = {
      type: "mulligan",
      playerId: getOpponent(action.playerId),
      instanceIds: [],
    };
    return success(next, events);
  }

  next.pendingChoice = null;
  events.push({
    type: "mulligan-complete",
    visibility: "public",
    playerId: null,
    data: {},
  });
  events.push(...startTurn(next, state.firstPlayer, 1));
  events.push(...applyDeckOut(next));
  return success(next, events);
}

function applyBaseDeployment(
  state: GameState,
  action: Extract<GameAction, { type: "base-deploy" }>,
): EngineResult {
  if (state.baseDeploymentUsed) {
    return failure(
      state,
      "invalid-action",
      "Base Deployment has already been used this Action Phase.",
    );
  }
  const player = state.players[action.playerId];
  if (player.base.length >= getBaseLimit()) {
    return failure(state, "invalid-target", "The Base is full.");
  }
  const instance = state.instances[action.instanceId];
  if (
    !player.hand.includes(action.instanceId) ||
    !isControlledBy(instance, action.playerId) ||
    instance.zone !== "hand"
  ) {
    return failure(
      state,
      "invalid-target",
      "Base Deployment requires a card in the acting player's hand.",
    );
  }

  const next = cloneState(state);
  const nextPlayer = next.players[action.playerId];
  nextPlayer.hand = nextPlayer.hand.filter(
    (instanceId) => instanceId !== action.instanceId,
  );
  nextPlayer.base = [...nextPlayer.base, action.instanceId];
  syncAttachedTreeZone(next, action.instanceId, "base");
  next.instances[action.instanceId] = {
    ...next.instances[action.instanceId],
    turnState: {
      ...next.instances[action.instanceId].turnState,
      placed: true,
    },
  };
  drawCards(next, action.playerId, 1);
  next.baseDeploymentUsed = true;

  const events: EventSpec[] = [
    {
      type: "base-deployed",
      visibility: "public",
      playerId: action.playerId,
      data: {},
    },
    {
      type: "base-deployed-card",
      visibility: "private",
      playerId: action.playerId,
      data: { instanceId: action.instanceId },
    },
  ];
  events.push(...applyDeckOut(next));
  return success(next, events);
}

function applyCall(
  state: GameState,
  action: Extract<GameAction, { type: "call" | "counter-call" }>,
): EngineResult {
  const counterCall = action.type === "counter-call";
  const permittedWindow = counterCall
    ? (state.phase === "battle" &&
        state.actionWindow === "battle-counter" &&
        getBattleContextForResolution(state) !== null) ||
      (state.phase === "counter" && isValidCounterPhaseContext(state))
    : state.phase === "action" && state.actionWindow === "action";
  if (!permittedWindow) {
    return failure(state, "invalid-phase", "CALL is not available in the current window.");
  }
  if (!counterCall && state.actionCallsThisTurn >= getCallLimit(state)) {
    return failure(
      state,
      "invalid-action",
      "The Action CALL limit has been reached for this turn.",
    );
  }

  const player = state.players[action.playerId];
  const called = state.instances[action.instanceId];
  if (
    !player.hand.includes(action.instanceId) ||
    !isControlledBy(called, action.playerId) ||
    called.zone !== "hand"
  ) {
    return failure(
      state,
      "invalid-target",
      "CALL requires a card in the acting player's hand.",
    );
  }
  if (counterCall && !isCounterCallSource(state, action.instanceId)) {
    return failure(
      state,
      "invalid-target",
      "The card does not have a supported Counter CALL ability.",
    );
  }

  const level = getInstanceLevel(state, action.instanceId);
  if (level === null) {
    return failure(
      state,
      "invalid-state",
      "The called Character is missing its original Level.",
    );
  }
  const sacrifices = [...action.sacrifices];
  if (new Set(sacrifices).size !== sacrifices.length) {
    return failure(
      state,
      "invalid-target",
      "A CALL sacrifice may only be selected once.",
    );
  }
  if (level <= 3 && sacrifices.length > 0) {
    return failure(
      state,
      "invalid-action",
      "Lv1-Lv3 Characters cannot use CALL sacrifices.",
    );
  }

  let totalLevel = 0;
  for (const sacrificeId of sacrifices) {
    const sacrifice = state.instances[sacrificeId];
    if (
      sacrificeId === action.instanceId ||
      !isControlledBy(sacrifice, action.playerId) ||
      (!isBattleSlot(sacrifice.zone) && sacrifice.zone !== "base") ||
      !isInFieldArea(player, sacrificeId, sacrifice.zone)
    ) {
      return failure(
        state,
        "invalid-target",
        "CALL sacrifices must be controlled cards in Battle or Base.",
      );
    }
    const sacrificeLevel = getSacrificeLevel(state, sacrificeId);
    if (sacrificeLevel === null) {
      return failure(
        state,
        "invalid-state",
        "A CALL sacrifice is missing its original Level.",
      );
    }
    totalLevel += sacrificeLevel;
  }
  if (level >= 4 && totalLevel !== level) {
    return failure(
      state,
      "invalid-action",
      "CALL sacrifices must equal the called Character's original Level.",
    );
  }

  const destination = findOpenBattleSlot(
    state,
    action.playerId,
    sacrifices,
  );
  if (destination === null) {
    return failure(state, "invalid-target", "The Battle area is full.");
  }

  const next = cloneState(state);
  const nextPlayer = next.players[action.playerId];
  const sacrificeSet = new Set(sacrifices);
  nextPlayer.hand = nextPlayer.hand.filter(
    (instanceId) => instanceId !== action.instanceId,
  );
  for (const slot of BATTLE_SLOTS) {
    if (nextPlayer.battle[slot] !== null && sacrificeSet.has(nextPlayer.battle[slot]!)) {
      nextPlayer.battle[slot] = null;
    }
  }
  nextPlayer.base = nextPlayer.base.filter(
    (instanceId) => !sacrificeSet.has(instanceId),
  );
  nextPlayer.retreat = [...nextPlayer.retreat, ...sacrifices];
  for (const sacrificeId of sacrifices) {
    syncAttachedTreeZone(next, sacrificeId, "retreat");
  }
  nextPlayer.battle[destination] = action.instanceId;
  next.instances[action.instanceId] = {
    ...next.instances[action.instanceId],
    zone: destination,
    faceDown: false,
    turnState: {
      ...next.instances[action.instanceId].turnState,
      moved: false,
      placed: true,
    },
  };
  syncAttachedTreeZone(next, action.instanceId, destination);
  if (counterCall) {
    next.battle = next.battle === null
      ? null
      : { ...next.battle, consecutivePasses: 0 };
    next.priorityPlayer = getOpponent(action.playerId);
  } else {
    next.actionCallsThisTurn += 1;
  }

  return success(next, [
    {
      type: "called",
      visibility: "public",
      playerId: action.playerId,
      data: {
        instanceId: action.instanceId,
        destination,
        sacrifices,
        ...(counterCall ? { counter: true } : {}),
      },
    },
  ]);
}

function applyBattleBaseMove(
  state: GameState,
  action: Extract<GameAction, { type: "battle-base-move" }>,
): EngineResult {
  const player = state.players[action.playerId];
  const instance = state.instances[action.instanceId];
  if (
    !isControlledBy(instance, action.playerId) ||
    (!isBattleSlot(instance.zone) && instance.zone !== "base") ||
    !isInFieldArea(player, action.instanceId, instance.zone)
  ) {
    return failure(
      state,
      "invalid-target",
      "BATTLE-BASE MOVE requires a controlled Character in Battle or Base.",
    );
  }
  if (instance.turnState.placed || instance.turnState.moved) {
    return failure(
      state,
      "invalid-action",
      "A Character placed or moved this turn cannot move again.",
    );
  }

  const source = instance.zone;
  if (isBattleSlot(source)) {
    if (action.destination !== "base") {
      return failure(
        state,
        "invalid-target",
        "A Battle Character can only move to Base.",
      );
    }
    if (player.base.length >= getBaseLimit()) {
      return failure(state, "invalid-target", "The Base is full.");
    }
  } else {
    if (
      action.destination === "base" ||
      !isBattleSlot(action.destination)
    ) {
      return failure(
        state,
        "invalid-target",
        "A Base Character can only move to Battle.",
      );
    }
    if (player.battle[action.destination] !== null) {
      return failure(
        state,
        "invalid-target",
        "The destination Battle slot is occupied.",
      );
    }
  }

  const next = cloneState(state);
  if (!moveCardTreeToZone(next, action.instanceId, action.destination)) {
    return failure(state, "invalid-target", "The destination is no longer available.");
  }
  next.instances[action.instanceId] = {
    ...next.instances[action.instanceId],
    turnState: {
      ...next.instances[action.instanceId].turnState,
      moved: true,
      placed:
        next.instances[action.instanceId].turnState.placed ||
        action.destination !== "base",
    },
  };

  return success(next, [
    {
      type: "battle-base-moved",
      visibility: "public",
      playerId: action.playerId,
      data: {
        destination: action.destination,
      },
    },
    {
      type: "battle-base-moved-card",
      visibility: "private",
      playerId: action.playerId,
      data: {
        instanceId: action.instanceId,
        destination: action.destination,
      },
    },
  ]);
}

function applyEndActionPhase(
  state: GameState,
  action: Extract<GameAction, { type: "end-action-phase" }>,
): EngineResult {
  const next = cloneState(state);
  const events: EventSpec[] = [
    {
      type: "action-phase-ended",
      visibility: "public",
      playerId: action.playerId,
      data: { turnNumber: state.turnNumber },
    },
  ];
  if (state.turnNumber === 1 && state.activePlayer === state.firstPlayer) {
    events.push({
      type: "battle-phase-skipped",
      visibility: "public",
      playerId: action.playerId,
      data: {},
    });
    beginCounterPhase(next, events);
  } else {
    beginBattlePhase(next, events);
  }
  return success(next, events);
}

function getLegalBattleActions(
  state: GameState,
  playerId: PlayerId,
): GameAction[] {
  if (state.phase !== "battle") return [];

  switch (state.actionWindow) {
    case "battle-rearrange":
      if (state.battleRearrangementUsed) return [];
      return getLegalRearrangementActions(state, playerId);
    case "battle-select-attacker":
      return [
        ...getLegalAttackers(state, playerId).map((attackerId) => ({
          type: "declare-attack" as const,
          playerId,
          attackerId,
        })),
        ...getLegalEffectActions(state, playerId, false),
      ];
    case "battle-select-target": {
      const attackerId = state.battle?.attackerId;
      if (
        attackerId === null ||
        attackerId === undefined ||
        state.battle?.targetId !== null
      ) {
        return [];
      }
      const range = getCurrentRange(state, attackerId);
      if (range === null) return [];
      const targets = getLegalBattleTargets(state, playerId, attackerId, range)
        .filter(
          (targetId) =>
            !isCharacterOnlyAttack(state, attackerId) ||
            !targetId.startsWith("weakness:"),
        );
      return targets.map(
        (targetId) => ({
          type: "select-attack-target",
          playerId,
          targetId,
        }),
      );
    }
    case "battle-counter":
      return getBattleContextForResolution(state) === null
        ? getLegalEffectActions(state, playerId, true)
        : [
            { type: "counter-pass", playerId },
            ...getLegalCallActions(state, playerId, "counter-call"),
            ...getLegalEffectActions(state, playerId, true),
          ];
    case "battle-confirmation":
      return getResolvedBattleContext(state) === null
        ? []
        : [{ type: "battle-confirmation", playerId }];
    default:
      return getLegalEffectActions(state, playerId, false);
  }
}

function getLegalEffectActions(
  state: GameState,
  playerId: PlayerId,
  counter: boolean,
): GameAction[] {
  const registry = createRuntimeEffectRegistry(
    state.cardMetadata === undefined ? undefined : Object.values(state.cardMetadata),
  );
  const actions: GameAction[] = [];
  for (const source of Object.values(state.instances)) {
    if (source.controllerId !== playerId) continue;
    for (const definition of registry.values()) {
      if (
        definition.metadata.kind !== "activated" ||
        definition.metadata.counter !== counter ||
        !definition.effectId.startsWith(`${source.cardCode}#`) ||
        !effectSourceAtLocation(source.zone, source.faceDown, definition.metadata.locations) ||
        (definition.metadata.oncePerTurn &&
          source.turnState.usedEffectIds.includes(definition.effectId))
      ) {
        continue;
      }
      const event: GameEvent = {
        sequence: 0,
        type: "activate-effect",
        visibility: "private",
        playerId,
        data: {
          effectId: definition.effectId,
          sourceInstanceId: source.instanceId,
        },
      };
      if (
        !definition.canResolve({
          state,
          sourceInstanceId: source.instanceId,
          controllerId: playerId,
          event,
          registry,
        })
      ) {
        continue;
      }
      actions.push(
        counter
          ? {
              type: "counter-effect",
              playerId,
              effectId: definition.effectId,
              sourceInstanceId: source.instanceId,
            }
          : {
              type: "activate-effect",
              playerId,
              effectId: definition.effectId,
              sourceInstanceId: source.instanceId,
            },
      );
    }
  }
  return actions;
}

function getLegalCallActions(
  state: GameState,
  playerId: PlayerId,
  type: "call" | "counter-call",
): GameAction[] {
  const actions: GameAction[] = [];
  const player = state.players[playerId];
  const hand = player.hand.filter((instanceId) => {
    const instance = state.instances[instanceId];
    return isControlledBy(instance, playerId) && instance.zone === "hand";
  });

  for (const instanceId of hand) {
    if (type === "counter-call" && !isCounterCallSource(state, instanceId)) {
      continue;
    }
    const level = getInstanceLevel(state, instanceId);
    if (level === null) continue;
    const sacrificeSets = getLegalSacrificeSets(state, playerId, level);
    for (const sacrifices of sacrificeSets) {
      if (findOpenBattleSlot(state, playerId, sacrifices) === null) continue;
      actions.push({ type, playerId, instanceId, sacrifices });
    }
  }
  return actions;
}

function isCounterCallSource(state: GameState, instanceId: string): boolean {
  const instance = state.instances[instanceId];
  const metadata = instance === undefined
    ? undefined
    : state.cardMetadata?.[instance.cardCode];
  if (instance === undefined || metadata === undefined) return false;
  try {
    return parseAbilityText(instance.cardCode, metadata.abilityText).some(
      (ability) =>
        ability.counter &&
        ability.kind === "auto" &&
        ability.locations.includes("HAND") &&
        /may be called in counter phase or counter step/i.test(ability.body),
    );
  } catch {
    return false;
  }
}

function isCharacterOnlyAttack(state: GameState, attackerId: string): boolean {
  const turnState = state.instances[attackerId]?.turnState;
  return turnState?.currentAttackIsExtra === true && turnState.attackCharactersOnly === true;
}

function isUpcomingCharacterOnlyAttack(instance: CardInstance): boolean {
  return instance.turnState.attackCharactersOnly === true &&
    instance.turnState.attacked &&
    (instance.turnState.additionalAttacks ?? 0) > 0;
}

function resetCounterPriority(state: GameState, playerId: PlayerId): void {
  if (state.battle !== null) {
    state.battle = { ...state.battle, consecutivePasses: 0 };
  }
  state.priorityPlayer = getOpponent(playerId);
}

function effectSourceAtLocation(
  zone: CardInstance["zone"],
  faceDown: boolean,
  locations: readonly string[],
): boolean {
  return locations.some((location) => {
    if (location === "FIELD") {
      return !faceDown && (isBattleZone(zone) || zone === "base");
    }
    if (location === "BATTLE") return !faceDown && isBattleZone(zone);
    if (location === "FRONT") return !faceDown && zone === "front";
    if (location === "WING") {
      return !faceDown && (zone === "wingLeft" || zone === "wingRight");
    }
    if (location === "BACK") return !faceDown && zone === "back";
    return zone.toUpperCase() === location;
  });
}

function isBattleZone(zone: CardInstance["zone"]): boolean {
  return zone === "front" || zone === "wingLeft" || zone === "wingRight" || zone === "back";
}

function getLegalRearrangementActions(
  state: GameState,
  playerId: PlayerId,
): GameAction[] {
  const current = getBattleCards(state, playerId);
  if (current === null) return [];

  const orders: Record<BattleSlot, string | null>[] = [];
  function visit(
    slotIndex: number,
    remaining: readonly string[],
    order: Partial<Record<BattleSlot, string | null>>,
  ): void {
    if (slotIndex === BATTLE_SLOTS.length) {
      if (remaining.length > 0) return;
      orders.push({
        front: order.front ?? null,
        wingLeft: order.wingLeft ?? null,
        wingRight: order.wingRight ?? null,
        back: order.back ?? null,
      });
      return;
    }
    const slot = BATTLE_SLOTS[slotIndex];
    if (remaining.length < BATTLE_SLOTS.length - slotIndex) {
      visit(slotIndex + 1, remaining, { ...order, [slot]: null });
    }
    for (const instanceId of remaining) {
      visit(
        slotIndex + 1,
        remaining.filter((candidate) => candidate !== instanceId),
        { ...order, [slot]: instanceId },
      );
    }
  }
  visit(0, current, {});
  return orders.map((order) => ({
    type: "rearrange-battle",
    playerId,
    order,
  }));
}

function getLegalAttackers(state: GameState, playerId: PlayerId): string[] {
  const player = state.players[playerId];
  const eligible = (slot: BattleSlot): string | null => {
    const instanceId = player.battle[slot];
    if (instanceId === null) return null;
    const instance = state.instances[instanceId];
    if (
      !isControlledBy(instance, playerId) ||
      instance.faceDown ||
      (instance.turnState.attacked &&
        (instance.turnState.additionalAttacks ?? 0) <= 0) ||
      !isInFieldArea(player, instanceId, instance.zone) ||
      instance.zone !== slot
    ) {
      return null;
    }
    const range = getCurrentRange(state, instanceId);
    if (range === null) {
      return null;
    }
    const legalTargets = getLegalBattleTargets(state, playerId, instanceId, range)
      .filter(
        (targetId) =>
          !isUpcomingCharacterOnlyAttack(instance) || !targetId.startsWith("weakness:"),
      );
    if (legalTargets.length === 0) {
      return null;
    }
    return instanceId;
  };

  const front = eligible("front");
  if (front !== null) return [front];
  const wings = [eligible("wingLeft"), eligible("wingRight")].filter(
    (instanceId): instanceId is string => instanceId !== null,
  );
  if (wings.length > 0) return wings;
  const back = eligible("back");
  return back === null ? [] : [back];
}

function applyBattleRearrangement(
  state: GameState,
  action: Extract<GameAction, { type: "rearrange-battle" }>,
): EngineResult {
  if (state.actionWindow !== "battle-rearrange") {
    return failure(state, "invalid-phase", "Battle rearrangement is not open.");
  }
  if (action.order === null || typeof action.order !== "object") {
    return failure(state, "invalid-target", "Battle rearrangement requires an order.");
  }
  if (state.battleRearrangementUsed) {
    return failure(
      state,
      "invalid-action",
      "Battle rearrangement has already been used this Battle Phase.",
    );
  }
  const current = getBattleCards(state, action.playerId);
  if (current === null) {
    return failure(
      state,
      "invalid-state",
      "The Battle area does not contain a valid controlled layout.",
    );
  }
  const requested = BATTLE_SLOTS.map((slot) => action.order[slot]);
  if (requested.some((instanceId) => instanceId !== null && typeof instanceId !== "string")) {
    return failure(state, "invalid-target", "Battle slots must contain cards or null.");
  }
  const requestedIds = requested.filter(
    (instanceId): instanceId is string => instanceId !== null,
  );
  if (
    new Set(requestedIds).size !== requestedIds.length ||
    requestedIds.length !== current.length ||
    current.some((instanceId) => !requestedIds.includes(instanceId))
  ) {
    return failure(
      state,
      "invalid-target",
      "Rearrangement must preserve every Character in Battle exactly once.",
    );
  }

  const next = cloneState(state);
  const player = next.players[action.playerId];
  for (const slot of BATTLE_SLOTS) {
    const instanceId = action.order[slot] ?? null;
    player.battle[slot] = instanceId;
    if (instanceId !== null) {
      syncAttachedTreeZone(next, instanceId, slot);
    }
  }
  next.battleRearrangementUsed = true;
  const events: EventSpec[] = [
    {
      type: "battle-rearranged",
      visibility: "public",
      playerId: action.playerId,
      data: {},
    },
  ];
  beginBattleSelection(next, events);
  return success(next, events);
}

function applyDeclareAttack(
  state: GameState,
  action: Extract<GameAction, { type: "declare-attack" }>,
): EngineResult {
  if (state.actionWindow !== "battle-select-attacker") {
    return failure(state, "invalid-phase", "Attacker selection is not open.");
  }
  if (state.battle?.attackerId !== null && state.battle?.attackerId !== undefined) {
    return failure(state, "invalid-state", "Another attack is already pending.");
  }
  if (!getLegalAttackers(state, action.playerId).includes(action.attackerId)) {
    return failure(
      state,
      "invalid-target",
      "The Character cannot attack from the current Battle order.",
    );
  }

  const next = cloneState(state);
  const wasAttacked = next.instances[action.attackerId].turnState.attacked;
  const additionalAttacks = next.instances[action.attackerId].turnState.additionalAttacks ?? 0;
  next.instances[action.attackerId] = {
    ...next.instances[action.attackerId],
      turnState: {
        ...next.instances[action.attackerId].turnState,
        attacked: true,
        currentAttackIsExtra: wasAttacked,
        ...(wasAttacked && additionalAttacks > 0
        ? { additionalAttacks: additionalAttacks - 1 }
        : {}),
    },
  };
  next.battle = {
    attackerId: action.attackerId,
    attackerSlot: getBattleSlot(state.players[action.playerId], action.attackerId),
    targetId: null,
    targetSlot: null,
    consecutivePasses: 0,
    resolved: false,
    outcome: null,
  };
  next.actionWindow = "battle-select-target";
  next.priorityPlayer = action.playerId;
  return success(next, [
    {
      type: "attack-declared",
      visibility: "public",
      playerId: action.playerId,
      data: { attackerId: action.attackerId },
    },
  ]);
}

function applySelectAttackTarget(
  state: GameState,
  action: Extract<GameAction, { type: "select-attack-target" }>,
): EngineResult {
  if (state.actionWindow !== "battle-select-target") {
    return failure(state, "invalid-phase", "Target selection is not open.");
  }
  const context = state.battle;
  if (context?.attackerId === null || context?.attackerId === undefined) {
    return failure(state, "invalid-state", "No attack is awaiting a target.");
  }
  if (context.targetId !== null) {
    return failure(state, "invalid-state", "The attack target is already selected.");
  }
  const range = getCurrentRange(state, context.attackerId);
  if (range === null) {
    return failure(state, "invalid-state", "The attacking Character is missing Range.");
  }
  const attackerId = context.attackerId;
  const legalTargets = getLegalBattleTargets(
    state,
    action.playerId,
    attackerId,
    range,
    ).filter(
      (targetId) =>
        !isCharacterOnlyAttack(state, attackerId) ||
        !targetId.startsWith("weakness:"),
    );
  if (!legalTargets.includes(action.targetId)) {
    return failure(state, "invalid-target", "The target is outside the attacker's Range.");
  }
  const targetSlot = getBattleTargetSlot(state, action.playerId, action.targetId);
  if (targetSlot === null) {
    return failure(state, "invalid-target", "The target is not in a valid Battle slot.");
  }

  const next = cloneState(state);
  next.battle = {
    ...next.battle!,
    targetId: action.targetId,
    targetSlot,
    consecutivePasses: 0,
  };
  next.actionWindow = "battle-counter";
  next.phase = "battle";
  next.priorityPlayer = getOpponent(action.playerId);
  return success(next, [
    {
      type: "attack-target-selected",
      visibility: "public",
      playerId: action.playerId,
      data: { targetId: action.targetId },
    },
  ]);
}

function applyBattleCounterPass(
  state: GameState,
  action: Extract<GameAction, { type: "counter-pass" }>,
): EngineResult {
  if (state.actionWindow !== "battle-counter") {
    return failure(state, "invalid-phase", "The Battle Counter Step is not open.");
  }
  const context = state.battle;
  const validContext = getBattleContextForResolution(state);
  if (context === null || validContext === null) {
    return failure(state, "invalid-state", "No battle is awaiting counter resolution.");
  }
  if (context.consecutivePasses !== 0 && context.consecutivePasses !== 1) {
    return failure(state, "invalid-state", "The Counter Step has already resolved.");
  }
  if (context.consecutivePasses === 0) {
    const next = cloneState(state);
    next.battle = { ...next.battle!, consecutivePasses: 1 };
    next.priorityPlayer = getOpponent(action.playerId);
    return success(next, [
      {
        type: "battle-counter-passed",
        visibility: "public",
        playerId: action.playerId,
        data: { consecutivePasses: 1 },
      },
    ]);
  }

  const next = cloneState(state);
  const events: EventSpec[] = [
    {
      type: "battle-counter-passed",
      visibility: "public",
      playerId: action.playerId,
      data: { consecutivePasses: 2 },
    },
  ];
  const resolutionEvents = resolveBattle(next, next.battle!);
  if (resolutionEvents.length === 0) {
    return failure(state, "invalid-state", "The battle context is no longer valid.");
  }
  events.push(...resolutionEvents);
  if (next.winner === null) {
    if (next.battle?.outcome === null) {
      return failure(state, "invalid-state", "The battle did not produce a valid outcome.");
    }
    next.battle = {
      ...next.battle!,
      consecutivePasses: 2,
      resolved: true,
    };
    next.actionWindow = "battle-confirmation";
    next.priorityPlayer = next.activePlayer;
  }
  return success(next, events);
}

function applyBattleConfirmation(
  state: GameState,
  action: Extract<GameAction, { type: "battle-confirmation" }>,
): EngineResult {
  if (state.actionWindow !== "battle-confirmation") {
    return failure(state, "invalid-phase", "Battle confirmation is not open.");
  }
  if (getResolvedBattleContext(state) === null) {
    return failure(state, "invalid-state", "No resolved battle is awaiting confirmation.");
  }
  const next = cloneState(state);
  next.battle = null;
  const events: EventSpec[] = [
    {
      type: "battle-confirmed",
      visibility: "public",
      playerId: action.playerId,
      data: {},
    },
  ];
  beginBattleSelection(next, events);
  return success(next, events);
}

function applyCounterPhasePass(
  state: GameState,
  action: Extract<GameAction, { type: "counter-pass" }>,
): EngineResult {
  if (!isValidCounterPhaseContext(state)) {
    return failure(state, "invalid-state", "The Counter Phase context is missing.");
  }
  const context = state.battle!;
  if (context.consecutivePasses === 0) {
    const next = cloneState(state);
    next.battle = { ...next.battle!, consecutivePasses: 1 };
    next.priorityPlayer = getOpponent(action.playerId);
    return success(next, [
      {
        type: "counter-phase-passed",
        visibility: "public",
        playerId: action.playerId,
        data: { consecutivePasses: 1 },
      },
    ]);
  }

  const next = cloneState(state);
  const events: EventSpec[] = [
    {
      type: "counter-phase-passed",
      visibility: "public",
      playerId: action.playerId,
      data: { consecutivePasses: 2 },
    },
  ];
  finishEndPhase(next, events);
  return success(next, events);
}

function beginBattlePhase(state: GameState, events: EventSpec[]): void {
  state.phase = "battle";
  state.actionWindow = "battle-rearrange";
  state.priorityPlayer = state.activePlayer;
  state.battle = {
    attackerId: null,
    attackerSlot: null,
    targetId: null,
    targetSlot: null,
    consecutivePasses: 0,
    resolved: false,
    outcome: null,
  };
  events.push({
    type: "battle-phase-started",
    visibility: "public",
    playerId: state.activePlayer,
    data: {},
  });
}

function beginBattleSelection(state: GameState, events: EventSpec[]): void {
  state.phase = "battle";
  state.priorityPlayer = state.activePlayer;
  state.battle = {
    attackerId: null,
    attackerSlot: null,
    targetId: null,
    targetSlot: null,
    consecutivePasses: 0,
    resolved: false,
    outcome: null,
  };
  if (getLegalAttackers(state, state.activePlayer).length === 0) {
    beginCounterPhase(state, events);
    return;
  }
  state.actionWindow = "battle-select-attacker";
}

function beginCounterPhase(state: GameState, events: EventSpec[]): void {
  state.phase = "counter";
  state.actionWindow = "counter-phase";
  state.priorityPlayer = state.activePlayer;
  state.battle = {
    attackerId: null,
    attackerSlot: null,
    targetId: null,
    targetSlot: null,
    consecutivePasses: 0,
    resolved: false,
    outcome: null,
  };
  events.push({
    type: "counter-phase-started",
    visibility: "public",
    playerId: state.activePlayer,
    data: {},
  });
}

function finishEndPhase(state: GameState, events: EventSpec[]): void {
  const nonAttackingInstanceIds = Object.values(state.instances)
    .filter(
      (instance) =>
        instance.controllerId === state.activePlayer &&
        (instance.zone === "wingLeft" || instance.zone === "wingRight") &&
        !instance.turnState.attacked,
    )
    .map((instance) => instance.instanceId);
  events.push({
    type: "turn-ended",
    visibility: "public",
    playerId: state.activePlayer,
    data: { nonAttackingInstanceIds },
  });
  state.pendingEndPhase = true;
}

function completeEndPhase(state: GameState, events: EventSpec[]): void {
  if (state.pendingEndPhase !== true || state.winner !== null) return;
  state.pendingEndPhase = false;
  state.phase = "end";
  state.actionWindow = "counter-phase";
  state.battle = null;
  events.push({
    type: "end-phase-started",
    visibility: "public",
    playerId: state.activePlayer,
    data: {},
  });
  cleanupEndPhase(state);
  enforceHandLimit(state, events);

  const nextPlayer = getOpponent(state.activePlayer);
  state.turnNumber += 1;
  state.activePlayer = nextPlayer;
  state.priorityPlayer = nextPlayer;
  events.push({
    type: "end-phase-ended",
    visibility: "public",
    playerId: nextPlayer,
    data: { turnNumber: state.turnNumber },
  });
  events.push(...startTurn(state, nextPlayer, state.turnNumber));
  events.push(...applyDeckOut(state));
}

function cleanupEndPhase(state: GameState): void {
  for (const [instanceId, instance] of Object.entries(state.instances)) {
    state.instances[instanceId] = {
      ...instance,
      modifiers: instance.modifiers.filter(
        (modifier) =>
          modifier.expiresAtTurn === null ||
          modifier.expiresAtTurn > state.turnNumber,
      ),
    };
  }
}

function enforceHandLimit(state: GameState, events: EventSpec[]): void {
  const player = state.players[state.activePlayer];
  const handLimit = getAreaLimit("hand") ?? 9;
  if (player.hand.length <= handLimit) return;
  const discarded = player.hand.slice(handLimit);
  player.hand = player.hand.slice(0, handLimit);
  player.retreat = [...player.retreat, ...discarded];
  for (const instanceId of discarded) {
    syncAttachedTreeZone(state, instanceId, "retreat");
  }
  events.push({
    type: "hand-limit-enforced",
    visibility: "private",
    playerId: state.activePlayer,
    data: { count: discarded.length },
  });
}

function getBattleCards(
  state: GameState,
  playerId: PlayerId,
): string[] | null {
  if (!hasUniqueFieldMemberships(state)) return null;
  const player = state.players[playerId];
  const cards: string[] = [];
  for (const slot of BATTLE_SLOTS) {
    const instanceId = player.battle[slot];
    if (instanceId === null) continue;
    if (cards.includes(instanceId)) return null;
    const instance = state.instances[instanceId];
    if (
      !isControlledBy(instance, playerId) ||
      instance.faceDown ||
      instance.zone !== slot ||
      !isInFieldArea(player, instanceId, instance.zone)
    ) {
      return null;
    }
    cards.push(instanceId);
  }
  return cards;
}

function resolveBattle(
  state: GameState,
  context: BattleContext,
): EventSpec[] {
  if (validateBattleContext(state, context) === null) return [];
  const attackerId = context.attackerId;
  const targetId = context.targetId;
  if (attackerId === null || targetId === null) return [];
  if (isWeaknessTarget(targetId)) {
    const player = state.players[state.activePlayer];
    const rushPointId = player.rushPointDeck[0];
    if (rushPointId === undefined) {
      return [
        {
          type: "battle-resolved",
          visibility: "public",
          playerId: state.activePlayer,
          data: { result: "weakness-no-rush-point" },
        },
      ];
    }
    const timelineLengthBefore = player.timeline.length;
    player.rushPointDeck = player.rushPointDeck.slice(1);
    player.timeline = [...player.timeline, rushPointId];
    context.outcome = {
      type: "weakness",
      rushPointId,
      timelineLengthBefore,
      timelineLength: player.timeline.length,
      rushPointDeckLength: player.rushPointDeck.length,
    };
    state.instances[rushPointId] = {
      ...state.instances[rushPointId],
      zone: "timeline",
      faceDown: false,
    };
    syncAttachedTreeZone(state, rushPointId, "timeline");
    const events: EventSpec[] = [
      {
        type: "weakness-rush-point",
        visibility: "public",
        playerId: state.activePlayer,
        data: { targetId, rushPointId },
      },
    ];
    if (isWinningTimeline(player.timeline)) {
      setWinner(state, state.activePlayer);
      events.push({
        type: "game-won",
        visibility: "public",
        playerId: state.activePlayer,
        data: { reason: "timeline" },
      });
    }
    return events;
  }

  const targetPlayer = getOpponent(state.activePlayer);
  const attackerPower = getCurrentPower(state, attackerId);
  const targetPower = getCurrentPower(state, targetId);
  if (attackerPower === null || targetPower === null) return [];
  const outcome: BattleOutcome =
    attackerPower === targetPower
      ? {
          type: "both-retreat",
          attackerPower,
          targetPower,
        }
      : attackerPower > targetPower
        ? {
            type: "defender-retreat",
            attackerPower,
            targetPower,
          }
        : {
            type: "attacker-retreat",
            attackerPower,
            targetPower,
          };
  context.outcome = outcome;
  if (attackerPower === targetPower) {
    retreatCharacter(state, state.activePlayer, attackerId);
    retreatCharacter(state, targetPlayer, targetId);
    return [
      {
        type: "battle-resolved",
        visibility: "public",
        playerId: state.activePlayer,
        data: { result: "both-retreat" },
      },
    ];
  }
  if (attackerPower > targetPower) {
    retreatCharacter(state, targetPlayer, targetId);
    return [
      {
        type: "battle-resolved",
        visibility: "public",
        playerId: state.activePlayer,
        data: { result: "defender-retreat" },
      },
    ];
  }
  retreatCharacter(state, state.activePlayer, attackerId);
  return [
    {
      type: "battle-resolved",
      visibility: "public",
      playerId: state.activePlayer,
      data: { result: "attacker-retreat" },
    },
  ];
}

function retreatCharacter(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): void {
  const player = state.players[playerId];
  for (const slot of BATTLE_SLOTS) {
    if (player.battle[slot] === instanceId) player.battle[slot] = null;
  }
  player.retreat = [...player.retreat, instanceId];
  syncAttachedTreeZone(state, instanceId, "retreat");
}

function setWinner(state: GameState, playerId: PlayerId): void {
  state.winner = playerId;
  state.phase = "game-over";
  state.actionWindow = "game-over";
  state.priorityPlayer = playerId;
  state.battle = null;
}

function isWeaknessTarget(targetId: BattleTarget): targetId is `weakness:${BattleSlot}` {
  return getWeaknessSlot(targetId) !== null;
}

function isValidBattleOutcome(value: unknown): value is BattleOutcome {
  if (typeof value !== "object" || value === null) return false;
  const outcome = value as Record<string, unknown>;
  if (outcome.type === "weakness") {
    return (
      hasExactKeys(outcome, [
        "type",
        "rushPointId",
        "timelineLengthBefore",
        "timelineLength",
        "rushPointDeckLength",
      ]) &&
      typeof outcome.rushPointId === "string" &&
      Number.isInteger(outcome.timelineLengthBefore) &&
      Number.isInteger(outcome.timelineLength) &&
      Number.isInteger(outcome.rushPointDeckLength) &&
      (outcome.timelineLengthBefore as number) >= 0 &&
      (outcome.timelineLength as number) >= 0 &&
      (outcome.rushPointDeckLength as number) >= 0
    );
  }
  if (
    outcome.type !== "attacker-retreat" &&
    outcome.type !== "defender-retreat" &&
    outcome.type !== "both-retreat"
  ) {
    return false;
  }
  return (
    hasExactKeys(outcome, ["type", "attackerPower", "targetPower"]) &&
    Number.isInteger(outcome.attackerPower) &&
    Number.isInteger(outcome.targetPower)
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function getBattleContextForResolution(
  state: GameState,
): ValidBattleContext | null {
  const context = state.battle;
  if (
    context === null ||
    context.resolved !== false ||
    (context.consecutivePasses !== 0 && context.consecutivePasses !== 1) ||
    context.attackerId === null ||
    context.attackerSlot === null ||
    context.targetId === null ||
    context.targetSlot === null ||
    context.outcome !== null
  ) {
    return null;
  }
  return validateBattleContext(state, context);
}

function validateBattleContext(
  state: GameState,
  context: BattleContext,
): ValidBattleContext | null {
  if (
    context.resolved !== false ||
    context.attackerId === null ||
    context.attackerSlot === null ||
    context.targetId === null ||
    context.targetSlot === null ||
    context.outcome !== null
  ) {
    return null;
  }

  const attackerId = context.attackerId;
  const attackerSlot = getBattleSlot(
    state.players[state.activePlayer],
    context.attackerId,
  );
  const range = getCurrentRange(state, context.attackerId);
  const power = getCurrentPower(state, context.attackerId);
  if (
    attackerSlot !== context.attackerSlot ||
    range === null ||
    power === null
  ) {
    return null;
  }

  const targetSlot = getBattleTargetSlot(
    state,
    state.activePlayer,
    context.targetId,
  );
  if (
    targetSlot !== context.targetSlot ||
    !getLegalBattleTargets(
      state,
      state.activePlayer,
      context.attackerId,
      range,
    )
      .filter(
        (targetId) =>
          !isCharacterOnlyAttack(state, attackerId) ||
          !targetId.startsWith("weakness:"),
      )
      .includes(context.targetId)
  ) {
    return null;
  }
  if (!isWeaknessTarget(context.targetId) && getCurrentPower(state, context.targetId) === null) {
    return null;
  }
  return {
    attackerId: context.attackerId,
    attackerSlot: context.attackerSlot,
    targetId: context.targetId,
    targetSlot: context.targetSlot,
  };
}

function getResolvedBattleContext(state: GameState): BattleContext | null {
  const context = state.battle;
  if (
    context === null ||
    context.resolved !== true ||
    context.consecutivePasses !== 2 ||
    context.attackerId === null ||
    context.attackerSlot === null ||
    context.targetId === null ||
    context.targetSlot === null ||
    context.outcome === null ||
    context.outcome === undefined ||
    !hasUniqueFieldMemberships(state)
  ) {
    return null;
  }
  const outcome = context.outcome;
  if (!isValidBattleOutcome(outcome)) return null;

  const attacker = state.instances[context.attackerId];
  const range = getCurrentRange(state, context.attackerId);
  const attackerOnBattle = hasBattlePosition(
    state,
    state.activePlayer,
    context.attackerId,
    context.attackerSlot,
  );
  const attackerRetreated = hasRetreatPosition(
    state,
    state.activePlayer,
    context.attackerId,
  );
  if (
    attacker === undefined ||
    attacker.controllerId !== state.activePlayer ||
    attacker.faceDown ||
    getCurrentPower(state, context.attackerId) === null ||
    range === null ||
    (!attackerOnBattle && !attackerRetreated) ||
    getBattleDistance(context.attackerSlot, context.targetSlot) > range
  ) {
    return null;
  }

  const opponentId = getOpponent(state.activePlayer);
  const opponent = state.players[opponentId];
  if (isWeaknessTarget(context.targetId)) {
    const timeline = state.players[state.activePlayer].timeline;
    const rushPoint =
      outcome.type === "weakness"
        ? state.instances[outcome.rushPointId]
        : undefined;
    if (
      outcome.type !== "weakness" ||
      context.targetId !== `weakness:${context.targetSlot}` ||
      opponent.battle[context.targetSlot] !== null ||
      !attackerOnBattle ||
      timeline.length !== outcome.timelineLengthBefore + 1 ||
      timeline.length !== outcome.timelineLength ||
      timeline[outcome.timelineLengthBefore] !== outcome.rushPointId ||
      state.players[state.activePlayer].rushPointDeck.length !==
        outcome.rushPointDeckLength ||
      timeline.filter((instanceId) => instanceId === outcome.rushPointId).length !== 1 ||
      state.players[state.activePlayer].rushPointDeck.includes(outcome.rushPointId) ||
      rushPoint?.ownerId !== state.activePlayer ||
      rushPoint?.controllerId !== state.activePlayer ||
      rushPoint?.cardCode !== "RUSH-POINT" ||
      rushPoint?.zone !== "timeline" ||
      rushPoint?.faceDown
    ) {
      return null;
    }
    return context;
  }

  const target = state.instances[context.targetId];
  if (
    target === undefined ||
    target.controllerId !== opponentId ||
    target.faceDown ||
    getCurrentPower(state, context.targetId) === null ||
    !hasResolvedCharacterPosition(
      state,
      opponentId,
      context.targetId,
      context.targetSlot,
    )
  ) {
    return null;
  }

  if (outcome.type === "weakness") return null;
  const attackerPower = getCurrentPower(state, context.attackerId);
  const targetPower = getCurrentPower(state, context.targetId);
  const targetOnBattle = hasBattlePosition(
    state,
    opponentId,
    context.targetId,
    context.targetSlot,
  );
  const targetRetreated = hasRetreatPosition(state, opponentId, context.targetId);
  if (
    attackerPower === null ||
    targetPower === null ||
    attackerPower !== outcome.attackerPower ||
    targetPower !== outcome.targetPower
  ) {
    return null;
  }
  if (
    (outcome.type === "attacker-retreat" &&
      (!attackerRetreated || !targetOnBattle || !(attackerPower < targetPower))) ||
    (outcome.type === "defender-retreat" &&
      (!attackerOnBattle || !targetRetreated || !(attackerPower > targetPower))) ||
    (outcome.type === "both-retreat" &&
      (!attackerRetreated || !targetRetreated || attackerPower !== targetPower))
  ) {
    return null;
  }
  return context;
}

function getBattleSlot(
  player: PlayerState,
  instanceId: string,
): BattleSlot | null {
  return BATTLE_SLOTS.find((slot) => player.battle[slot] === instanceId) ?? null;
}

function getBattleTargetSlot(
  state: GameState,
  playerId: PlayerId,
  targetId: BattleTarget,
): BattleSlot | null {
  const weaknessSlot = getWeaknessSlot(targetId);
  if (weaknessSlot !== null) return weaknessSlot;
  return getBattleSlot(state.players[getOpponent(playerId)], targetId);
}

function getWeaknessSlot(targetId: BattleTarget): BattleSlot | null {
  return BATTLE_SLOTS.find((slot) => targetId === `weakness:${slot}`) ?? null;
}

function hasResolvedCharacterPosition(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  expectedSlot: BattleSlot,
): boolean {
  return (
    hasBattlePosition(state, playerId, instanceId, expectedSlot) ||
    hasRetreatPosition(state, playerId, instanceId)
  );
}

function hasBattlePosition(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  expectedSlot: BattleSlot,
): boolean {
  const player = state.players[playerId];
  const instance = state.instances[instanceId];
  if (instance === undefined) return false;
  const battleSlot = getBattleSlot(player, instanceId);
  return (
    battleSlot === expectedSlot &&
    instance.zone === expectedSlot &&
    isInFieldArea(player, instanceId, instance.zone)
  );
}

function hasRetreatPosition(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): boolean {
  const player = state.players[playerId];
  const instance = state.instances[instanceId];
  if (instance === undefined) return false;
  return (
    instance.zone === "retreat" &&
    !BATTLE_SLOTS.some((slot) => player.battle[slot] === instanceId) &&
    !player.base.includes(instanceId) &&
    player.retreat.filter((candidate) => candidate === instanceId).length === 1
  );
}

function isValidCounterPhaseContext(state: GameState): boolean {
  const context = state.battle;
  return (
    context !== null &&
    state.phase === "counter" &&
    state.actionWindow === "counter-phase" &&
    context.resolved === false &&
    context.attackerId === null &&
    context.attackerSlot === null &&
    context.targetId === null &&
    context.targetSlot === null &&
    (context.consecutivePasses === 0 || context.consecutivePasses === 1) &&
    context.outcome === null
  );
}

export function getCurrentPower(state: GameState, instanceId: string): number | null {
  return getCurrentAttribute(state, instanceId, "power");
}

export function getCurrentRange(state: GameState, instanceId: string): number | null {
  return getCurrentAttribute(state, instanceId, "range");
}

export function getCurrentLevel(state: GameState, instanceId: string): number | null {
  return getCurrentAttribute(state, instanceId, "level");
}

function getCurrentAttribute(
  state: GameState,
  instanceId: string,
  attribute: "level" | "power" | "range",
): number | null {
  const registry = createRuntimeEffectRegistry(
    state.cardMetadata === undefined ? undefined : Object.values(state.cardMetadata),
  );
  return getCurrentCardAttribute(state, instanceId, attribute, registry);
}

function applyDeckOut(state: GameState): EventSpec[] {
  if (state.winner !== null) return [];
  const loser = (Object.keys(state.players) as PlayerId[]).find(
    (playerId) => state.players[playerId].deck.length === 0,
  );
  if (loser === undefined) return [];
  const winner = getOpponent(loser);
  setWinner(state, winner);
  return [
    {
      type: "deck-out",
      visibility: "public",
      playerId: winner,
      data: { loser },
    },
    {
      type: "game-won",
      visibility: "public",
      playerId: winner,
      data: { reason: "deck-out" },
    },
  ];
}

function getLegalMoveActions(
  state: GameState,
  playerId: PlayerId,
): GameAction[] {
  const player = state.players[playerId];
  const actions: GameAction[] = [];
  for (const slot of BATTLE_SLOTS) {
    const instanceId = player.battle[slot];
    if (instanceId === null) continue;
    const instance = state.instances[instanceId];
    if (
      !isControlledBy(instance, playerId) ||
      !isInFieldArea(player, instanceId, instance.zone) ||
      instance.turnState.placed ||
      instance.turnState.moved
    ) {
      continue;
    }
    if (player.base.length < getBaseLimit()) {
      actions.push({
        type: "battle-base-move",
        playerId,
        instanceId,
        destination: "base",
      });
    }
    continue;
  }

  for (const instanceId of player.base) {
    const instance = state.instances[instanceId];
    if (
      !isControlledBy(instance, playerId) ||
      !isInFieldArea(player, instanceId, instance.zone) ||
      instance.turnState.placed ||
      instance.turnState.moved
    ) {
      continue;
    }
    for (const destination of BATTLE_SLOTS) {
      if (player.battle[destination] !== null) continue;
      actions.push({
        type: "battle-base-move",
        playerId,
        instanceId,
        destination,
      });
    }
  }
  return actions;
}

function getMulliganActions(
  hand: readonly string[],
  playerId: PlayerId,
): GameAction[] {
  const actions: GameAction[] = [];
  const combinationCount = 2 ** hand.length;
  for (let mask = 0; mask < combinationCount; mask += 1) {
    actions.push({
      type: "submit-mulligan",
      playerId,
      instanceIds: hand.filter((_, index) => (mask & (1 << index)) !== 0),
    });
  }
  return actions;
}

function getLegalSacrificeSets(
  state: GameState,
  playerId: PlayerId,
  calledLevel: number,
): readonly (readonly string[])[] {
  if (calledLevel <= 3) return [[]];
  const candidates = getSacrificeCandidates(state, playerId);
  const combinations: string[][] = [];
  for (let mask = 1; mask < 2 ** candidates.length; mask += 1) {
    const selected = candidates.filter(
      (_, index) => (mask & (1 << index)) !== 0,
    );
    let total = 0;
    let valid = true;
    for (const instanceId of selected) {
      const level = getSacrificeLevel(state, instanceId);
      if (level === null) {
        valid = false;
        break;
      }
      total += level;
    }
    if (valid && total === calledLevel) combinations.push(selected);
  }
  return combinations;
}

function getSacrificeCandidates(
  state: GameState,
  playerId: PlayerId,
): string[] {
  const player = state.players[playerId];
  const candidates: string[] = [];
  for (const slot of BATTLE_SLOTS) {
    const instanceId = player.battle[slot];
    if (instanceId === null) continue;
    const instance = state.instances[instanceId];
    if (
      isControlledBy(instance, playerId) &&
      isInFieldArea(player, instanceId, instance.zone)
    ) {
      candidates.push(instanceId);
    }
  }
  for (const instanceId of player.base) {
    const instance = state.instances[instanceId];
    if (
      isControlledBy(instance, playerId) &&
      isInFieldArea(player, instanceId, instance.zone)
    ) {
      candidates.push(instanceId);
    }
  }
  return candidates;
}

function findOpenBattleSlot(
  state: GameState,
  playerId: PlayerId,
  sacrifices: readonly string[],
): BattleSlot | null {
  const sacrificeSet = new Set(sacrifices);
  const player = state.players[playerId];
  for (const slot of BATTLE_SLOTS) {
    const instanceId = player.battle[slot];
    if (instanceId === null || sacrificeSet.has(instanceId)) return slot;
  }
  return null;
}

function getCallLimit(state: GameState): number {
  return state.turnNumber === 1 && state.activePlayer === state.firstPlayer
    ? 1
    : 3;
}

function getBaseLimit(): number {
  return getAreaLimit("base") ?? 6;
}

function getInstanceLevel(
  state: GameState,
  instanceId: string,
): number | null {
  const instance = state.instances[instanceId];
  return instance?.originalLevel ?? null;
}

function getSacrificeLevel(state: GameState, instanceId: string): number | null {
  const instance = state.instances[instanceId];
  if (instance === undefined) return null;
  if (instance.zone === "base" && instance.faceDown) return 1;
  return getInstanceLevel(state, instanceId);
}

function isControlledBy(
  instance: CardInstance | undefined,
  playerId: PlayerId,
): instance is CardInstance {
  return instance?.controllerId === playerId;
}

function isInFieldArea(
  player: PlayerState,
  instanceId: string,
  zone: CardInstance["zone"],
): boolean {
  const battleMembershipCount = BATTLE_SLOTS.reduce(
    (count, slot) => count + (player.battle[slot] === instanceId ? 1 : 0),
    0,
  );
  const baseMembershipCount = player.base.filter(
    (candidate) => candidate === instanceId,
  ).length;
  if (battleMembershipCount + baseMembershipCount !== 1) return false;
  if (isBattleSlot(zone)) return player.battle[zone] === instanceId;
  return zone === "base" && baseMembershipCount === 1;
}

function startTurn(
  state: GameState,
  playerId: PlayerId,
  turnNumber: number,
): EventSpec[] {
  state.activePlayer = playerId;
  state.priorityPlayer = playerId;
  state.turnNumber = turnNumber;
  state.phase = "action";
  state.actionWindow = "action";
  state.actionCallsThisTurn = 0;
  state.baseDeploymentUsed = false;
  state.battleRearrangementUsed = false;
  state.battle = null;
  resetTurnState(state);
  const drawn = drawCards(state, playerId, 2);
  return [
    {
      type: "turn-started",
      visibility: "public",
      playerId,
      data: { turnNumber },
    },
    {
      type: "cards-drawn",
      visibility: "private",
      playerId,
      data: { count: drawn.length },
    },
  ];
}

function resetTurnState(state: GameState): void {
  for (const [instanceId, instance] of Object.entries(state.instances)) {
    state.instances[instanceId] = {
      ...instance,
      turnState: {
        attacked: false,
        moved: false,
        placed: false,
        usedEffectIds: [],
      },
    };
  }
}

function createCharacterDeck(
  ownerId: PlayerId,
  entries: readonly SimulatorDeckEntry[],
  definitions: ReadonlyMap<string, SimulatorCardDefinition>,
  instances: Record<string, CardInstance>,
): string[] {
  const deck: string[] = [];
  let instanceNumber = 1;
  for (const entry of entries) {
    if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) {
      throw new Error(`Invalid quantity for simulator card ${entry.cardId}.`);
    }
    const definition = findDefinition(definitions, entry.cardId);
    if (definition === undefined) {
      throw new Error(`Missing simulator definition for ${entry.cardId}.`);
    }
    for (let copy = 0; copy < entry.quantity; copy += 1) {
      const instanceId = `${ownerId}-card-${instanceNumber}`;
      instanceNumber += 1;
      deck.push(instanceId);
      instances[instanceId] = {
        instanceId,
        cardCode: definition.cardCode,
        originalLevel: definition.level,
        originalPower: definition.power,
        originalRange: definition.range,
        ownerId,
        controllerId: ownerId,
        zone: "deck",
        faceDown: true,
        covered: false,
        attachedTo: null,
        attachmentIds: [],
        modifiers: [],
        turnState: {
          attacked: false,
          moved: false,
          placed: false,
          usedEffectIds: [],
        },
      };
    }
  }
  return deck;
}

function createCardMetadata(
  definitions: ReadonlyMap<string, SimulatorCardDefinition>,
): Readonly<Record<string, RuntimeCardMetadata>> {
  const metadata: Record<string, RuntimeCardMetadata> = {};
  for (const definition of definitions.values()) {
    metadata[definition.cardCode] = {
      cardCode: definition.cardCode,
      name: definition.name,
      colorCode: definition.colorCode,
      level: definition.level,
      power: definition.power,
      range: definition.range,
      traitNames: [...definition.traitNames],
      abilityText: definition.abilityText,
    };
  }
  return metadata;
}

function createRushPointDeck(
  ownerId: PlayerId,
  instances: Record<string, CardInstance>,
): string[] {
  const rushPoints = createRuntimeRushPointDeck(ownerId);
  for (const point of rushPoints) instances[point.instanceId] = point;
  return rushPoints.map((point) => point.instanceId);
}

function createPlayerState(
  deck: readonly string[],
  rushPointDeck: readonly string[],
): PlayerState {
  return {
    deck: [...deck],
    hand: [],
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
    rushPointDeck: [...rushPointDeck],
  };
}

function drawCards(
  state: GameState,
  playerId: PlayerId,
  count: number,
): string[] {
  const player = state.players[playerId];
  const deck = [...player.deck];
  const hand = [...player.hand];
  const drawn: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const instanceId = deck.shift();
    if (instanceId === undefined) break;
    hand.push(instanceId);
    drawn.push(instanceId);
    syncAttachedTreeZone(state, instanceId, "hand");
  }
  player.deck = deck;
  player.hand = hand;
  return drawn;
}

function findDefinition(
  definitions: ReadonlyMap<string, SimulatorCardDefinition>,
  key: string,
): SimulatorCardDefinition | undefined {
  const direct = definitions.get(key);
  if (direct !== undefined) return direct;
  for (const definition of definitions.values()) {
    if (definition.cardId === key || definition.cardCode === key) {
      return definition;
    }
  }
  return undefined;
}

function normalizeSeed(seed: number): number {
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export function nextRandom(rngState: number): {
  value: number;
  rngState: number;
} {
  let value = rngState | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  const nextState = value >>> 0;
  return { value: nextState / 0x100000000, rngState: nextState };
}

function shuffle<T>(
  values: readonly T[],
  initialRngState: number,
): { values: T[]; rngState: number } {
  const result = [...values];
  let rngState = initialRngState;
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = nextRandom(rngState);
    rngState = random.rngState;
    const swapIndex = Math.floor(random.value * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return { values: result, rngState };
}

function cloneState(state: GameState): GameState {
  const instances: Record<string, CardInstance> = {};
  for (const [instanceId, instance] of Object.entries(state.instances)) {
    instances[instanceId] = {
      ...instance,
      attachmentIds: [...instance.attachmentIds],
      modifiers: instance.modifiers.map((modifier) => ({ ...modifier })),
      turnState: {
        ...instance.turnState,
        usedEffectIds: [...instance.turnState.usedEffectIds],
      },
    };
  }
  return {
    ...state,
    players: {
      player: clonePlayerState(state.players.player),
      bot: clonePlayerState(state.players.bot),
    },
    instances,
    battle: state.battle === null ? null : { ...state.battle },
    pendingChoice: clonePendingChoice(state.pendingChoice),
    resolutionQueue: state.resolutionQueue.map((resolution) => ({
      ...resolution,
      context: { ...resolution.context },
    })),
    events: [...state.events],
  };
}

function clonePlayerState(player: PlayerState): PlayerState {
  return {
    ...player,
    deck: [...player.deck],
    hand: [...player.hand],
    battle: { ...player.battle },
    base: [...player.base],
    timeline: [...player.timeline],
    retreat: [...player.retreat],
    void: [...player.void],
    rushPointDeck: [...player.rushPointDeck],
  };
}

function clonePendingChoice(
  choice: PendingChoice | null,
): PendingChoice | null {
  if (choice === null) return null;
  if (choice.type === "mulligan") {
    return { ...choice, instanceIds: [...choice.instanceIds] };
  }
  if (choice.type === "effect" || choice.type === "target") {
    return { ...choice, options: [...choice.options] };
  }
  if (choice.type === "card-order") {
    return { ...choice, instanceIds: [...choice.instanceIds] };
  }
  return { ...choice };
}

function success(state: GameState, specs: readonly EventSpec[]): EngineResult {
  let sequence = state.events.at(-1)?.sequence ?? 0;
  const registry = createRuntimeEffectRegistry(
    state.cardMetadata === undefined ? undefined : Object.values(state.cardMetadata),
  );
  const allEvents: GameEvent[] = [];

  const appendSpecs = (batch: readonly EventSpec[]): void => {
    const events = batch.map((spec) => ({ ...spec, sequence: ++sequence }));
    state.events = [...state.events, ...events];
    allEvents.push(...events);
    let queued = [...state.resolutionQueue];
    for (const event of events) {
      queued = [...queued, ...queueTriggeredEffects(state, event, registry)];
    }
    state.resolutionQueue = queued;
  };

  const resolveBatch = (): EngineResult | null => {
    const resolved = resolveEffectQueue(state, registry);
    if (!resolved.ok) return failure(state, "invalid-state", resolved.error);
    const effectEvents = resolved.events.map((event) => ({
      ...event,
      sequence: ++sequence,
    }));
    state.events = [...state.events, ...effectEvents];
    allEvents.push(...effectEvents);

    const deckOutEvents = resolved.needsDeckOutCheck ? applyDeckOut(state) : [];
    const numberedDeckOutEvents = deckOutEvents.map((event) => ({
      ...event,
      sequence: ++sequence,
    }));
    state.events = [...state.events, ...numberedDeckOutEvents];
    allEvents.push(...numberedDeckOutEvents);
    return null;
  };

  appendSpecs(specs);
  const firstError = resolveBatch();
  if (firstError !== null) return firstError;

  if (
    state.pendingEndPhase === true &&
    state.winner === null &&
    state.pendingChoice === null &&
    state.resolutionQueue.length === 0
  ) {
    const transitionEvents: EventSpec[] = [];
    completeEndPhase(state, transitionEvents);
    appendSpecs(transitionEvents);
    const transitionError = resolveBatch();
    if (transitionError !== null) return transitionError;
  }

  return {
    ok: true,
    state,
    events: allEvents,
  };
}

function failure(
  state: GameState,
  code: "invalid-action" | "invalid-phase" | "not-priority-player" | "invalid-target" | "invalid-player" | "game-over" | "invalid-state",
  message: string,
): EngineResult {
  return { ok: false, state, error: { code, message } };
}

function isPlayerId(value: string): value is PlayerId {
  return value === "player" || value === "bot";
}
