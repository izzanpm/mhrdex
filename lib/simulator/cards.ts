import rawCatalog from "../../cards.en.json";

import {
  getCurrentCardAttribute,
  parseAbilityText,
  selectEffectTargets,
  type EffectContext,
  type EffectOperation,
  type EffectTargetFilter,
  type ParsedAbility,
  type RuntimeEffectDefinition,
} from "./effects";
import type {
  GameEvent,
  RuntimeCardMetadata,
  SimulatorCardDefinition,
  SimulatorBotDeckEntry,
  SimulatorCatalogCard,
  Zone,
} from "./types";

const CANDIDATE_CARD_CODES = [
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
] as const;

export const BOT_DEMO_DECK = [
  { cardCode: "BP01-001", quantity: 3 },
  { cardCode: "BP01-002", quantity: 3 },
  { cardCode: "BP01-003", quantity: 3 },
  { cardCode: "BP01-004", quantity: 3 },
  { cardCode: "BP01-005", quantity: 3 },
  { cardCode: "BP01-006", quantity: 3 },
  { cardCode: "BP01-007", quantity: 3 },
  { cardCode: "BP01-008", quantity: 3 },
  { cardCode: "BP01-009", quantity: 3 },
  { cardCode: "BP01-010", quantity: 3 },
  { cardCode: "BP01-011", quantity: 3 },
  { cardCode: "BP01-012", quantity: 3 },
  { cardCode: "BP01-013", quantity: 3 },
  { cardCode: "BP01-014", quantity: 3 },
  { cardCode: "BP01-015", quantity: 3 },
  { cardCode: "BP01-016", quantity: 3 },
  { cardCode: "BP01-017", quantity: 2 },
] as const satisfies readonly SimulatorBotDeckEntry[];

const BATTLE_ZONES: readonly Zone[] = [
  "front",
  "wingLeft",
  "wingRight",
  "back",
];
const FIELD_ZONES: readonly Zone[] = [...BATTLE_ZONES, "base"];

type CatalogRow = {
  cardCode: string;
  name: string;
  colorCode: string;
  level: number;
  power: number | null;
  range: number | null;
  traitNames: readonly string[];
  abilityText: string | null;
};

type EffectHandler = Omit<RuntimeEffectDefinition, "effectId" | "metadata">;

const DEFAULT_CATALOG_ROWS: readonly CatalogRow[] = rawCatalog.cards
  .filter((card) => CANDIDATE_CARD_CODES.includes(card.card_code as (typeof CANDIDATE_CARD_CODES)[number]))
  .map((card) => {
    const variant = card.variants[0];
    if (variant === undefined || variant.power === null || variant.range === null) {
      throw new Error(`Missing runtime attributes for ${card.card_code}.`);
    }
    return {
      cardCode: card.card_code,
      name: card.name,
      colorCode: card.color_code,
      level: variant.level,
      power: variant.power,
      range: variant.range,
      traitNames: card.traits,
      abilityText: card.ability_text,
    };
  });

const DEFAULT_ROWS_BY_CODE = new Map(
  DEFAULT_CATALOG_ROWS.map((row) => [row.cardCode, row]),
);

const EXPECTED_METADATA_BY_EFFECT_ID = new Map<string, ParsedAbility>();
for (const row of DEFAULT_CATALOG_ROWS) {
  try {
    for (const metadata of parseAbilityText(row.cardCode, row.abilityText)) {
      EXPECTED_METADATA_BY_EFFECT_ID.set(metadata.effectId, metadata);
    }
  } catch {
    // A malformed checked-in row has no safe handler metadata.
  }
}

