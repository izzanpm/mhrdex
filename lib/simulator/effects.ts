import type {
  BattleSlot,
  CardModifier,
  CardInstance,
  EffectTargetFilter,
  GameEvent,
  GameState,
  PlayerId,
  Resolution,
  Zone,
} from "./types";

export type AbilityKind = "trigger" | "auto" | "activated";

export type ParsedAbility = {
  effectId: string;
  kind: AbilityKind;
  counter: boolean;
  locations: readonly string[];
  oncePerTurn: boolean;
  body: string;
};

export type AbilityParserErrorCode =
  | "invalid-header"
  | "missing-location"
  | "unclosed-bracket"
  | "missing-colon"
  | "unclosed-wrapper";

export class AbilityParserError extends Error {
  readonly code: AbilityParserErrorCode;
  readonly cardCode: string;
  readonly clauseIndex: number;

  constructor(
    code: AbilityParserErrorCode,
    cardCode: string,
    clauseIndex: number,
    message: string,
  ) {
    super(`${code}: ${cardCode} clause ${clauseIndex}: ${message}`);
    this.name = "AbilityParserError";
    this.code = code;
    this.cardCode = cardCode;
    this.clauseIndex = clauseIndex;
  }
}

type HeaderParse = {
  kind: AbilityKind;
  counter: boolean;
  locations: readonly string[];
  oncePerTurn: boolean;
  bodyStart: number;
  bodyEnd: number | null;
  nextScanStart: number;
};

const HEADER_NAMES = ["TRIG", "AUTO", "ACTI"] as const;
const OPEN_BRACKETS = new Map([
  ["【", "】"],
  ["［", "］"],
  ["[", "]"],
]);

export function parseAbilityText(
  cardCode: string,
  abilityText: string | null,
): readonly ParsedAbility[] {
  if (abilityText === null || abilityText.trim() === "") return [];

  const parsed: ParsedAbility[] = [];
  let position = skipWhitespace(abilityText, 0);
  let clauseIndex = 1;

  while (position < abilityText.length) {
    const header = parseHeaderAt(abilityText, position, cardCode, clauseIndex);
    const bodyEnd =
      header.bodyEnd ?? findNextClauseStart(abilityText, header.bodyStart);
    const body = abilityText.slice(header.bodyStart, bodyEnd ?? abilityText.length).trim();

    parsed.push({
      effectId: `${cardCode}#${clauseIndex}`,
      kind: header.kind,
      counter: header.counter,
      locations: header.locations,
      oncePerTurn: header.oncePerTurn,
      body,
    });

    const nextPosition =
      header.bodyEnd === null
        ? findNextClauseStart(abilityText, header.bodyStart)
        : skipWhitespace(abilityText, header.nextScanStart);
    if (nextPosition === null || nextPosition >= abilityText.length) break;
    position = nextPosition;
    clauseIndex += 1;
  }

  return parsed;
}

function parseHeaderAt(
  text: string,
  start: number,
  cardCode: string,
  clauseIndex: number,
): HeaderParse {
  const counterWrapper = startsWithWord(text, start, "COUNTER");
  const uniqueWrapper = startsWithWord(text, start, "UNIQUE");

  if (counterWrapper || uniqueWrapper) {
    let cursor = start + (counterWrapper ? "COUNTER" : "UNIQUE").length;
    cursor = skipWhitespace(text, cursor);
    if (text[cursor] === "·" || text[cursor] === ".") {
      if (!counterWrapper) {
        throw parserError(
          "invalid-header",
          cardCode,
          clauseIndex,
          "UNIQUE must wrap a typed ability header",
        );
      }
      cursor = skipWhitespace(text, cursor + 1);
      const nested = parseBaseHeader(text, cursor, cardCode, clauseIndex, true);
      return { ...nested, nextScanStart: nested.bodyStart };
    }
    if (text[cursor] !== "(") {
      throw parserError(
        "invalid-header",
        cardCode,
        clauseIndex,
        "expected a wrapped ability header",
      );
    }

    const wrapperStart = cursor;
    const nested = parseBaseHeader(
      text,
      skipWhitespace(text, cursor + 1),
      cardCode,
      clauseIndex,
      counterWrapper,
    );
    const wrapperEnd = findMatchingParenthesis(text, wrapperStart);
    if (wrapperEnd === null) {
      throw parserError(
        "unclosed-wrapper",
        cardCode,
        clauseIndex,
        "the wrapped ability header is not closed",
      );
    }
    if (nested.bodyStart > wrapperEnd) {
      throw parserError(
        "invalid-header",
        cardCode,
        clauseIndex,
        "the wrapped ability body is invalid",
      );
    }
    return {
      ...nested,
      bodyEnd: wrapperEnd,
      nextScanStart: wrapperEnd + 1,
    };
  }

  return parseBaseHeader(text, start, cardCode, clauseIndex, false);
}

function parseBaseHeader(
  text: string,
  start: number,
  cardCode: string,
  clauseIndex: number,
  counter: boolean,
): HeaderParse {
  const name = HEADER_NAMES.find((candidate) =>
    startsWithWord(text, start, candidate),
  );
  if (name === undefined) {
    throw parserError(
      "invalid-header",
      cardCode,
      clauseIndex,
      "expected TRIG, AUTO, or ACTI",
    );
  }

  let cursor = skipWhitespace(text, start + name.length);
  const open = text[cursor];
  const close = open === undefined ? undefined : OPEN_BRACKETS.get(open);
  if (close === undefined) {
    throw parserError(
      "missing-location",
      cardCode,
      clauseIndex,
      "an ability header must include a location bracket",
    );
  }
  const closeIndex = text.indexOf(close, cursor + 1);
  if (closeIndex === -1) {
    throw parserError(
      "unclosed-bracket",
      cardCode,
      clauseIndex,
      "the location bracket is not closed",
    );
  }

  const locationText = text.slice(cursor + 1, closeIndex);
  const locationParts = locationText
    .split("/")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length > 0);
  const oncePerTurn = locationParts.some(
    (part) => part === "ONCE PER TURN",
  );
  const locations = locationParts.filter((part) => part !== "ONCE PER TURN");
  if (locations.length === 0) {
    throw parserError(
      "missing-location",
      cardCode,
      clauseIndex,
      "an ability header must include at least one location",
    );
  }

  cursor = skipWhitespace(text, closeIndex + 1);
  const colon = text[cursor];
  if (colon !== ":" && colon !== "：") {
    throw parserError(
      "missing-colon",
      cardCode,
      clauseIndex,
      "an ability header must be followed by a colon",
    );
  }

  return {
    kind:
      name === "TRIG" ? "trigger" : name === "AUTO" ? "auto" : "activated",
    counter,
    locations,
    oncePerTurn,
    bodyStart: skipWhitespace(text, cursor + 1),
    bodyEnd: null,
    nextScanStart: skipWhitespace(text, cursor + 1),
  };
}

function findNextClauseStart(text: string, start: number): number | null {
  let parentheses = 0;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (character === "(") {
      parentheses += 1;
      continue;
    }
    if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
      continue;
    }
    if (parentheses !== 0 || !isClauseBoundary(text, index)) continue;
    if (isHeaderStart(text, index)) {
      return index;
    }
  }
  return null;
}

function isHeaderStart(text: string, index: number): boolean {
  const name = HEADER_NAMES.find((candidate) => startsWithWord(text, index, candidate));
  if (name !== undefined) {
    const next = skipWhitespace(text, index + name.length);
    const marker = text[next];
    if (marker !== undefined && OPEN_BRACKETS.has(marker)) return true;
    if (
      marker === ":" ||
      marker === "：" ||
      marker === "·" ||
      marker === "." ||
      marker === "("
    ) {
      return true;
    }
    if (marker !== undefined && /[A-Z]/.test(marker)) {
      let tokenEnd = next;
      while (/[A-Za-z0-9_-]/.test(text[tokenEnd] ?? "")) tokenEnd += 1;
      const afterToken = skipWhitespace(text, tokenEnd);
      return text[afterToken] === ":" || text[afterToken] === "：";
    }
  }
  if (startsWithWord(text, index, "COUNTER")) {
    const next = text[skipWhitespace(text, index + "COUNTER".length)];
    return next === "·" || next === "." || next === "(";
  }
  return startsWithWord(text, index, "UNIQUE") &&
    text[skipWhitespace(text, index + "UNIQUE".length)] === "(";
}

function isClauseBoundary(text: string, index: number): boolean {
  if (index === 0) return true;
  const previous = text[index - 1];
  return previous !== undefined && /\s/.test(previous);
}

