export type PlayerId = "player" | "bot";
export type BattleSlot = "front" | "wingLeft" | "wingRight" | "back";
export type Zone =
  | "deck"
  | "hand"
  | "front"
  | "wingLeft"
  | "wingRight"
  | "back"
  | "base"
  | "timeline"
  | "retreat"
  | "void"
  | "rushPointDeck";

export type EffectTargetFilter = {
  controller: "self" | "opponent" | "any";
  zones: readonly Zone[];
  cardCodes?: readonly string[];
  colorCodes?: readonly string[];
  traitNames?: readonly string[];
  nameIncludes?: string;
  minLevel?: number;
  maxLevel?: number;
  minPower?: number;
  maxPower?: number;
  excludeInstanceId?: string;
  attached?: "attached" | "unattached";
};
export type Phase =
  | "mulligan"
  | "start"
  | "draw"
  | "action"
  | "battle"
  | "counter"
  | "end"
  | "game-over";
export type ActionWindow =
  | "mulligan"
  | "action"
  | "battle-rearrange"
  | "battle-select-attacker"
  | "battle-select-target"
  | "battle-counter"
  | "battle-confirmation"
  | "counter-phase"
  | "effect-choice"
  | "game-over";

export type SimulatorDeckEntry = {
  cardId: string;
  quantity: number;
};

export type SimulatorBotDeckEntry = {
  cardCode: string;
  quantity: number;
};

export type SimulatorCatalogCard = {
  cardId: string;
  cardCode: string;
  name: string;
  cardType: string | null;
  colorCode: string;
  isBase: boolean;
  level: number;
  power: number | null;
  range: number | null;
  traitNames: readonly string[];
  abilityText: string | null;
};

export type AdapterErrorCode =
  | "invalid-deck-size"
  | "invalid-copy-count"
  | "invalid-color-count"
  | "missing-card"
  | "unsupported-card"
  | "missing-power"
  | "missing-range";

export type AdapterResult =
  | { ok: true; entries: readonly SimulatorDeckEntry[] }
  | { ok: false; code: AdapterErrorCode; message: string; cardCode?: string };

export type SimulatorCardDefinition = {
  cardId: string;
  cardCode: string;
  name: string;
  colorCode: string;
  level: number;
  power: number;
  range: number;
  traitNames: readonly string[];
  abilityText: string | null;
  effectIds: readonly string[];
};

export type RuntimeCardMetadata = {
  cardCode: string;
  name: string;
  colorCode: string;
  level: number;
  power: number;
  range: number;
  traitNames: readonly string[];
  abilityText: string | null;
};

export type CardModifier = {
  attribute: "level" | "power" | "range";
  amount: number;
  expiresAtTurn: number | null;
};

export type CardTurnState = {
  attacked: boolean;
  moved: boolean;
  placed: boolean;
  usedEffectIds: readonly string[];
  additionalAttacks?: number;
  attackCharactersOnly?: boolean;
  currentAttackIsExtra?: boolean;
};

export type CardInstance = {
  instanceId: string;
  cardCode: string;
  originalLevel?: number;
  originalPower?: number;
  originalRange?: number;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zone: Zone;
  faceDown: boolean;
  covered: boolean;
  attachedTo: string | null;
  attachmentIds: readonly string[];
  modifiers: readonly CardModifier[];
  turnState: CardTurnState;
};

export type BattleTarget = string | `weakness:${BattleSlot}`;

export type BattleOutcome =
  | {
      type: "weakness";
      rushPointId: string;
      timelineLengthBefore: number;
      timelineLength: number;
      rushPointDeckLength: number;
    }
  | {
      type: "attacker-retreat" | "defender-retreat" | "both-retreat";
      attackerPower: number;
      targetPower: number;
    };

export type BattleContext = {
  attackerId: string | null;
  attackerSlot: BattleSlot | null;
  targetId: BattleTarget | null;
  targetSlot: BattleSlot | null;
  consecutivePasses: number;
  resolved: boolean;
  outcome: BattleOutcome | null;
};

export type PlayerState = {
  deck: readonly string[];
  hand: readonly string[];
  battle: Record<BattleSlot, string | null>;
  base: readonly string[];
  timeline: readonly string[];
  retreat: readonly string[];
  void: readonly string[];
  rushPointDeck: readonly string[];
};