const HANDLERS: Readonly<Record<string, EffectHandler>> = {
  "BP01-001#1": {
    canResolve: calledSource,
    resolve: (context) => {
      const selected = selectedTargets(context, "target");
      if (selected === null) {
        return [
          chooseTarget(
            "target",
            context.controllerId,
            opponentFieldFilter(context, {
              maxLevel: retreatCount(context.event),
            }),
            1,
            1,
          ),
        ];
      }
      return selected.length === 0
        ? []
        : [{ type: "prune", instanceId: selected[0]! }];
    },
  },
  "BP01-002#1": {
    canResolve: sourceInHand,
    resolve: (context) => {
      const selected = selectedTargets(context, "target");
      if (selected === null) {
        return [
          chooseTarget(
            "target",
            context.controllerId,
            opponentBattleFilter(),
            1,
            1,
          ),
        ];
      }
      return selected.length === 0
        ? []
        : [
            { type: "discard", instanceId: context.sourceInstanceId },
            { type: "modify", instanceId: selected[0]!, attribute: "power", amount: -2000 },
          ];
    },
  },
  "BP01-003#1": {
    canResolve: (context) =>
      context.event.type === "turn-ended" &&
      sourceInLocation(context, "wing") &&
      context.event.playerId === context.controllerId &&
      nonAttackingIds(context.event).includes(context.sourceInstanceId),
    resolve: (context) => {
      const selected = selectedTargets(context, "target");
      if (selected === null) {
        return [
          chooseTarget("target", context.controllerId, opponentBattleFilter(), 1, 1),
        ];
      }
      const currentPower = getCurrentCardAttribute(
        context.state,
        context.sourceInstanceId,
        "power",
        context.registry,
      );
      if (currentPower === null) return [];
      const amount = -currentPower;
      return selected.length === 0
        ? []
        : [{ type: "modify", instanceId: selected[0]!, attribute: "power", amount }];
    },
  },
  "BP01-004#1": {
    canResolve: (context) => sourceInLocation(context, "field"),
    resolve: () => [],
    getModifiers: (context) => {
      const source = context.state.instances[context.sourceInstanceId];
      if (source === undefined || !onlyRedField(context)) return [];
      const opponent = context.state.players[otherPlayer(context.controllerId)];
      const count = battleIds(opponent).length;
      return [
        { attribute: "level", amount: count, expiresAtTurn: null },
        { attribute: "power", amount: count * 1000, expiresAtTurn: null },
      ];
    },
  },
  "BP01-005#1": {
    canResolve: (context) =>
      context.event.type === "attack-declared" &&
      context.event.playerId === context.controllerId &&
      sourceInHand(context) &&
      eventAttackerId(context.event) !== null &&
      isRedCard(context.state, eventAttackerId(context.event)!),
    resolve: (context) => {
      const selected = selectedTargets(context, "target");
      if (selected === null) {
        return [
          chooseTarget(
            "target",
            context.controllerId,
            ownBattleFilter({ colorCodes: ["red"] }),
            0,
            1,
          ),
        ];
      }
      return selected.length === 0
        ? []
        : [
            { type: "discard", instanceId: context.sourceInstanceId },
            { type: "modify", instanceId: selected[0]!, attribute: "power", amount: 3000 },
          ];
    },
  },
  "BP01-006#1": {
    canResolve: (context) => sourceInLocation(context, "field"),
    resolve: () => [],
    getModifiers: (context) => {
      const source = context.state.instances[context.sourceInstanceId];
      if (source === undefined || !sourceInLocation(context, "field")) return [];
      return context.state.players[context.controllerId].hand.length % 2 === 1
        ? [{ attribute: "range", amount: 2, expiresAtTurn: null }]
        : [{ attribute: "power", amount: 5500, expiresAtTurn: null }];
    },
  },
  "BP01-007#1": {
    canResolve: (context) =>
      context.event.type === "entered-void" &&
      eventInstanceId(context.event) === context.sourceInstanceId &&
      context.event.data.from === "retreat" &&
      sourceInLocation(context, "void") &&
      context.state.players[context.controllerId].hand.length >= 2 &&
      fieldPlacementOptions(context).length > 0,
    resolve: (context) => {
      const selected = selectedTargets(context, "placement");
      if (selected === null) {
        return [
          chooseOptions(
            "placement",
            context.controllerId,
            fieldPlacementOptions(context),
            0,
            1,
          ),
        ];
      }
      if (selected.length === 0) return [];
      const opponentFront = context.state.players[otherPlayer(context.controllerId)].battle.front;
      const operations: EffectOperation[] = [
        { type: "discard", instanceId: context.state.players[context.controllerId].hand[0]! },
        { type: "discard", instanceId: context.state.players[context.controllerId].hand[1]! },
        { type: "place", instanceId: context.sourceInstanceId, destination: selected[0] as Zone },
      ];
      if (opponentFront !== null) {
        operations.push({ type: "modify", instanceId: opponentFront, attribute: "power", amount: -1000 });
      }
      return operations;
    },
  },
  "BP01-008#1": {
    canResolve: calledSource,
    resolve: (context) => {
      const selected = selectedTargets(context, "use");
      if (selected === null) {
        return [chooseOptions("use", context.controllerId, ["yes", "no"], 1, 1)];
      }
      if (selected[0] !== "yes") return [];
      const attached = Object.values(context.state.instances)
        .filter((instance) =>
          instance.attachedTo !== null &&
          isFieldZone(instance.zone) &&
          isFieldZone(context.state.instances[instance.attachedTo]?.zone ?? "void"),
        )
        .map((instance) => instance.instanceId);
      return attached.map((instanceId) => ({ type: "prune", instanceId }));
    },
  },
  "BP01-009#1": {
    canResolve: (context) =>
      context.event.type === "activate-effect" &&
      sourceInLocation(context, "battle") &&
      context.state.players[context.controllerId].base.length === 0 &&
      sacrificeCandidates(context).length > 0 &&
       selectEffectTargets(
         context.state,
         context.controllerId,
         opponentBattleFilter(),
         context.registry,
       ).length > 0,
    resolve: (context) => {
      const sacrifice = selectedTargets(context, "sacrifice");
      if (sacrifice === null) {
        return [
          chooseTarget("sacrifice", context.controllerId, {
            controller: "self",
            zones: ["retreat"],
            colorCodes: ["red"],
            minLevel: 5,
            maxLevel: 6,
          }, 1, 1),
        ];
      }
      const target = selectedTargets(context, "target");
      if (target === null) {
        return [chooseTarget("target", context.controllerId, opponentBattleFilter(), 1, 1)];
      }
      return sacrifice.length === 0 || target.length === 0
        ? []
        : [
            { type: "prune", instanceId: sacrifice[0]! },
            { type: "modify", instanceId: target[0]!, attribute: "power", amount: -1000 },
          ];
    },
  },
  "BP01-010#1": {
    canResolve: sourceInHand,
    resolve: (context) => {
      const selected = selectedTargets(context, "target");
      if (selected === null) {
        return [chooseTarget("target", context.controllerId, {
          controller: "self",
          zones: FIELD_ZONES,
          traitNames: ["Machine"],
          minLevel: 4,
        }, 1, 1)];
      }
      return selected.length === 0
        ? []
        : [{ type: "attach", instanceId: context.sourceInstanceId, targetInstanceId: selected[0]! }];
    },
  },
  "BP01-010#2": {
    canResolve: (context) =>
      context.event.type === "activate-effect" &&
      sourceInLocation(context, "back") &&
      selectEffectTargets(context.state, context.controllerId, {
        controller: "self",
        zones: ["base"],
        traitNames: ["Machine"],
        maxLevel: 1,
        attached: "attached",
      }, context.registry).length > 0,
    resolve: (context) => {
      const selected = selectedTargets(context, "target");
      if (selected === null) {
        return [chooseTarget("target", context.controllerId, {
          controller: "self",
          zones: ["base"],
          traitNames: ["Machine"],
          maxLevel: 1,
          attached: "attached",
        }, 1, 1)];
      }
      return selected.length === 0
        ? []
        : [{ type: "detach", instanceId: selected[0]!, destination: "hand" }];
    },
  },
  "BP01-011#1": {
    canResolve: (context) => calledSource(context) && context.state.players[context.controllerId].deck.length > 0,
    resolve: (context) => [
      { type: "draw", playerId: context.controllerId, count: 1 },
      { type: "set-turn-state", instanceId: context.sourceInstanceId, field: "additionalAttacks", value: 1 },
      { type: "set-turn-state", instanceId: context.sourceInstanceId, field: "attackCharactersOnly", value: true },
    ],
  },
  "BP01-012#1": {
    canResolve: (context) =>
      calledSource(context) &&
      sourceInLocation(context, "battle") &&
      context.state.players[context.controllerId].base.length + 2 <= 6 &&
      context.state.players[context.controllerId].deck.length >= 2 &&
      Object.values(context.state.instances).some(
        (instance) =>
          instance.controllerId === context.controllerId &&
          instance.zone === "base" &&
          isRedCard(context.state, instance.instanceId),
      ),
    resolve: (context) => {
      const selected = selectedTargets(context, "use");
      if (selected === null) {
        return [chooseOptions("use", context.controllerId, ["yes", "no"], 1, 1)];
      }
      return selected[0] === "yes"
        ? context.state.players[context.controllerId].deck.slice(0, 2).map(
            (instanceId) => ({ type: "place", instanceId, destination: "base" }),
          )
        : [];
    },
  },
  "BP01-013#1": {
    canResolve: (context) =>
      calledSource(context) &&
      context.state.players[otherPlayer(context.controllerId)].base.length < 6,
    resolve: (context) => {
      const selected = selectedTargets(context, "target");
      if (selected === null) {
        return [chooseTarget("target", context.controllerId, {
          ...opponentBattleFilter(),
          traitNames: ["Human"],
          minPower: 5000,
        }, 1, 1)];
      }
      return selected.length === 0
        ? []
        : [
            { type: "move", instanceId: selected[0]!, destination: "base" },
            { type: "cover", instanceId: selected[0]! },
          ];
    },
  },
  "BP01-014#1": {
    canResolve: (context) =>
      calledSource(context) &&
      Object.values(context.state.instances).some(
        (instance) =>
          instance.controllerId === context.controllerId &&
          isFieldZone(instance.zone) &&
          instance.instanceId !== context.sourceInstanceId &&
          cardName(context.state, instance.instanceId).includes("ultron"),
      ),
    resolve: (context) => {
      const selected = selectedTargets(context, "target");
      if (selected === null) {
        return [chooseTarget("target", context.controllerId, {
          ...opponentBattleFilter(),
          maxLevel: 3,
        }, 0, 1)];
      }
      return selected.length === 0 ? [] : [{ type: "retreat", instanceId: selected[0]! }];
    },
  },
  "BP01-015#1": {
    canResolve: calledSource,
    resolve: (context) => {
      const selected = selectedTargets(context, "target");
      if (selected === null) {
        return [chooseTarget("target", context.controllerId, {
          ...opponentBattleFilter(),
          maxPower: 4000,
        }, 0, 1)];
      }
      return selected.length === 0 ? [] : [{ type: "prune", instanceId: selected[0]! }];
    },
  },
  "BP01-016#1": {
    canResolve: (context) =>
      context.event.type === "called" &&
      context.event.playerId === context.controllerId &&
      sourceInLocation(context, "battle") &&
      isCalledLevelAtLeast(context, 4) &&
      context.state.players[otherPlayer(context.controllerId)].base.length < 6,
    resolve: (context) => {
      const selected = selectedTargets(context, "target");
      if (selected === null) {
        return [chooseTarget("target", context.controllerId, {
          ...opponentBattleFilter(),
          maxLevel: 3,
        }, 0, 1)];
      }
      return selected.length === 0 ? [] : [{ type: "move", instanceId: selected[0]!, destination: "base" }];
    },
  },
  "BP01-017#1": {
    canResolve: calledSource,
    resolve: (context) => {
      const selected = selectedTargets(context, "target");
      if (selected === null) {
        return [chooseTarget("target", context.controllerId, {
          controller: "opponent",
          zones: ["retreat"],
        }, 0, 1)];
      }
      return selected.length === 0
        ? []
        : [
            { type: "prune", instanceId: selected[0]! },
            { type: "modify", instanceId: context.sourceInstanceId, attribute: "power", amount: 1000 },
          ];
    },
  },
};