function startsWithWord(text: string, start: number, word: string): boolean {
  if (text.slice(start, start + word.length).toUpperCase() !== word) {
    return false;
  }
  const next = text[start + word.length];
  return next === undefined || /\s|【|［|\[|·|\.|\(/.test(next);
}

function findMatchingParenthesis(text: string, start: number): number | null {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function skipWhitespace(text: string, start: number): number {
  let cursor = start;
  while (cursor < text.length && /\s/.test(text[cursor] ?? "")) cursor += 1;
  return cursor;
}

function parserError(
  code: AbilityParserErrorCode,
  cardCode: string,
  clauseIndex: number,
  message: string,
): AbilityParserError {
  return new AbilityParserError(code, cardCode, clauseIndex, message);
}

export type EffectContext = {
  state: GameState;
  sourceInstanceId: string;
  controllerId: PlayerId;
  event: GameEvent;
  registry?: RuntimeEffectRegistry;
  resolutionContext?: Readonly<
    Record<string, string | number | boolean | readonly string[]>
  >;
};

export type EffectAuthorization = {
  controllerId: PlayerId;
  sourceInstanceId: string;
};

export type { EffectTargetFilter } from "./types";

export type EffectOperation =
  | { type: "draw"; playerId: PlayerId; count: number }
  | { type: "discard"; instanceId: string }
  | { type: "move"; instanceId: string; destination: Zone }
  | { type: "place"; instanceId: string; destination: Zone }
  | { type: "cover"; instanceId: string }
  | { type: "retreat"; instanceId: string }
  | { type: "prune"; instanceId: string }
  | { type: "attach"; instanceId: string; targetInstanceId: string }
  | { type: "detach"; instanceId: string; destination?: Zone }
  | {
      type: "modify";
      instanceId: string;
      attribute: "level" | "range" | "power";
      amount: number;
    }
  | {
      type: "choose-target";
      choiceId: string;
      playerId: PlayerId;
      filter: EffectTargetFilter;
      min: number;
      max: number;
    }
  | {
      type: "choose-options";
      choiceId: string;
      playerId: PlayerId;
      options: readonly string[];
      min: number;
      max: number;
    }
  | {
      type: "set-turn-state";
      instanceId: string;
      field: "additionalAttacks" | "attackCharactersOnly";
      value: number | boolean;
    };

export type RuntimeEffectDefinition = {
  effectId: string;
  metadata: ParsedAbility;
  canResolve: (context: EffectContext) => boolean;
  resolve: (context: EffectContext) => readonly EffectOperation[];
  getModifiers?: (
    context: EffectContext,
  ) => readonly CardModifier[];
};

export type RuntimeEffectRegistry = ReadonlyMap<
  string,
  RuntimeEffectDefinition
>;

export type EffectResolutionResult =
  | {
      ok: true;
      events: readonly EffectEvent[];
      needsDeckOutCheck: boolean;
    }
  | {
      ok: false;
      events: readonly [];
      needsDeckOutCheck: false;
      error: string;
    };

export type EffectEvent = Omit<GameEvent, "sequence">;

export function selectEffectTargets(
  state: GameState,
  controllerId: PlayerId,
  filter: EffectTargetFilter,
  registry?: RuntimeEffectRegistry,
): readonly string[] {
  if (!isValidEffectTargetFilter(filter)) return [];
  const attached = filter.attached ?? "unattached";
  return Object.values(state.instances)
    .filter((instance) => {
      if (!filter.zones.includes(instance.zone)) return false;
      if (instance.instanceId === filter.excludeInstanceId) return false;
      if (instance.faceDown && instance.controllerId !== controllerId) return false;
      if (
        filter.controller !== "any" &&
        (filter.controller === "self"
          ? instance.controllerId !== controllerId
          : instance.controllerId === controllerId)
      ) {
        return false;
      }
      if (filter.cardCodes && !filter.cardCodes.includes(instance.cardCode)) {
        return false;
      }
      const metadata = state.cardMetadata?.[instance.cardCode];
      if (filter.colorCodes && (metadata === undefined || !filter.colorCodes.includes(metadata.colorCode))) {
        return false;
      }
      if (attached === "attached" && instance.attachedTo === null) {
        return false;
      }
      if (attached === "unattached" && instance.attachedTo !== null) {
        return false;
      }
      if (
        filter.traitNames &&
        (metadata === undefined ||
          !filter.traitNames.every((trait) => metadata.traitNames.includes(trait)))
      ) {
        return false;
      }
      if (
        filter.nameIncludes !== undefined &&
        (metadata === undefined ||
          !metadata.name.toLowerCase().includes(filter.nameIncludes.toLowerCase()))
      ) {
        return false;
      }
      const level = getCurrentCardAttribute(
        state,
        instance.instanceId,
        "level",
        registry,
      );
      if (filter.minLevel !== undefined && (level === null || level < filter.minLevel)) {
        return false;
      }
      if (filter.maxLevel !== undefined && (level === null || level > filter.maxLevel)) {
        return false;
      }
      const power = getCurrentCardAttribute(
        state,
        instance.instanceId,
        "power",
        registry,
      );
      if (filter.minPower !== undefined && (power === null || power < filter.minPower)) {
        return false;
      }
      if (filter.maxPower !== undefined && (power === null || power > filter.maxPower)) {
        return false;
      }
      return true;
    })
    .map((instance) => instance.instanceId);
}

export function getCurrentCardAttribute(
  state: GameState,
  instanceId: string,
  attribute: "level" | "range" | "power",
  registry?: RuntimeEffectRegistry,
): number | null {
  const instance = state.instances[instanceId];
  const original =
    attribute === "level"
      ? instance?.originalLevel
      : attribute === "power"
        ? instance?.originalPower
        : instance?.originalRange;
  if (original === undefined || !Number.isInteger(original)) return null;

  const explicit = (instance?.modifiers ?? [])
    .filter(
      (modifier) =>
        modifier.attribute === attribute &&
        (modifier.expiresAtTurn === null ||
          modifier.expiresAtTurn >= state.turnNumber),
    )
    .reduce((total, modifier) => total + modifier.amount, 0);
  const automatic = registry
    ? getActiveEffectModifiers(state, instanceId, registry)
        .filter((modifier) => modifier.attribute === attribute)
        .reduce((total, modifier) => total + modifier.amount, 0)
    : 0;
  const current = original + explicit + automatic;
  if (!Number.isInteger(current)) return null;
  if ((attribute === "range" || attribute === "level") && current < 0) {
    return null;
  }
  return current;
}

export function getActiveEffectModifiers(
  state: GameState,
  instanceId: string,
  registry: RuntimeEffectRegistry,
): readonly CardModifier[] {
  const source = state.instances[instanceId];
  if (source === undefined) return [];
  const modifiers: CardModifier[] = [];
  for (const definition of registry.values()) {
    if (definition.metadata.kind !== "auto") continue;
    if (!definition.effectId.startsWith(`${source.cardCode}#`)) continue;
    if (!isSourceAtLocation(source, definition.metadata.locations)) continue;
    if (definition.getModifiers === undefined) continue;
    const context: EffectContext = {
      state,
      sourceInstanceId: instanceId,
      controllerId: source.controllerId,
      event: {
        sequence: 0,
        type: "auto-query",
        visibility: "private",
        playerId: source.controllerId,
        data: {},
      },
      registry,
    };
    modifiers.push(...definition.getModifiers(context));
  }
  return modifiers;
}

export function queueTriggeredEffects(
  state: GameState,
  event: GameEvent,
  registry: RuntimeEffectRegistry,
): readonly Resolution[] {
  if (
    !isValidGameEvent(event) ||
    !isValidEffectState(state) ||
    !hasStoredEvent(state, event) ||
    !isOwnedEventPayload(state, event) ||
    validateResolutionState(state, registry) !== null
  ) return [];
  return collectTriggeredEffects(state, event, registry);
}

function collectTriggeredEffects(
  state: GameState,
  event: GameEvent,
  registry: RuntimeEffectRegistry,
): Resolution[] {
  const activePlayer = event.playerId ?? state.activePlayer;
  const sources = Object.values(state.instances)
    .filter((instance) => instance.zone !== "rushPointDeck")
    .sort((left, right) => {
      const leftPriority = left.controllerId === activePlayer ? 0 : 1;
      const rightPriority = right.controllerId === activePlayer ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.instanceId.localeCompare(right.instanceId);
    });
  const queued: Resolution[] = [];

  for (const source of sources) {
    for (const definition of registry.values()) {
      if (definition.metadata.kind !== "trigger") continue;
      if (!definition.effectId.startsWith(`${source.cardCode}#`)) continue;
      if (!isSourceAtLocation(source, definition.metadata.locations)) continue;
      if (
        definition.metadata.oncePerTurn &&
        (source.turnState.usedEffectIds.includes(definition.effectId) ||
          hasQueuedResolution(state, definition.effectId, source.instanceId))
      ) {
        continue;
      }
      const context: EffectContext = {
        state,
        sourceInstanceId: source.instanceId,
        controllerId: source.controllerId,
        event,
        registry,
      };
      let canResolve = false;
      try {
        canResolve = definition.canResolve(context);
      } catch {
        continue;
      }
      if (!canResolve) continue;
      queued.push({
        effectId: definition.effectId,
        sourceInstanceId: source.instanceId,
        controllerId: source.controllerId,
        context: eventContext(event),
      });
    }
  }

  return queued;
}

function hasQueuedResolution(
  state: GameState,
  effectId: string,
  sourceInstanceId: string,
): boolean {
  return state.resolutionQueue.some(
    (resolution) =>
      resolution.effectId === effectId &&
      resolution.sourceInstanceId === sourceInstanceId,
  );
}

export function resolveEffectQueue(
  state: GameState,
  registry: RuntimeEffectRegistry,
): EffectResolutionResult {
  if (!isValidEffectState(state)) {
    return {
      ok: false,
      events: [],
      needsDeckOutCheck: false,
      error: "The simulator state is malformed.",
    };
  }
  let workingState: GameState;
  try {
    workingState = structuredClone(state) as GameState;
  } catch {
    return {
      ok: false,
      events: [],
      needsDeckOutCheck: false,
      error: "The simulator state is not serializable.",
    };
  }

  const result = resolveEffectQueueInPlace(workingState, registry);
  if (result.ok) Object.assign(state, workingState);
  return result;
}

function resolveEffectQueueInPlace(
  state: GameState,
  registry: RuntimeEffectRegistry,
): EffectResolutionResult {
  const validationError = validateResolutionState(state, registry);
  if (validationError !== null) {
    return {
      ok: false,
      events: [],
      needsDeckOutCheck: false,
      error: validationError,
    };
  }

  let queue = [...state.resolutionQueue];
  state.resolutionQueue = queue;
  const events: EffectEvent[] = [];
  let needsDeckOutCheck = false;
  if (state.pendingChoice?.type === "mulligan") {
    return { ok: true, events, needsDeckOutCheck };
  }
  state.pendingChoice = null;

  while (queue.length > 0 && state.winner === null) {
    let resolution = queue[0];
    const definition = registry.get(resolution.effectId);
    if (definition === undefined) {
      return {
        ok: false,
        events: [],
        needsDeckOutCheck: false,
        error: `Effect ${resolution.effectId} is not registered.`,
      };
    }

    const event = eventFromContext(resolution.context);
    const context: EffectContext = {
      state,
      sourceInstanceId: resolution.sourceInstanceId,
      controllerId: resolution.controllerId,
      event,
      registry,
      resolutionContext: resolution.context,
    };
    const storedOperations = getStoredOperations(resolution.context);
    if (storedOperations.status === "invalid") {
      return {
        ok: false,
        events: [],
        needsDeckOutCheck: false,
        error: `Effect ${resolution.effectId} has an invalid operation snapshot.`,
      };
    }
    let operations: readonly unknown[];
    if (storedOperations.status === "present") {
      operations = storedOperations.operations;
    } else {
      try {
        if (!definition.canResolve(context)) {
          queue.shift();
          state.resolutionQueue = queue;
          continue;
        }
        operations = definition.resolve(context);
      } catch {
        return {
          ok: false,
          events: [],
          needsDeckOutCheck: false,
          error: `Effect ${resolution.effectId} failed during validation.`,
        };
      }
    }
    if (!Array.isArray(operations) || !operations.every((operation) => isValidRuntimeOperation(operation, resolution.controllerId))) {
      return {
        ok: false,
        events: [],
        needsDeckOutCheck: false,
        error: `Effect ${resolution.effectId} returned invalid operations.`,
      };
    }
    const operationSnapshot =
      storedOperations.status === "present"
        ? resolution.context["resume:operations"]
        : serializeOperations(operations);
    if (typeof operationSnapshot !== "string") {
      return {
        ok: false,
        events: [],
        needsDeckOutCheck: false,
        error: `Effect ${resolution.effectId} returned non-serializable operations.`,
      };
    }
    if (storedOperations.status === "missing") {
      resolution = {
        ...resolution,
        context: {
          ...resolution.context,
          "resume:operations": operationSnapshot,
        },
      };
      queue[0] = resolution;
      state.resolutionQueue = queue;
    }
    const resumeOperationIndex = getResumeOperationIndex(resolution.context);
    if (resumeOperationIndex === null || resumeOperationIndex > operations.length) {
      return {
        ok: false,
        events: [],
        needsDeckOutCheck: false,
        error: `Effect ${resolution.effectId} returned an invalid continuation.`,
      };
    }
    markResolutionUsed(state, resolution, definition);

    let waiting = false;
    let repeat = false;
    let preempted = false;
    for (let operationIndex = resumeOperationIndex; operationIndex < operations.length; operationIndex += 1) {
      const rawOperation = operations[operationIndex];
      if (!isRecord(rawOperation) || typeof rawOperation.type !== "string") {
        return {
          ok: false,
          events: [],
          needsDeckOutCheck: false,
          error: `Effect ${resolution.effectId} returned an invalid operation.`,
        };
      }
      const authorization: EffectAuthorization = {
        controllerId: resolution.controllerId,
        sourceInstanceId: resolution.sourceInstanceId,
      };
      if (
        rawOperation.type === "choose-target" ||
        rawOperation.type === "choose-options"
      ) {
        const operation = rawOperation as Extract<
          EffectOperation,
          { type: "choose-target" | "choose-options" }
        >;
        if (!isValidChoiceOperation(operation, resolution.controllerId)) {
          return {
            ok: false,
            events: [],
            needsDeckOutCheck: false,
            error: `Effect ${resolution.effectId} returned an invalid choice.`,
          };
        }
        const options =
          operation.type === "choose-target"
            ? [
                ...selectEffectTargets(
                  state,
                  operation.playerId,
                  operation.filter,
                  registry,
                ),
              ]
            : [...operation.options];
        const choiceContext = { ...resolution.context };
        delete choiceContext["resume:operations"];
        if (options.length < operation.min) {
          continue;
        }
        if (options.length === 0 && operation.min === 0) {
          queue[0] = {
            ...resolution,
            context: {
              ...choiceContext,
              [`choice:${operation.choiceId}`]: [],
              "resume:operationIndex": operationIndex,
            },
          };
          repeat = true;
          break;
        }
        state.pendingChoice = operation.type === "choose-target"
          ? {
              type: "target",
              playerId: operation.playerId,
              choiceId: operation.choiceId,
              effectId: resolution.effectId,
              sourceInstanceId: resolution.sourceInstanceId,
              options,
              min: operation.min,
              max: Math.min(operation.max, options.length),
              filter: operation.filter,
            }
          : {
              type: "effect",
              playerId: operation.playerId,
              choiceId: operation.choiceId,
              effectId: resolution.effectId,
              sourceInstanceId: resolution.sourceInstanceId,
              options,
              min: operation.min,
              max: Math.min(operation.max, options.length),
            };
        queue[0] = {
          ...resolution,
          context: {
            ...choiceContext,
            "resume:actionWindow": state.actionWindow,
            "resume:priorityPlayer": state.priorityPlayer,
            "resume:operationIndex": operationIndex,
          },
        };
        state.actionWindow = "effect-choice";
        state.priorityPlayer = operation.playerId;
        waiting = true;
        break;
      }

      const operation = rawOperation as Exclude<
        EffectOperation,
        { type: "choose-target" | "choose-options" }
      >;
      if (!isValidEffectOperationShape(operation)) {
        return {
          ok: false,
          events: [],
          needsDeckOutCheck: false,
          error: `Effect ${resolution.effectId} returned an invalid operation.`,
        };
      }
      if (!isAuthorizedEffectOperation(state, operation, authorization)) {
        return {
          ok: false,
          events: [],
          needsDeckOutCheck: false,
          error: `Effect ${resolution.effectId} returned an unauthorized operation.`,
        };
      }
      const operationEvents = applyEffectOperation(
        state,
        operation,
        authorization,
      );
      events.push(...operationEvents);
      needsDeckOutCheck =
        needsDeckOutCheck ||
        operation.type === "draw" ||
        operation.type === "move" ||
        operation.type === "place" ||
        operation.type === "discard" ||
        operation.type === "retreat" ||
        operation.type === "prune" ||
        operation.type === "attach" ||
        operation.type === "detach";
      const derived: Resolution[] = [];
      for (const operationEvent of operationEvents) {
        const nextEvent = withSequence(
          operationEvent,
          (state.events.at(-1)?.sequence ?? 0) + events.length,
        );
        derived.push(...collectTriggeredEffects(state, nextEvent, registry));
      }
      if (derived.length > 0) {
        const continuation =
          operationIndex + 1 < operations.length
            ? [{
                ...resolution,
                context: {
                  ...resolution.context,
                  "resume:operationIndex": operationIndex + 1,
                  "resume:operations": operationSnapshot,
                },
              }]
            : [];
        queue = [...derived, ...continuation, ...queue.slice(1)];
        preempted = true;
        break;
      }
    }

    state.resolutionQueue = queue;
    if (waiting) break;
    if (preempted) continue;
    if (repeat) continue;
    queue.shift();
    state.resolutionQueue = queue;
  }

  state.resolutionQueue = queue;
  return { ok: true, events, needsDeckOutCheck };
}

export function applyEffectChoice(
  state: GameState,
  choiceId: string,
  value: string | boolean | readonly string[],
  registry?: RuntimeEffectRegistry,
): boolean {
  if (!isValidEffectState(state) || !isValidChoiceValue(value)) return false;
  const pending = state.pendingChoice;
  const resolution = state.resolutionQueue[0];
  if (
    pending === null ||
    (pending.type !== "effect" && pending.type !== "target") ||
    !isValidPendingChoice(state, pending, resolution, registry) ||
    pending.choiceId !== choiceId
  ) {
    return false;
  }
  if (
    resolution === undefined ||
    !isValidResolutionContext(resolution.context) ||
    !hasStoredEvent(state, eventFromContext(resolution.context)) ||
    !isOwnedEventPayload(state, eventFromContext(resolution.context))
  ) return false;

  const selected = normalizeChoiceValue(value, pending.options);
  if (selected === null) return false;
  if (selected.length < pending.min || selected.length > pending.max) return false;
  if (selected.some((option) => !pending.options.includes(option))) return false;
  if (new Set(selected).size !== selected.length) return false;

  const updatedContext = { ...resolution.context };
  delete updatedContext["resume:operations"];
  const updatedResolution: Resolution = {
    ...resolution,
    context: {
      ...updatedContext,
      [`choice:${choiceId}`]: selected,
    },
  };
  if (registry !== undefined && validateResolution(state, updatedResolution, registry) !== null) {
    return false;
  }
  state.resolutionQueue = [
    updatedResolution,
    ...state.resolutionQueue.slice(1),
  ];
  const resumeWindow = resolution.context["resume:actionWindow"];
  if (isActionWindow(resumeWindow)) state.actionWindow = resumeWindow;
  const resumePriority = resolution.context["resume:priorityPlayer"];
  if (resumePriority === "player" || resumePriority === "bot") {
    state.priorityPlayer = resumePriority;
  }
  state.pendingChoice = null;
  return true;
}

function isActionWindow(value: unknown): value is GameState["actionWindow"] {
  return (
    value === "mulligan" ||
    value === "action" ||
    value === "battle-rearrange" ||
    value === "battle-select-attacker" ||
    value === "battle-select-target" ||
    value === "battle-counter" ||
    value === "battle-confirmation" ||
    value === "counter-phase" ||
    value === "effect-choice" ||
    value === "game-over"
  );
}

function normalizeChoiceValue(
  value: string | boolean | readonly string[],
  options: readonly string[],
): readonly string[] | null {
  if (value === false) return [];
  if (value === true) return options.length === 0 ? [] : [options[0]];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return null;
  return [...value];
}

export function applyEffectOperation(
  state: GameState,
  operation: Exclude<EffectOperation, { type: "choose-target" | "choose-options" }>,
  authorization?: EffectAuthorization,
): readonly EffectEvent[] {
  if (!isValidEffectState(state) || !isValidEffectOperationShape(operation)) {
    return [];
  }
  const resolvedAuthorization = authorization ?? defaultAuthorization(state, operation);
  if (
    resolvedAuthorization === null ||
    !isAuthorizedEffectOperation(state, operation, resolvedAuthorization)
  ) {
    return [];
  }
  switch (operation.type) {
    case "draw":
      return drawCards(state, operation.playerId, operation.count);
    case "discard":
      return moveInstance(state, operation.instanceId, "retreat", "discarded");
    case "move":
      return moveInstance(state, operation.instanceId, operation.destination, "moved");
    case "place":
      return moveInstance(state, operation.instanceId, operation.destination, "moved");
    case "cover":
      return coverInstance(state, operation.instanceId);
    case "retreat":
      return moveInstance(state, operation.instanceId, "retreat", "retreated");
    case "prune":
      return pruneInstance(state, operation.instanceId);
    case "attach":
      return attachInstance(state, operation.instanceId, operation.targetInstanceId);
    case "detach":
      return detachInstance(state, operation.instanceId, operation.destination ?? "retreat");
    case "modify":
      return modifyInstance(state, operation.instanceId, operation.attribute, operation.amount);
    case "set-turn-state":
      return setTurnState(state, operation.instanceId, operation.field, operation.value);
  }
}

function drawCards(
  state: GameState,
  playerId: PlayerId,
  count: number,
): EffectEvent[] {
  const player = state.players[playerId];
  const events: EffectEvent[] = [];
  const deck = [...player.deck];
  const hand = [...player.hand];
  const actualCount = Math.max(0, Math.floor(count));
  let drawnCount = 0;
  for (let index = 0; index < actualCount; index += 1) {
    const instanceId = deck.shift();
    if (instanceId === undefined) break;
    hand.push(instanceId);
    syncAttachedTreeZone(state, instanceId, "hand");
    drawnCount += 1;
  }
  player.deck = deck;
  player.hand = hand;
  events.push({
    type: "effect-draw",
    visibility: "private",
    playerId,
    data: { count: drawnCount },
  });
  return events;
}

function moveInstance(
  state: GameState,
  instanceId: string,
  destination: Zone,
  eventType: "moved" | "discarded" | "retreated",
): EffectEvent[] {
  const instance = state.instances[instanceId];
  if (
    instance === undefined ||
    !isEffectDestination(destination) ||
    getInstanceMembership(state, instanceId) === null ||
    !hasEffectDestinationCapacity(state, instanceId, destination)
  ) return [];
  const from = instance.zone;
  if (!moveCardTreeToZone(state, instanceId, destination)) return [];
  const events: EffectEvent[] = [
    {
      type: `effect-${eventType}`,
      visibility: "public",
      playerId: instance.controllerId,
      data: { instanceId, from, destination },
    },
  ];
  if (destination === "retreat") {
    events.push({
      type: "entered-retreat",
      visibility: "public",
      playerId: instance.controllerId,
      data: { instanceId, from },
    });
  }
  if (destination === "void") {
    events.push({
      type: "entered-void",
      visibility: "public",
      playerId: instance.controllerId,
      data: { instanceId, from },
    });
  }
  return events;
}

export function moveCardTreeToZone(
  state: GameState,
  instanceId: string,
  destination: Zone,
): boolean {
  const instance = state.instances[instanceId];
  if (
    instance === undefined ||
    !isEffectDestination(destination) ||
    getInstanceMembership(state, instanceId) === null ||
    !hasEffectDestinationCapacity(state, instanceId, destination)
  ) return false;
  if (instance.attachedTo !== null) {
    detachFromTarget(state, instanceId, instance.attachedTo);
  }
  removeFromAreas(state, instanceId);
  if (!addToZone(state, instanceId, destination)) return false;
  moveAttachedDescendants(state, instanceId, destination);
  return true;
}

export function syncAttachedTreeZone(
  state: GameState,
  instanceId: string,
  destination: Zone,
): void {
  const instance = state.instances[instanceId];
  if (instance === undefined) return;
  state.instances[instanceId] = {
    ...instance,
    zone: destination,
    faceDown: destination === "deck" || destination === "base" || destination === "rushPointDeck",
    covered: false,
  };
  moveAttachedDescendants(state, instanceId, destination);
}

function pruneInstance(state: GameState, instanceId: string): EffectEvent[] {
  const instance = state.instances[instanceId];
  if (instance === undefined) return [];
  const attached = [...instance.attachmentIds];
  const events: EffectEvent[] = [];
  for (const attachmentId of attached) {
    events.push(...pruneInstance(state, attachmentId));
  }
  state.instances[instanceId] = { ...state.instances[instanceId], attachmentIds: [] };
  events.push(...moveInstance(state, instanceId, "void", "moved"));
  return events;
}

function attachInstance(
  state: GameState,
  instanceId: string,
  targetInstanceId: string,
): EffectEvent[] {
  const instance = state.instances[instanceId];
  const target = state.instances[targetInstanceId];
  if (instance === undefined || target === undefined || instanceId === targetInstanceId) {
    return [];
  }
  if (
    getInstanceMembership(state, instanceId) === null ||
    getInstanceMembership(state, targetInstanceId) === null ||
    target.attachedTo !== null
  ) {
    return [];
  }
  if (instance.attachedTo !== null) {
    detachFromTarget(state, instanceId, instance.attachedTo);
  }
  removeFromAreas(state, instanceId);
  state.instances[instanceId] = {
    ...state.instances[instanceId],
    zone: target.zone,
    faceDown: target.faceDown,
    attachedTo: targetInstanceId,
  };
  state.instances[targetInstanceId] = {
    ...target,
    attachmentIds: target.attachmentIds.includes(instanceId)
      ? [...target.attachmentIds]
      : [...target.attachmentIds, instanceId],
  };
  moveAttachedDescendants(state, instanceId, target.zone);
  return [
    {
      type: "effect-attached",
      visibility: "public",
      playerId: instance.controllerId,
      data: { instanceId, targetInstanceId },
    },
  ];
}

function detachInstance(
  state: GameState,
  instanceId: string,
  destination: Zone,
): EffectEvent[] {
  const instance = state.instances[instanceId];
  if (instance === undefined || instance.attachedTo === null) return [];
  return moveInstance(state, instanceId, destination, "moved");
}

function moveAttachedDescendants(
  state: GameState,
  instanceId: string,
  destination: Zone,
): void {
  const instance = state.instances[instanceId];
  if (instance === undefined) return;
  for (const attachmentId of instance.attachmentIds) {
    const attachment = state.instances[attachmentId];
    if (attachment === undefined) continue;
    state.instances[attachmentId] = {
      ...attachment,
      zone: destination,
      faceDown: destination === "deck" || destination === "base" || destination === "rushPointDeck",
      covered: false,
    };
    moveAttachedDescendants(state, attachmentId, destination);
  }
}

function detachFromTarget(
  state: GameState,
  instanceId: string,
  targetInstanceId: string,
): void {
  const target = state.instances[targetInstanceId];
  if (target === undefined) return;
  state.instances[targetInstanceId] = {
    ...target,
    attachmentIds: target.attachmentIds.filter((id) => id !== instanceId),
  };
  state.instances[instanceId] = {
    ...state.instances[instanceId],
    attachedTo: null,
  };
}

function modifyInstance(
  state: GameState,
  instanceId: string,
  attribute: "level" | "range" | "power",
  amount: number,
): EffectEvent[] {
  const instance = state.instances[instanceId];
  if (instance === undefined || !Number.isInteger(amount)) return [];
  state.instances[instanceId] = {
    ...instance,
    modifiers: [
      ...instance.modifiers,
      { attribute, amount, expiresAtTurn: state.turnNumber },
    ],
  };
  return [
    {
      type: "effect-modified",
      visibility: "public",
      playerId: instance.controllerId,
      data: { instanceId, attribute, amount },
    },
  ];
}

function setTurnState(
  state: GameState,
  instanceId: string,
  field: "additionalAttacks" | "attackCharactersOnly",
  value: number | boolean,
): EffectEvent[] {
  const instance = state.instances[instanceId];
  if (instance === undefined) return [];
  if (field === "additionalAttacks" && typeof value !== "number") return [];
  if (field === "attackCharactersOnly" && typeof value !== "boolean") return [];
  state.instances[instanceId] = {
    ...instance,
    turnState: { ...instance.turnState, [field]: value },
  };
  return [];
}

function coverInstance(state: GameState, instanceId: string): EffectEvent[] {
  const instance = state.instances[instanceId];
  if (
    instance === undefined ||
    instance.zone !== "base" ||
    instance.attachedTo !== null ||
    getInstanceMembership(state, instanceId) === null
  ) return [];
  state.instances[instanceId] = { ...instance, faceDown: true, covered: true };
  return [
    {
      type: "effect-covered",
      visibility: "public",
      playerId: instance.controllerId,
      data: { instanceId },
    },
  ];
}

function removeFromAreas(state: GameState, instanceId: string): void {
  for (const playerId of ["player", "bot"] as const) {
    const player = state.players[playerId];
    player.deck = player.deck.filter((id) => id !== instanceId);
    player.hand = player.hand.filter((id) => id !== instanceId);
    player.base = player.base.filter((id) => id !== instanceId);
    player.timeline = player.timeline.filter((id) => id !== instanceId);
    player.retreat = player.retreat.filter((id) => id !== instanceId);
    player.void = player.void.filter((id) => id !== instanceId);
    player.rushPointDeck = player.rushPointDeck.filter((id) => id !== instanceId);
    for (const slot of ["front", "wingLeft", "wingRight", "back"] as const) {
      if (player.battle[slot] === instanceId) player.battle[slot] = null;
    }
  }
}

function addToZone(state: GameState, instanceId: string, destination: Zone): boolean {
  const instance = state.instances[instanceId];
  if (instance === undefined) return false;
  const player = state.players[instance.controllerId];
  if (destination === "front" || destination === "wingLeft" || destination === "wingRight" || destination === "back") {
    if (player.battle[destination] !== null) return false;
    player.battle[destination] = instanceId;
  } else if (destination === "deck") {
    player.deck = [...player.deck, instanceId];
  } else if (destination === "hand") {
    player.hand = [...player.hand, instanceId];
  } else if (destination === "base") {
    player.base = [...player.base, instanceId];
  } else if (destination === "timeline") {
    player.timeline = [...player.timeline, instanceId];
  } else if (destination === "retreat") {
    player.retreat = [...player.retreat, instanceId];
  } else if (destination === "void") {
    player.void = [...player.void, instanceId];
  } else if (destination === "rushPointDeck") {
    player.rushPointDeck = [...player.rushPointDeck, instanceId];
  }

  state.instances[instanceId] = {
    ...state.instances[instanceId],
    zone: destination,
    covered: false,
    faceDown:
      destination === "deck" ||
      destination === "base" ||
      destination === "rushPointDeck",
  };
  return true;
}

function isSourceAtLocation(
  instance: CardInstance,
  locations: readonly string[],
): boolean {
  return locations.some((location) => {
    if (location === "FIELD") {
      return isFieldZone(instance.zone) && !instance.faceDown;
    }
    if (location === "BATTLE") return !instance.faceDown && isBattleZone(instance.zone);
    if (location === "FRONT") return !instance.faceDown && instance.zone === "front";
    if (location === "WING") {
      return !instance.faceDown && (instance.zone === "wingLeft" || instance.zone === "wingRight");
    }
    if (location === "BACK") return !instance.faceDown && instance.zone === "back";
    return instance.zone.toUpperCase() === location;
  });
}

function isBattleZone(zone: Zone): zone is BattleSlot {
  return zone === "front" || zone === "wingLeft" || zone === "wingRight" || zone === "back";
}

function isFieldZone(zone: Zone): boolean {
  return isBattleZone(zone) || zone === "base";
}

type InstanceMembership = {
  playerId: PlayerId;
  zone: Zone;
  attached: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidPlayerId(value: unknown): value is PlayerId {
  return value === "player" || value === "bot";
}

function isValidZone(value: unknown): value is Zone {
  return (
    value === "deck" ||
    value === "hand" ||
    value === "front" ||
    value === "wingLeft" ||
    value === "wingRight" ||
    value === "back" ||
    value === "base" ||
    value === "timeline" ||
    value === "retreat" ||
    value === "void" ||
    value === "rushPointDeck"
  );
}

function isEffectDestination(value: unknown): value is Zone {
  return isValidZone(value) && value !== "rushPointDeck";
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEffectContextValue(value: unknown): value is string | number | boolean | readonly string[] {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    isFiniteInteger(value) ||
    isStringArray(value)
  );
}

function isValidEffectState(state: GameState): boolean {
  if (
    !isRecord(state) ||
    !isRecord(state.players) ||
    !isRecord(state.instances) ||
    !isValidPlayerId(state.firstPlayer) ||
    !isValidPlayerId(state.activePlayer) ||
    !isValidPlayerId(state.priorityPlayer) ||
    !isValidPhase(state.phase) ||
    !isValidActionWindow(state.actionWindow) ||
    (state.pendingEndPhase !== undefined && typeof state.pendingEndPhase !== "boolean") ||
    !Array.isArray(state.events) ||
    !state.events.every(isValidGameEvent) ||
    (state.winner !== null && !isValidPlayerId(state.winner))
  ) {
    return false;
  }
  if (
    !Array.isArray(state.resolutionQueue) ||
    !isFiniteInteger(state.actionCallsThisTurn) ||
    state.actionCallsThisTurn < 0
  ) return false;
  if (!isFiniteInteger(state.turnNumber) || state.turnNumber < 1) return false;
  for (const playerId of ["player", "bot"] as const) {
    if (!isValidPlayerState(state.players[playerId])) return false;
  }
  for (const [instanceId, value] of Object.entries(state.instances)) {
    if (!isValidCardInstance(value, instanceId)) return false;
  }
  if (!hasValidAreaReferences(state) || !hasValidAttachmentGraph(state)) return false;
  return Object.keys(state.instances).every(
    (instanceId) => getInstanceMembership(state, instanceId) !== null,
  );
}

function hasValidAreaReferences(state: GameState): boolean {
  for (const playerId of ["player", "bot"] as const) {
    const player = state.players[playerId];
    const areas = [
      ...player.deck,
      ...player.hand,
      ...player.base,
      ...player.timeline,
      ...player.retreat,
      ...player.void,
      ...player.rushPointDeck,
      ...Object.values(player.battle).filter(
        (instanceId): instanceId is string => instanceId !== null,
      ),
    ];
    if (areas.some((instanceId) => state.instances[instanceId] === undefined)) {
      return false;
    }
  }
  return true;
}

function isValidPhase(value: unknown): value is GameState["phase"] {
  return ["mulligan", "start", "draw", "action", "battle", "counter", "end", "game-over"].includes(
    value as string,
  );
}

function isValidActionWindow(value: unknown): value is GameState["actionWindow"] {
  return [
    "mulligan",
    "action",
    "battle-rearrange",
    "battle-select-attacker",
    "battle-select-target",
    "battle-counter",
    "battle-confirmation",
    "counter-phase",
    "effect-choice",
    "game-over",
  ].includes(value as string);
}

function hasValidAttachmentGraph(state: GameState): boolean {
  for (const instance of Object.values(state.instances)) {
    if (new Set(instance.attachmentIds).size !== instance.attachmentIds.length) {
      return false;
    }
    for (const attachmentId of instance.attachmentIds) {
      const attachment = state.instances[attachmentId];
      if (
        attachment === undefined ||
        attachment.attachedTo !== instance.instanceId ||
        attachment.controllerId !== instance.controllerId ||
        attachment.zone !== instance.zone
      ) {
        return false;
      }
    }

    const seen = new Set<string>();
    let currentId: string | null = instance.instanceId;
    while (currentId !== null) {
      if (seen.has(currentId)) return false;
      seen.add(currentId);
      currentId = state.instances[currentId]?.attachedTo ?? null;
    }
  }
  return true;
}

function isValidPlayerState(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.battle)) return false;
  const battle = value.battle;
  const areas = [
    value.deck,
    value.hand,
    value.base,
    value.timeline,
    value.retreat,
    value.void,
    value.rushPointDeck,
  ];
  if (!areas.every(isStringArray)) return false;
  return ["front", "wingLeft", "wingRight", "back"].every((slot) => {
    const valueAtSlot = battle[slot];
    return valueAtSlot === null || typeof valueAtSlot === "string";
  });
}

function isValidCardInstance(value: unknown, instanceId: string): boolean {
  if (!isRecord(value)) return false;
  if (
    value.instanceId !== instanceId ||
    typeof value.cardCode !== "string" ||
    !isValidPlayerId(value.ownerId) ||
    !isValidPlayerId(value.controllerId) ||
    !isValidZone(value.zone) ||
    typeof value.faceDown !== "boolean" ||
    typeof value.covered !== "boolean" ||
    (value.attachedTo !== null && typeof value.attachedTo !== "string") ||
    !isStringArray(value.attachmentIds) ||
    !Array.isArray(value.modifiers) ||
    !isRecord(value.turnState) ||
    typeof value.turnState.attacked !== "boolean" ||
    typeof value.turnState.moved !== "boolean" ||
    typeof value.turnState.placed !== "boolean" ||
    !isStringArray(value.turnState.usedEffectIds) ||
    (value.turnState.additionalAttacks !== undefined &&
      (!isFiniteInteger(value.turnState.additionalAttacks) || value.turnState.additionalAttacks < 0)) ||
    (value.turnState.attackCharactersOnly !== undefined &&
      typeof value.turnState.attackCharactersOnly !== "boolean") ||
    (value.turnState.currentAttackIsExtra !== undefined &&
      typeof value.turnState.currentAttackIsExtra !== "boolean")
  ) {
    return false;
  }
  if (
    value.originalLevel !== undefined && !isFiniteInteger(value.originalLevel) ||
    value.originalPower !== undefined && !isFiniteInteger(value.originalPower) ||
    value.originalRange !== undefined && !isFiniteInteger(value.originalRange)
  ) {
    return false;
  }
  return value.modifiers.every((modifier) => {
    if (!isRecord(modifier)) return false;
    return (
      modifier.attribute === "level" ||
      modifier.attribute === "power" ||
      modifier.attribute === "range"
    ) && isFiniteInteger(modifier.amount) &&
      (modifier.expiresAtTurn === null || isFiniteInteger(modifier.expiresAtTurn));
  });
}

function getInstanceMembership(
  state: GameState,
  instanceId: string,
): InstanceMembership | null {
  const instance = state.instances[instanceId];
  if (instance === undefined) return null;
  const memberships: Array<{ playerId: PlayerId; zone: Zone }> = [];
  for (const playerId of ["player", "bot"] as const) {
    const player = state.players[playerId];
    const areas: Array<{ zone: Zone; ids: readonly string[] }> = [
      { zone: "deck", ids: player.deck },
      { zone: "hand", ids: player.hand },
      { zone: "base", ids: player.base },
      { zone: "timeline", ids: player.timeline },
      { zone: "retreat", ids: player.retreat },
      { zone: "void", ids: player.void },
      { zone: "rushPointDeck", ids: player.rushPointDeck },
    ];
    for (const area of areas) {
      if (area.ids.includes(instanceId)) memberships.push({ playerId, zone: area.zone });
    }
    for (const slot of ["front", "wingLeft", "wingRight", "back"] as const) {
      if (player.battle[slot] === instanceId) memberships.push({ playerId, zone: slot });
    }
  }

  if (instance.attachedTo !== null) {
    const parent = state.instances[instance.attachedTo];
    if (
      parent === undefined ||
      !parent.attachmentIds.includes(instanceId) ||
      parent.controllerId !== instance.controllerId ||
      parent.zone !== instance.zone ||
      memberships.length !== 0
    ) {
      return null;
    }
    return { playerId: instance.controllerId, zone: instance.zone, attached: true };
  }
  if (
    memberships.length !== 1 ||
    memberships[0]?.playerId !== instance.controllerId ||
    memberships[0]?.zone !== instance.zone
  ) {
    return null;
  }
  return { ...memberships[0], attached: false };
}

function isValidGameEvent(value: unknown): value is GameEvent {
  if (!isRecord(value) || !isFiniteInteger(value.sequence) || value.sequence < 0) return false;
  if (typeof value.type !== "string" || value.type.length === 0) return false;
  if (value.visibility !== "public" && value.visibility !== "private") return false;
  if (value.playerId !== null && !isValidPlayerId(value.playerId)) return false;
  if (!isRecord(value.data)) return false;
  return Object.values(value.data).every(isEffectContextValue);
}

function isValidResolutionContext(value: unknown): value is Readonly<
  Record<string, string | number | boolean | readonly string[]>
> {
  if (!isRecord(value)) return false;
  if (
    typeof value["event:type"] !== "string" ||
    !isFiniteInteger(value["event:sequence"]) ||
    (value["event:visibility"] !== "public" && value["event:visibility"] !== "private") ||
    (value["event:playerId"] !== "" && !isValidPlayerId(value["event:playerId"]))
  ) {
    return false;
  }
  return Object.entries(value).every(([key, entry]) => {
    if (key.startsWith("event:data:")) return key.length > "event:data:".length && isEffectContextValue(entry);
    if (key === "event:type" || key === "event:visibility") return typeof entry === "string";
    if (key === "event:sequence") return isFiniteInteger(entry);
    if (key === "event:playerId") return entry === "" || isValidPlayerId(entry);
    if (key.startsWith("choice:")) return key.length > "choice:".length && isStringArray(entry);
    if (key === "resume:actionWindow") return isActionWindow(entry);
    if (key === "resume:priorityPlayer") return isValidPlayerId(entry);
    if (key === "resume:operationIndex") return isFiniteInteger(entry) && entry >= 0;
    if (key === "resume:operations") return typeof entry === "string";
    if (key === "action:phase") return isValidPhase(entry);
    if (key === "action:window") return isActionWindow(entry);
    if (key === "action:counter") return typeof entry === "boolean";
    return false;
  });
}

function getResumeOperationIndex(
  context: Readonly<Record<string, string | number | boolean | readonly string[]>>,
): number | null {
  const value = context["resume:operationIndex"];
  return value === undefined
    ? 0
    : isFiniteInteger(value) && value >= 0
      ? value
      : null;
}

type StoredOperations =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "present"; operations: readonly unknown[] };

function getStoredOperations(
  context: Readonly<Record<string, string | number | boolean | readonly string[]>>,
): StoredOperations {
  const serialized = context["resume:operations"];
  if (serialized === undefined) return { status: "missing" };
  if (typeof serialized !== "string") return { status: "invalid" };
  try {
    const operations: unknown = JSON.parse(serialized);
    return Array.isArray(operations)
      ? { status: "present", operations }
      : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

function serializeOperations(operations: readonly unknown[]): string | null {
  try {
    const serialized = JSON.stringify(operations);
    return typeof serialized === "string" ? serialized : null;
  } catch {
    return null;
  }
}

function isValidRuntimeOperation(value: unknown, controllerId: PlayerId): boolean {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "choose-target" || value.type === "choose-options") {
    return isValidChoiceOperation(
      value as Extract<EffectOperation, { type: "choose-target" | "choose-options" }>,
      controllerId,
    );
  }
  return isValidEffectOperationShape(value);
}

function markResolutionUsed(
  state: GameState,
  resolution: Resolution,
  definition: RuntimeEffectDefinition,
): void {
  if (!definition.metadata.oncePerTurn) return;
  const source = state.instances[resolution.sourceInstanceId];
  if (
    source === undefined ||
    source.turnState.usedEffectIds.includes(definition.effectId)
  ) return;
  state.instances[resolution.sourceInstanceId] = {
    ...source,
    turnState: {
      ...source.turnState,
      usedEffectIds: [...source.turnState.usedEffectIds, definition.effectId],
    },
  };
}

function isValidParsedAbility(value: unknown): value is ParsedAbility {
  if (!isRecord(value)) return false;
  return (
    typeof value.effectId === "string" && value.effectId.length > 0 &&
    (value.kind === "trigger" || value.kind === "auto" || value.kind === "activated") &&
    typeof value.counter === "boolean" &&
    isStringArray(value.locations) && value.locations.length > 0 &&
    typeof value.oncePerTurn === "boolean" &&
    typeof value.body === "string"
  );
}

function validateResolutionState(
  state: GameState,
  registry: RuntimeEffectRegistry,
): string | null {
  if (!isValidEffectState(state)) return "The simulator state is malformed.";
  for (const resolution of state.resolutionQueue) {
    const error = validateResolution(state, resolution, registry);
    if (error !== null) return error;
  }
  if (state.pendingChoice === null) return null;
  if (state.pendingChoice.type === "mulligan") {
    return isValidMulliganChoice(state, state.pendingChoice)
      ? null
      : "The pending mulligan is malformed.";
  }
  const resolution = state.resolutionQueue[0];
  return isValidPendingChoice(state, state.pendingChoice, resolution, registry)
    ? null
    : "The pending effect choice is malformed.";
}

function validateResolution(
  state: GameState,
  value: unknown,
  registry: RuntimeEffectRegistry,
): string | null {
  if (!isRecord(value)) return "The resolution queue contains a malformed entry.";
  if (
    typeof value.effectId !== "string" ||
    value.effectId.length === 0 ||
    typeof value.sourceInstanceId !== "string" ||
    value.sourceInstanceId.length === 0 ||
    !isValidPlayerId(value.controllerId) ||
    !isValidResolutionContext(value.context)
  ) {
    return "The resolution queue contains an invalid resolution.";
  }
  const source = state.instances[value.sourceInstanceId];
  const definition = registry.get(value.effectId);
  if (
    source === undefined ||
    getInstanceMembership(state, value.sourceInstanceId) === null ||
    source.controllerId !== value.controllerId ||
    definition === undefined ||
    !isValidParsedAbility(definition.metadata) ||
    definition.metadata.effectId !== value.effectId ||
    !value.effectId.startsWith(`${source.cardCode}#`) ||
    typeof definition.canResolve !== "function" ||
    typeof definition.resolve !== "function"
  ) {
    return "The resolution source, controller, or effect definition is invalid.";
  }
  if (!isValidGameEvent(eventFromContext(value.context))) {
    return "The resolution event context is malformed.";
  }
  const event = eventFromContext(value.context);
  const storedEvent = state.events.find((candidate) => candidate.sequence === event.sequence);
  if (storedEvent === undefined || !eventsMatch(storedEvent, event)) {
    return "The resolution event context does not match a stored event.";
  }
  const resolution = value as unknown as Resolution;
  if (!isOwnedEventPayload(state, event)) {
    return "The resolution event payload is not owned by its player.";
  }
  const storedOperations = getStoredOperations(resolution.context);
  if (storedOperations.status === "invalid") {
    return "The resolution operation snapshot is malformed.";
  }
  let operations: readonly unknown[];
  if (storedOperations.status === "present") {
    operations = storedOperations.operations;
  } else {
    try {
      operations = definition.resolve({
        state,
        sourceInstanceId: resolution.sourceInstanceId,
        controllerId: resolution.controllerId,
        event,
        registry,
        resolutionContext: resolution.context,
      });
    } catch {
      return "The resolution effect failed during validation.";
    }
  }
  const resumeOperationIndex = getResumeOperationIndex(resolution.context);
  if (
    resumeOperationIndex === null ||
    !Array.isArray(operations) ||
    resumeOperationIndex > operations.length ||
    !operations.every((operation) => isValidRuntimeOperation(operation, resolution.controllerId))
  ) {
    return "The resolution continuation is malformed.";
  }
  if (!isValidChoiceContext(state, resolution, definition, registry)) {
    return "The resolution contains an unknown choice key.";
  }
  if (definition.metadata.kind === "activated") {
    if (!isValidActivatedResolution(state, resolution, definition.metadata)) {
      return "The activated effect is outside its action context.";
    }
  } else if (
    "action:phase" in value.context ||
    "action:window" in value.context ||
    "action:counter" in value.context
  ) {
    return "The non-activated effect contains action provenance.";
  }
  return null;
}

function isValidChoiceContext(
  state: GameState,
  resolution: Resolution,
  definition: RuntimeEffectDefinition,
  registry: RuntimeEffectRegistry,
): boolean {
  if (!isRecord(resolution.context)) return false;
  const context = resolution.context;
  for (const key of Object.keys(context).filter((candidate) => candidate.startsWith("choice:"))) {
    const choiceId = key.slice("choice:".length);
    const operation = getChoiceOperation(
      state,
      resolution,
      definition,
      registry,
      choiceId,
    );
    if (
      operation === null ||
      !isValidChoiceSelection(
        state,
        resolution.controllerId,
        operation,
        context[key],
        registry,
      )
    ) return false;
  }
  return true;
}

function getChoiceOperation(
  state: GameState,
  resolution: Resolution,
  definition: RuntimeEffectDefinition,
  registry: RuntimeEffectRegistry,
  choiceId: string,
): Extract<EffectOperation, { type: "choose-target" | "choose-options" }> | null {
  const withoutChoice = { ...resolution.context };
  delete withoutChoice[`choice:${choiceId}`];
  const storedOperations = getStoredOperations(withoutChoice);
  if (storedOperations.status === "invalid") return null;
  let operations: readonly unknown[];
  if (storedOperations.status === "present") {
    operations = storedOperations.operations;
  } else {
    try {
      operations = definition.resolve({
        state,
        sourceInstanceId: resolution.sourceInstanceId,
        controllerId: resolution.controllerId,
        event: eventFromContext(withoutChoice),
        registry,
        resolutionContext: withoutChoice,
      });
    } catch {
      return null;
    }
  }
  const operation = operations.find(
    (candidate) =>
      isRecord(candidate) &&
      (candidate.type === "choose-target" || candidate.type === "choose-options") &&
      candidate.choiceId === choiceId,
  );
  return isRecord(operation) &&
    (operation.type === "choose-target" || operation.type === "choose-options") &&
    isValidChoiceOperation(
      operation as Extract<EffectOperation, { type: "choose-target" | "choose-options" }>,
      resolution.controllerId,
    )
    ? operation as Extract<EffectOperation, { type: "choose-target" | "choose-options" }>
    : null;
}

function isValidChoiceSelection(
  state: GameState,
  controllerId: PlayerId,
  operation: Extract<EffectOperation, { type: "choose-target" | "choose-options" }>,
  value: unknown,
  registry: RuntimeEffectRegistry,
): boolean {
  if (!isStringArray(value)) return false;
  const options = operation.type === "choose-target"
    ? selectEffectTargets(state, controllerId, operation.filter, registry)
    : operation.options;
  return (
    value.length >= operation.min &&
    value.length <= Math.min(operation.max, options.length) &&
    new Set(value).size === value.length &&
    value.every((option) => options.includes(option))
  );
}

function isValidActivatedResolution(
  state: GameState,
  resolution: Resolution,
  metadata: ParsedAbility,
): boolean {
  const context = resolution.context;
  const event = eventFromContext(context);
  return (
    event.type === "activate-effect" &&
    event.playerId === resolution.controllerId &&
    event.data.effectId === resolution.effectId &&
    event.data.sourceInstanceId === resolution.sourceInstanceId &&
    event.data.phase === context["action:phase"] &&
    event.data.window === context["action:window"] &&
    event.data.turnNumber === state.turnNumber &&
    event.data.counter === context["action:counter"] &&
    context["action:phase"] === state.phase &&
    context["action:window"] !== "effect-choice" &&
    context["action:counter"] === metadata.counter &&
    isLegalActivatedWindow(
      context["action:phase"],
      context["action:window"],
      metadata.counter,
    ) &&
    (state.actionWindow === context["action:window"] ||
      (state.actionWindow === "effect-choice" &&
        context["resume:actionWindow"] === context["action:window"]))
  );
}

function isLegalActivatedWindow(
  phase: unknown,
  window: unknown,
  counter: boolean,
): boolean {
  if (counter) {
    return (
      (phase === "battle" && window === "battle-counter") ||
      (phase === "counter" && window === "counter-phase")
    );
  }
  return (
    (phase === "action" && window === "action") ||
    (phase === "battle" && window === "battle-select-attacker")
  );
}

function isOwnedEventPayload(state: GameState, event: GameEvent): boolean {
  if (event.playerId === null) return true;
  const owns = (instanceId: unknown): boolean =>
    typeof instanceId === "string" &&
    state.instances[instanceId]?.controllerId === event.playerId &&
    getInstanceMembership(state, instanceId) !== null;
  const ownsMany = (value: unknown): boolean =>
    isStringArray(value) && value.every((instanceId) => owns(instanceId));

  switch (event.type) {
    case "called":
    case "entered-retreat":
    case "entered-void":
    case "effect-discarded":
    case "effect-moved":
    case "effect-retreated":
    case "effect-attached":
    case "effect-covered":
    case "effect-modified":
      return owns(event.data.instanceId);
    case "attack-declared":
      return owns(event.data.attackerId);
    case "activate-effect":
      return owns(event.data.sourceInstanceId);
    case "turn-ended":
      return ownsMany(event.data.nonAttackingInstanceIds);
    case "weakness-rush-point":
      return owns(event.data.rushPointId);
    default:
      return true;
  }
}

function hasStoredEvent(state: GameState, event: GameEvent): boolean {
  const stored = state.events.find((candidate) => candidate.sequence === event.sequence);
  return stored !== undefined && eventsMatch(stored, event);
}

function eventsMatch(left: GameEvent, right: GameEvent): boolean {
  if (
    left.sequence !== right.sequence ||
    left.type !== right.type ||
    left.visibility !== right.visibility ||
    left.playerId !== right.playerId
  ) return false;
  const leftKeys = Object.keys(left.data);
  const rightKeys = Object.keys(right.data);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => valuesMatch(left.data[key], right.data[key]))
  );
}