export type PendingChoice =
  | {
      type: "mulligan";
      playerId: PlayerId;
      instanceIds: readonly string[];
    }
  | {
      type: "effect";
      playerId: PlayerId;
      choiceId: string;
      effectId: string;
      sourceInstanceId: string;
      options: readonly string[];
      min: number;
      max: number;
    }
  | {
      type: "target";
      playerId: PlayerId;
      choiceId: string;
      effectId: string;
      sourceInstanceId: string;
      options: readonly string[];
      min: number;
      max: number;
      filter: EffectTargetFilter;
    }
  | {
      type: "card-order";
      playerId: PlayerId;
      choiceId: string;
      instanceIds: readonly string[];
      count: number;
    }
  | {
      type: "counter";
      playerId: PlayerId;
      sourceInstanceId: string | null;
    };

export type Resolution = {
  effectId: string;
  sourceInstanceId: string;
  controllerId: PlayerId;
  context: Readonly<
    Record<string, string | number | boolean | readonly string[]>
  >;
};

export type GameEvent = {
  sequence: number;
  type: string;
  visibility: "public" | "private";
  playerId: PlayerId | null;
  data: Readonly<
    Record<string, string | number | boolean | readonly string[]>
  >;
};

export type GameState = {
  rulesetVersion: string;
  engineVersion: string;
  seed: number;
  rngState: number;
  turnNumber: number;
  actionCallsThisTurn: number;
  baseDeploymentUsed: boolean;
  battleRearrangementUsed: boolean;
  firstPlayer: PlayerId;
  activePlayer: PlayerId;
  priorityPlayer: PlayerId;
  phase: Phase;
  actionWindow: ActionWindow;
  battle: BattleContext | null;
  players: Record<PlayerId, PlayerState>;
  instances: Record<string, CardInstance>;
  cardMetadata?: Readonly<Record<string, RuntimeCardMetadata>>;
  pendingChoice: PendingChoice | null;
  resolutionQueue: readonly Resolution[];
  pendingEndPhase?: boolean;
  events: readonly GameEvent[];
  winner: PlayerId | null;
};

export type BotView = {
  rngState: number;
  ownHand: readonly string[];
  ownDeck: readonly string[];
  publicState: {
    phase: Phase;
    actionWindow: ActionWindow;
    activePlayer: PlayerId;
    priorityPlayer: PlayerId;
    players: Record<
      PlayerId,
      {
        deckCount: number;
        handCount: number;
        battle: Record<BattleSlot, string | null>;
        base: readonly string[];
        timeline: readonly string[];
        retreat: readonly string[];
        void: readonly string[];
        rushPointDeckCount: number;
      }
    >;
  };
  legalActions: readonly GameAction[];
};

export type GameAction =
  | {
      type: "submit-mulligan";
      playerId: PlayerId;
      instanceIds: readonly string[];
    }
  | { type: "base-deploy"; playerId: PlayerId; instanceId: string }
  | {
      type: "call";
      playerId: PlayerId;
      instanceId: string;
      sacrifices: readonly string[];
    }
  | {
      type: "battle-base-move";
      playerId: PlayerId;
      instanceId: string;
      destination: BattleSlot | "base";
    }
  | { type: "end-action-phase"; playerId: PlayerId }
  | {
      type: "rearrange-battle";
      playerId: PlayerId;
      order: Record<BattleSlot, string | null>;
    }
  | { type: "declare-attack"; playerId: PlayerId; attackerId: string }
  | {
      type: "select-attack-target";
      playerId: PlayerId;
      targetId: BattleTarget;
    }
  | { type: "battle-confirmation"; playerId: PlayerId }
  | { type: "counter-pass"; playerId: PlayerId }
  | {
      type: "counter-call";
      playerId: PlayerId;
      instanceId: string;
      sacrifices: readonly string[];
    }
  | {
      type: "counter-effect";
      playerId: PlayerId;
      effectId: string;
      sourceInstanceId: string;
    }
  | {
      type: "activate-effect";
      playerId: PlayerId;
      effectId: string;
      sourceInstanceId: string;
    }
  | {
      type: "choose-effect";
      playerId: PlayerId;
      choiceId: string;
      value: string | boolean | readonly string[];
    };

export type EngineErrorCode =
  | "invalid-action"
  | "invalid-phase"
  | "not-priority-player"
  | "invalid-target"
  | "invalid-player"
  | "game-over"
  | "invalid-state";

export type EngineError = {
  code: EngineErrorCode;
  message: string;
};

export type EngineResult =
  | { ok: true; state: GameState; events: readonly GameEvent[] }
  | { ok: false; state: GameState; error: EngineError };