export const SUPPORTED_EFFECT_IDS: ReadonlySet<string> = new Set(
  Object.keys(HANDLERS),
);

export function createRuntimeEffectRegistry(
  catalog?: readonly (SimulatorCatalogCard | RuntimeCardMetadata)[],
): ReadonlyMap<string, RuntimeEffectDefinition> {
  const rows = getCatalogRows(catalog);
  const registry = new Map<string, RuntimeEffectDefinition>();

  for (const cardCode of CANDIDATE_CARD_CODES) {
    const row = rows.get(cardCode);
    if (row === undefined || row.power === null || row.range === null) continue;
    let parsed: readonly ParsedAbility[];
    try {
      parsed = parseAbilityText(cardCode, row.abilityText);
    } catch {
      continue;
    }
    if (
      parsed.length === 0 ||
      parsed.some((metadata) => {
        const expected = EXPECTED_METADATA_BY_EFFECT_ID.get(metadata.effectId);
        return HANDLERS[metadata.effectId] === undefined ||
          expected === undefined ||
          !sameParsedAbility(metadata, expected);
      })
    ) {
      continue;
    }
    for (const metadata of parsed) {
      const handler = HANDLERS[metadata.effectId];
      registry.set(metadata.effectId, {
        effectId: metadata.effectId,
        metadata,
        ...handler,
      });
    }
  }
  return registry;
}