function valuesMatch(
  left: string | number | boolean | readonly string[] | undefined,
  right: string | number | boolean | readonly string[] | undefined,
): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => value === right[index]);
  }
  return left === right;
}

function isValidMulliganChoice(
  state: GameState,
  value: unknown,
): boolean {
  if (!isRecord(value) || value.type !== "mulligan" || !isValidPlayerId(value.playerId)) {
    return false;
  }
  const playerId = value.playerId;
  if (!isStringArray(value.instanceIds)) return false;
  return value.instanceIds.every(
    (instanceId) =>
      state.players[playerId].hand.includes(instanceId) &&
      getInstanceMembership(state, instanceId)?.zone === "hand",
  );
}

function isValidPendingChoice(
  state: GameState,
  value: unknown,
  resolution: unknown,
  registry?: RuntimeEffectRegistry,
): boolean {
  if (!isRecord(value) || (value.type !== "effect" && value.type !== "target")) return false;
  if (
    !isRecord(resolution) ||
    !isValidResolutionContext(resolution.context)
  ) return false;
  const resolutionContext = resolution.context;
  if (getStoredOperations(resolutionContext).status === "invalid") return false;
  const resumeOperationIndex = getResumeOperationIndex(resolutionContext);
  if (
    resumeOperationIndex === null ||
    !isActionWindow(resolutionContext["resume:actionWindow"]) ||
    !isValidPlayerId(resolutionContext["resume:priorityPlayer"])
  ) return false;
  if (
    !isValidPlayerId(value.playerId) ||
    typeof value.choiceId !== "string" ||
    value.choiceId.length === 0 ||
    typeof value.effectId !== "string" ||
    typeof value.sourceInstanceId !== "string" ||
    !isStringArray(value.options) ||
    !isFiniteInteger(value.min) ||
    !isFiniteInteger(value.max) ||
    value.min < 0 ||
    value.max < value.min ||
    value.max > value.options.length ||
    new Set(value.options).size !== value.options.length ||
    resolution.effectId !== value.effectId ||
    resolution.sourceInstanceId !== value.sourceInstanceId ||
    resolution.controllerId !== value.playerId ||
    state.actionWindow !== "effect-choice" ||
    state.priorityPlayer !== value.playerId
  ) {
    return false;
  }
  const typedResolution = resolution as unknown as Resolution;
  if (resolutionContext[`choice:${value.choiceId}`] !== undefined) return false;
  const source = state.instances[value.sourceInstanceId];
  if (
    source === undefined ||
    source.controllerId !== value.playerId ||
    getInstanceMembership(state, value.sourceInstanceId) === null ||
    !isValidResolutionContext(resolution.context) ||
    !isOwnedEventPayload(state, eventFromContext(resolution.context))
  ) return false;
  const definition = registry?.get(value.effectId);
  if (value.type === "target" && !isValidEffectTargetFilter(value.filter)) return false;
  if (registry === undefined) {
    if (value.type !== "target") return true;
    const filter = value.filter;
    if (!isValidEffectTargetFilter(filter)) return false;
    const currentOptions = selectEffectTargets(state, value.playerId, filter);
    return (
      value.options.length === currentOptions.length &&
      value.options.every((option, index) => option === currentOptions[index])
    );
  }
  if (definition === undefined) return false;
  const operation = getChoiceOperation(
    state,
    typedResolution,
    definition,
    registry,
    value.choiceId,
  );
  if (operation === null || (value.type === "target") !== (operation.type === "choose-target")) {
    return false;
  }
  if (value.type === "target" && operation.type === "choose-target") {
    const filter = value.filter;
    if (!isValidEffectTargetFilter(filter) || !sameEffectTargetFilter(filter, operation.filter)) {
      return false;
    }
  }
  const currentOptions = operation.type === "choose-target"
    ? selectEffectTargets(state, value.playerId, operation.filter, registry)
    : operation.options;
  return (
    value.options.length === currentOptions.length &&
    value.options.every((option, index) => option === currentOptions[index]) &&
    value.min === operation.min &&
    value.max === Math.min(operation.max, currentOptions.length)
  );
}

function sameEffectTargetFilter(
  left: EffectTargetFilter,
  right: EffectTargetFilter,
): boolean {
  const sameArray = (
    leftValue: readonly string[] | undefined,
    rightValue: readonly string[] | undefined,
  ): boolean =>
    leftValue === undefined || rightValue === undefined
      ? leftValue === rightValue
      : leftValue.length === rightValue.length &&
        leftValue.every((value, index) => value === rightValue[index]);
  return (
    left.controller === right.controller &&
    sameArray(left.zones, right.zones) &&
    sameArray(left.cardCodes, right.cardCodes) &&
    sameArray(left.colorCodes, right.colorCodes) &&
    sameArray(left.traitNames, right.traitNames) &&
    left.nameIncludes === right.nameIncludes &&
    left.minLevel === right.minLevel &&
    left.maxLevel === right.maxLevel &&
    left.minPower === right.minPower &&
    left.maxPower === right.maxPower &&
    left.excludeInstanceId === right.excludeInstanceId &&
    left.attached === right.attached
  );
}

function isValidChoiceValue(value: unknown): value is string | boolean | readonly string[] {
  return typeof value === "string" || typeof value === "boolean" || isStringArray(value);
}

function isValidEffectTargetFilter(value: unknown): value is EffectTargetFilter {
  if (!isRecord(value) || !["self", "opponent", "any"].includes(String(value.controller))) return false;
  if (!Array.isArray(value.zones) || !value.zones.every(isValidZone)) return false;
  for (const key of ["cardCodes", "colorCodes", "traitNames"] as const) {
    if (value[key] !== undefined && !isStringArray(value[key])) return false;
  }
  for (const key of ["minLevel", "maxLevel", "minPower", "maxPower"] as const) {
    if (value[key] !== undefined && !isFiniteInteger(value[key])) return false;
  }
  if (value.excludeInstanceId !== undefined && typeof value.excludeInstanceId !== "string") return false;
  if (value.nameIncludes !== undefined && typeof value.nameIncludes !== "string") return false;
  return value.attached === undefined || value.attached === "attached" || value.attached === "unattached";
}