export const RUNTIME_EFFECTS: ReadonlyMap<string, RuntimeEffectDefinition> =
  createRuntimeEffectRegistry();

export function getSupportedCardCodes(
  catalog?: readonly SimulatorCatalogCard[],
): ReadonlySet<string> {
  const rows = getCatalogRows(catalog);
  const supported = new Set<string>();
  for (const cardCode of CANDIDATE_CARD_CODES) {
    const row = rows.get(cardCode);
    if (row === undefined || row.power === null || row.range === null) continue;
    try {
      const parsed = parseAbilityText(cardCode, row.abilityText);
      if (
        parsed.length > 0 &&
        parsed.every((ability) => {
          const expected = EXPECTED_METADATA_BY_EFFECT_ID.get(ability.effectId);
          return SUPPORTED_EFFECT_IDS.has(ability.effectId) &&
            expected !== undefined &&
            sameParsedAbility(ability, expected);
        })
      ) {
        supported.add(cardCode);
      }
    } catch {
      // A malformed catalog row is not safe to advertise to the adapter.
    }
  }
  return supported;
}

export const SUPPORTED_CARD_CODES: ReadonlySet<string> = getSupportedCardCodes();

export function createSupportedCardDefinitions(
  catalog: readonly SimulatorCatalogCard[],
): ReadonlyMap<string, SimulatorCardDefinition> {
  const supported = getSupportedCardCodes(catalog);
  const definitions = new Map<string, SimulatorCardDefinition>();
  for (const card of catalog) {
    if (!supported.has(card.cardCode) || card.power === null || card.range === null) continue;
    const parsed = parseAbilityText(card.cardCode, card.abilityText);
    definitions.set(card.cardId, {
      cardId: card.cardId,
      cardCode: card.cardCode,
      name: card.name,
      colorCode: card.colorCode,
      level: card.level,
      power: card.power,
      range: card.range,
      traitNames: card.traitNames,
      abilityText: card.abilityText,
      effectIds: parsed.map((ability) => ability.effectId),
    });
  }
  return definitions;
}

export const createCardDefinitions = createSupportedCardDefinitions;

function getCatalogRows(
  catalog?: readonly (SimulatorCatalogCard | RuntimeCardMetadata)[],
): ReadonlyMap<string, CatalogRow> {
  if (catalog === undefined) {
    return new Map(DEFAULT_CATALOG_ROWS.map((row) => [row.cardCode, row]));
  }

  const rows = new Map<string, CatalogRow>();
  const seen = new Set<string>();
  const seenCardIds = new Map<string, string>();
  const invalid = new Set<string>();
  for (const card of catalog) {
    if (seen.has(card.cardCode)) {
      rows.delete(card.cardCode);
      invalid.add(card.cardCode);
      continue;
    }
    seen.add(card.cardCode);
    if (!isValidCatalogRow(card)) {
      invalid.add(card.cardCode);
      continue;
    }
    if (isSimulatorCatalogCard(card)) {
      const previousCode = seenCardIds.get(card.cardId);
      if (previousCode !== undefined) {
        rows.delete(previousCode);
        invalid.add(previousCode);
        invalid.add(card.cardCode);
        continue;
      }
      seenCardIds.set(card.cardId, card.cardCode);
    }
    rows.set(card.cardCode, {
      cardCode: card.cardCode,
      name: card.name,
      colorCode: card.colorCode,
      level: card.level,
      power: card.power,
      range: card.range,
      traitNames: card.traitNames,
      abilityText: card.abilityText,
    });
  }
  for (const cardCode of invalid) rows.delete(cardCode);
  return rows;
}