function isValidChoiceOperation(
  operation: Extract<EffectOperation, { type: "choose-target" | "choose-options" }>,
  controllerId: PlayerId,
): boolean {
  if (
    !isValidPlayerId(operation.playerId) ||
    operation.playerId !== controllerId ||
    typeof operation.choiceId !== "string" ||
    operation.choiceId.length === 0 ||
    !isFiniteInteger(operation.min) ||
    !isFiniteInteger(operation.max) ||
    operation.min < 0 ||
    operation.max < operation.min
  ) {
    return false;
  }
  if (operation.type === "choose-target") {
    return isValidEffectTargetFilter(operation.filter);
  }
  return (
    isStringArray(operation.options) &&
    new Set(operation.options).size === operation.options.length &&
    operation.max <= operation.options.length
  );
}

function isValidEffectOperationShape(value: unknown): value is Exclude<EffectOperation, { type: "choose-target" | "choose-options" }> {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "draw") {
    return isValidPlayerId(value.playerId) && isFiniteInteger(value.count) && value.count >= 0;
  }
  if (value.type === "move" || value.type === "place") {
    return typeof value.instanceId === "string" && value.instanceId.length > 0 && isEffectDestination(value.destination);
  }
  if (["discard", "retreat", "prune", "cover"].includes(value.type)) {
    return typeof value.instanceId === "string" && value.instanceId.length > 0;
  }
  if (value.type === "attach") {
    return typeof value.instanceId === "string" && value.instanceId.length > 0 &&
      typeof value.targetInstanceId === "string" && value.targetInstanceId.length > 0;
  }
  if (value.type === "detach") {
    return typeof value.instanceId === "string" && value.instanceId.length > 0 &&
      (value.destination === undefined || isEffectDestination(value.destination));
  }
  if (value.type === "modify") {
    return typeof value.instanceId === "string" && value.instanceId.length > 0 &&
      (value.attribute === "level" || value.attribute === "range" || value.attribute === "power") &&
      isFiniteInteger(value.amount);
  }
  if (value.type === "set-turn-state") {
    return typeof value.instanceId === "string" && value.instanceId.length > 0 &&
      (value.field === "additionalAttacks" || value.field === "attackCharactersOnly") &&
      ((value.field === "additionalAttacks" && isFiniteInteger(value.value) && value.value >= 0) ||
        (value.field === "attackCharactersOnly" && typeof value.value === "boolean"));
  }
  return false;
}