function isValidCatalogRow(
  card: SimulatorCatalogCard | RuntimeCardMetadata,
): boolean {
  if (
    isSimulatorCatalogCard(card) &&
    (
      typeof card.cardId !== "string" ||
      card.cardId.length === 0 ||
      card.cardType !== "Character" ||
      card.isBase !== true
    )
  ) return false;
  return (
    typeof card.cardCode === "string" &&
    card.cardCode.length > 0 &&
    typeof card.name === "string" &&
    card.name.length > 0 &&
    typeof card.colorCode === "string" &&
    Number.isInteger(card.level) &&
    card.level >= 1 &&
    card.level <= 6 &&
    (card.power === null || (Number.isFinite(card.power) && Number.isInteger(card.power) && card.power >= 0)) &&
    (card.range === null || (Number.isFinite(card.range) && Number.isInteger(card.range) && card.range >= 0)) &&
    Array.isArray(card.traitNames) &&
    card.traitNames.every((trait) => typeof trait === "string") &&
    (card.abilityText === null || typeof card.abilityText === "string")
  );
}

function isSimulatorCatalogCard(
  card: SimulatorCatalogCard | RuntimeCardMetadata,
): card is SimulatorCatalogCard {
  return "cardId" in card || "cardType" in card || "isBase" in card;
}

function sameParsedAbility(left: ParsedAbility, right: ParsedAbility): boolean {
  return (
    left.effectId === right.effectId &&
    left.kind === right.kind &&
    left.counter === right.counter &&
    left.oncePerTurn === right.oncePerTurn &&
    left.body === right.body &&
    left.locations.length === right.locations.length &&
    left.locations.every((location, index) => location === right.locations[index])
  );
}

function metadata(state: EffectContext["state"], instanceId: string): RuntimeCardMetadata | CatalogRow | undefined {
  const instance = state.instances[instanceId];
  if (instance === undefined) return undefined;
  return state.cardMetadata?.[instance.cardCode] ?? DEFAULT_ROWS_BY_CODE.get(instance.cardCode);
}

function cardName(state: EffectContext["state"], instanceId: string): string {
  return metadata(state, instanceId)?.name.toLowerCase() ?? "";
}

function isRedCard(state: EffectContext["state"], instanceId: string): boolean {
  return metadata(state, instanceId)?.colorCode === "red";
}

function sourceInHand(context: EffectContext): boolean {
  return sourceInLocation(context, "hand");
}

function sourceInLocation(
  context: EffectContext,
  location: "field" | "battle" | "wing" | "back" | "hand" | "void",
): boolean {
  const source = context.state.instances[context.sourceInstanceId];
  if (source === undefined) return false;
  if (location === "field") return FIELD_ZONES.includes(source.zone) && !source.faceDown;
  if (location === "battle") return BATTLE_ZONES.includes(source.zone) && !source.faceDown;
  if (location === "wing") {
    return !source.faceDown && (source.zone === "wingLeft" || source.zone === "wingRight");
  }
  if (location === "back") return !source.faceDown && source.zone === "back";
  return source.zone === location;
}

function isFieldZone(zone: Zone): boolean {
  return BATTLE_ZONES.includes(zone) || zone === "base";
}

function calledSource(context: EffectContext): boolean {
  return (
    context.event.type === "called" &&
    context.event.playerId === context.controllerId &&
    eventInstanceId(context.event) === context.sourceInstanceId &&
    sourceInLocation(context, "field")
  );
}

function eventInstanceId(event: GameEvent): string | null {
  const value = event.data.instanceId;
  return typeof value === "string" ? value : null;
}

function eventAttackerId(event: GameEvent): string | null {
  const value = event.data.attackerId;
  return typeof value === "string" ? value : null;
}

function isCalledLevelAtLeast(context: EffectContext, level: number): boolean {
  const calledId = eventInstanceId(context.event);
  if (calledId === null) return false;
  const current = getCurrentCardAttribute(context.state, calledId, "level");
  return current !== null && current >= level;
}

function retreatCount(event: GameEvent): number {
  const sacrifices = event.data.sacrifices;
  return Array.isArray(sacrifices) ? sacrifices.length : 0;
}

function nonAttackingIds(event: GameEvent): readonly string[] {
  const value = event.data.nonAttackingInstanceIds;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function otherPlayer(playerId: "player" | "bot"): "player" | "bot" {
  return playerId === "player" ? "bot" : "player";
}

function battleIds(player: EffectContext["state"]["players"]["player"]): string[] {
  return BATTLE_ZONES.flatMap((zone) => {
    const id = player.battle[zone as "front" | "wingLeft" | "wingRight" | "back"];
    return id === null ? [] : [id];
  });
}

function onlyRedField(context: EffectContext): boolean {
  const player = context.state.players[context.controllerId];
  return FIELD_ZONES.every((zone) => {
    const id = zone === "base"
      ? player.base
      : [player.battle[zone as "front" | "wingLeft" | "wingRight" | "back"]].filter(
          (candidate): candidate is string => candidate !== null,
        );
    return id.every((instanceId) => isRedCard(context.state, instanceId));
  });
}

function opponentFieldFilter(
  context: EffectContext,
  overrides: Partial<EffectTargetFilter> = {},
): EffectTargetFilter {
  return {
    controller: "opponent",
    zones: FIELD_ZONES,
    ...overrides,
  };
}

function opponentBattleFilter(): EffectTargetFilter {
  return { controller: "opponent", zones: BATTLE_ZONES };
}

function ownBattleFilter(
  overrides: Partial<EffectTargetFilter> = {},
): EffectTargetFilter {
  return { controller: "self", zones: BATTLE_ZONES, ...overrides };
}

function chooseTarget(
  choiceId: string,
  playerId: "player" | "bot",
  filter: EffectTargetFilter,
  min: number,
  max: number,
): EffectOperation {
  return { type: "choose-target", choiceId, playerId, filter, min, max };
}

function chooseOptions(
  choiceId: string,
  playerId: "player" | "bot",
  options: readonly string[],
  min: number,
  max: number,
): EffectOperation {
  return { type: "choose-options", choiceId, playerId, options, min, max };
}

function selectedTargets(
  context: EffectContext,
  choiceId: string,
): readonly string[] | null {
  const value = contextValue(context, `choice:${choiceId}`);
  if (value === undefined) return null;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function contextValue(
  context: EffectContext,
  key: string,
): string | number | boolean | readonly string[] | undefined {
  return contextValueFromResolution(context, key);
}

function contextValueFromResolution(
  context: EffectContext,
  key: string,
): string | number | boolean | readonly string[] | undefined {
  return context.resolutionContext?.[key];
}

function sacrificeCandidates(context: EffectContext): readonly string[] {
  return selectEffectTargets(context.state, context.controllerId, {
    controller: "self",
    zones: ["retreat"],
    colorCodes: ["red"],
    minLevel: 5,
  }, context.registry);
}

function fieldPlacementOptions(context: EffectContext): readonly string[] {
  const player = context.state.players[context.controllerId];
  const slots = BATTLE_ZONES.filter(
    (zone) => player.battle[zone as "front" | "wingLeft" | "wingRight" | "back"] === null,
  );
  return player.base.length < 6 ? [...slots, "base"] : slots;
}