function defaultAuthorization(
  state: GameState,
  operation: Exclude<EffectOperation, { type: "choose-target" | "choose-options" }>,
): EffectAuthorization | null {
  if (operation.type === "draw") {
    return { controllerId: operation.playerId, sourceInstanceId: "" };
  }
  const instanceId = "instanceId" in operation ? operation.instanceId : null;
  if (instanceId === null) return null;
  const instance = state.instances[instanceId];
  return instance === undefined
    ? null
    : { controllerId: instance.controllerId, sourceInstanceId: instanceId };
}

function isAuthorizedEffectOperation(
  state: GameState,
  operation: Exclude<EffectOperation, { type: "choose-target" | "choose-options" }>,
  authorization: EffectAuthorization,
): boolean {
  if (!isValidPlayerId(authorization.controllerId)) return false;
  if (authorization.sourceInstanceId !== "") {
    const source = state.instances[authorization.sourceInstanceId];
    if (
      source === undefined ||
      source.controllerId !== authorization.controllerId ||
      getInstanceMembership(state, authorization.sourceInstanceId) === null
    ) return false;
  } else if (operation.type !== "draw") {
    return false;
  }
  if (operation.type === "draw") {
    return operation.playerId === authorization.controllerId;
  }
  const instanceId = "instanceId" in operation ? operation.instanceId : null;
  if (instanceId === null) return false;
  const instance = state.instances[instanceId];
  if (instance === undefined || getInstanceMembership(state, instanceId) === null) return false;
  if (
    ["discard", "move", "place", "retreat"].includes(operation.type) &&
    instance.attachedTo !== null
  ) return false;
  if (["discard", "place", "attach", "detach", "set-turn-state"].includes(operation.type) && instance.controllerId !== authorization.controllerId) {
    return false;
  }
  if (operation.type === "move" || operation.type === "place") {
    if (!hasEffectDestinationCapacity(state, instanceId, operation.destination)) return false;
  }
  if (operation.type === "attach") {
    const target = state.instances[operation.targetInstanceId];
    if (
      target === undefined ||
      target.controllerId !== authorization.controllerId ||
      target.attachedTo !== null ||
      getInstanceMembership(state, operation.targetInstanceId) === null
    ) return false;
  }
  if (operation.type === "detach" && instance.attachedTo === null) return false;
  if (operation.type === "cover" && (instance.zone !== "base" || instance.attachedTo !== null)) return false;
  return true;
}

function hasEffectDestinationCapacity(
  state: GameState,
  instanceId: string,
  destination: Zone,
): boolean {
  const instance = state.instances[instanceId];
  if (instance === undefined) return false;
  const player = state.players[instance.controllerId];
  if (isBattleZone(destination)) {
    return player.battle[destination] === null || player.battle[destination] === instanceId;
  }
  if (destination === "base") {
    return player.base.length < 6 || player.base.includes(instanceId);
  }
  return true;
}

function eventContext(event: GameEvent): Readonly<Record<string, string | number | boolean | readonly string[]>> {
  const context: Record<string, string | number | boolean | readonly string[]> = {
    "event:type": event.type,
    "event:sequence": event.sequence,
    "event:visibility": event.visibility,
    "event:playerId": event.playerId ?? "",
  };
  for (const [key, value] of Object.entries(event.data)) {
    context[`event:data:${key}`] = value;
  }
  return context;
}

function eventFromContext(
  context: Readonly<Record<string, string | number | boolean | readonly string[]>>,
): GameEvent {
  const data: Record<string, string | number | boolean | readonly string[]> = {};
  for (const [key, value] of Object.entries(context)) {
    if (key.startsWith("event:data:")) data[key.slice("event:data:".length)] = value;
  }
  const playerId = context["event:playerId"];
  return {
    sequence: typeof context["event:sequence"] === "number" ? context["event:sequence"] : 0,
    type: typeof context["event:type"] === "string" ? context["event:type"] : "effect",
    visibility: context["event:visibility"] === "private" ? "private" : "public",
    playerId: playerId === "player" || playerId === "bot" ? playerId : null,
    data,
  };
}

function withSequence(event: EffectEvent, sequence: number): GameEvent {
  return { ...event, sequence };
}
