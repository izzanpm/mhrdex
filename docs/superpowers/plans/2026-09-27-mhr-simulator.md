# MHR Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authenticated, browser-local Marvel Hero Rush solo simulator with a deterministic rules engine, a legal-move bot, and a small supported card set.

**Architecture:** A pure TypeScript engine under `lib/simulator/` owns all game state transitions, phase windows, validation, effects, and bot inputs. An authenticated Next.js route supplies catalog data and an owned cloud deck; a client screen dispatches engine actions and renders the returned state. Rush Points and supported card effects are runtime definitions, not new database entities.

**Tech Stack:** Next.js App Router, TypeScript strict mode, React 19, Drizzle ORM/PostgreSQL for catalog reads and the range migration, native React reducer state for the running game, Node's built-in test runner through `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-27-simulator-design.md`

## Global Constraints

- Use Comprehensive Rules 1.03, updated 2026-08-12, as the simulator rules source.
- The simulator MVP is authenticated and uses an owned cloud deck; do not add IndexedDB in this plan.
- The bot uses one fixed, checked-in 50-card demo deck composed only of supported cards.
- The main deck must contain exactly 50 Character cards, no more than 2 colors, and no more than 3 copies of the same `cardCode`.
- The simulator setup always creates a nine-card runtime Rush Point Deck.
- The engine must not import React, Next.js, Drizzle, or the DOM.
- Do not execute arbitrary natural-language ability text; use parsed headers plus typed runtime definitions.
- Invalid actions return typed errors and leave the input `GameState` unchanged.
- Preserve valid catalog values during migrations and reject invalid legacy `range` values instead of guessing.
- Do not install new dependencies.
- Use TypeScript strict mode and no `any`.
- Use `apply_patch` for manual edits and do not commit unless explicitly requested.

## File Map

### Catalog and data contract

- Modify `src/db/schema.ts` to make `cardVariants.range` an integer while retaining nullable `power`.
- Modify `schema_cloud.sql` and `schema_cloud.md` to match the Drizzle schema.
- Create `drizzle/20260927090000_make_card_variant_range_integer/migration.sql` for the data-preserving range conversion.
- Modify `scripts/cards-import.ts` so imported range values remain numeric and validated.
- Modify `lib/cards.ts` to select `power`, numeric `range`, and raw `abilityText`.
- Modify `types/card.ts` and `components/card-library.tsx` for numeric range and power fields.
- Modify `src/db/schema.test.ts`, `scripts/cards-import.test.ts`, and `components/card-library.test.tsx` for the catalog contract.

### Pure simulator

- Create `lib/simulator/types.ts` for serializable state, actions, windows, events, card definitions, and errors.
- Create `lib/simulator/rules.ts` for area limits, phase limits, range calculations, and win checks.
- Create `lib/simulator/adapter.ts` for cloud deck validation and conversion into simulator setup input.
- Create `lib/simulator/effects.ts` for effect-header parsing, typed effect contexts, resolution, and primitives.
- Create `lib/simulator/cards.ts` for supported card definitions, runtime Rush Points, and the fixed bot deck.
- Create `lib/simulator/engine.ts` for setup, legal-action generation, and immutable action transitions.
- Create `lib/simulator/bot.ts` for deterministic legal-action selection.
- Create `lib/simulator/*.test.ts` tests for each pure module.

### Simulator UI

- Create `app/(dashboard)/simulator/page.tsx` as the authenticated route entry point.
- Create `components/simulator-screen.tsx` for client reducer state and setup/game orchestration.
- Create `components/simulator-board.tsx` for Front, Wings, Back, and Base.
- Create `components/simulator-hand.tsx` for the player's hand and available hand actions.
- Create `components/simulator-status.tsx` for phase, priority, deck counts, Timeline, and winner state.
- Create `components/simulator-event-log.tsx` for ordered public events.
- Create `app/(dashboard)/simulator/page.test.tsx` and component tests for setup and error states.
- Modify `architecture.test.ts` and `package.json` so the new route and tests are covered.

---

### Task 1: Align Catalog Types and Database Range

**Files:**
- Modify: `src/db/schema.ts:165-191`
- Modify: `schema_cloud.sql` and `schema_cloud.md` card variant definitions
- Create: `drizzle/20260927090000_make_card_variant_range_integer/migration.sql`
- Modify: `scripts/cards-import.ts:37-55`
- Modify: `lib/cards.ts:14-68`
- Modify: `types/card.ts:1-25`
- Modify: `components/card-library.tsx` range option and comparison code
- Test: `src/db/schema.test.ts`, `scripts/cards-import.test.ts`, `components/card-library.test.tsx`

**Interfaces:**
- `CardListItem` exposes `power: number | null`, `range: number | null`, and `abilityText: string | null`.
- `CardFilters.ranges` becomes `number[]`; UI labels convert numbers to strings only at render time.
- `getCards()` selects `cardVariants.power`, `cardVariants.range`, and `cards.abilityText`.

- [ ] **Step 1: Add failing schema and type assertions**

Add tests that assert the Drizzle `cardVariants.range` column is an integer, that a catalog row carries `power`, and that numeric range filters compare numbers rather than string labels.

```ts
test("stores numeric power and range in the card variant contract", () => {
  assert.equal(cardVariants.power.dataType, "number");
  assert.equal(cardVariants.range.dataType, "number");
});

test("filters a numeric range without string coercion", () => {
  const result = filterCards(cards, "", {
    ...EMPTY_FILTERS,
    ranges: [3],
  });

  assert.deepEqual(result.map((card) => card.cardCode), ["BP01-003"]);
});
```

- [ ] **Step 2: Run focused tests and verify the contract fails**

Run: `npx tsx --test src/db/schema.test.ts scripts/cards-import.test.ts components/card-library.test.tsx`

Expected: FAIL because `range` is currently text, `CardListItem` lacks `power` and `abilityText`, and range filters use strings.

- [ ] **Step 3: Change the Drizzle and SQL contracts**

Change `cardVariants.range` to `integer("range")`. Keep `power: integer("power")` nullable. Update the executable SQL reference and the prose cloud schema so fresh databases use the same types.

Create the migration with this validation order. The first block must abort the migration when any existing non-null range is not a decimal integer; it must not convert values such as `R-1` by guessing.

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM card_variants
    WHERE range IS NOT NULL
      AND range !~ '^[0-9]+$'
  ) THEN
    RAISE EXCEPTION 'card_variants.range contains a non-integer legacy value';
  END IF;
END $$;

ALTER TABLE card_variants
  ALTER COLUMN range TYPE integer
  USING range::integer;
```

- [ ] **Step 4: Propagate catalog fields through importer, query, and shared types**

Keep `ScrapedVariant.power` and `ScrapedVariant.range` numeric. Add `power`, `range`, and `abilityText` to the `getCards()` selection and returned `CardListItem`. Update every catalog fixture to provide nullable values explicitly.

Replace the string `RANGE_OPTIONS` constant with numeric values, and give range
its own numeric toggle helper instead of passing it through
`toggleMultiStringFilter`:

```tsx
const RANGE_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

{RANGE_OPTIONS.map((range) => (
  <FilterOption
    key={range}
    onClick={() => toggleRangeFilter(range)}
    selected={draftFilters.ranges.includes(range)}
  >
    {`R-${range}`}
  </FilterOption>
))}
```

Update `filterCards` to use `card.range !== null` rather than a truthiness
check so `R-0` remains filterable.

- [ ] **Step 5: Run the focused tests and typecheck**

Run: `npx tsx --test src/db/schema.test.ts scripts/cards-import.test.ts components/card-library.test.tsx`

Expected: all focused tests pass.

Run: `npx tsc --noEmit`

Expected: no TypeScript errors from changed catalog fixtures or range comparisons.

---

### Task 2: Define Serializable Simulator Domain Types

**Files:**
- Create: `lib/simulator/types.ts`
- Create: `lib/simulator/rules.ts`
- Test: `lib/simulator/types.test.ts`, `lib/simulator/rules.test.ts`

**Interfaces:**

Define these exact primitive types in `types.ts`:

```ts
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
  | "counter-phase"
  | "effect-choice"
  | "game-over";
```

Define the shared card and bot-view contracts in the same file:

```ts
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

export type BotView = {
  ownHand: readonly string[];
  ownDeck: readonly string[];
  publicState: {
    phase: Phase;
    actionWindow: ActionWindow;
    activePlayer: PlayerId;
    priorityPlayer: PlayerId;
    players: Record<PlayerId, {
      deckCount: number;
      handCount: number;
      battle: Record<BattleSlot, string | null>;
      base: readonly string[];
      timeline: readonly string[];
      retreat: readonly string[];
      void: readonly string[];
      rushPointDeckCount: number;
    }>;
  };
  legalActions: readonly GameAction[];
};

export type GameAction =
  | { type: "submit-mulligan"; playerId: PlayerId; instanceIds: readonly string[] }
  | { type: "base-deploy"; playerId: PlayerId; instanceId: string }
  | { type: "call"; playerId: PlayerId; instanceId: string; sacrifices: readonly string[] }
  | { type: "battle-base-move"; playerId: PlayerId; instanceId: string; destination: BattleSlot | "base" }
  | { type: "end-action-phase"; playerId: PlayerId }
  | { type: "rearrange-battle"; playerId: PlayerId; order: Record<BattleSlot, string | null> }
  | { type: "declare-attack"; playerId: PlayerId; attackerId: string }
  | { type: "select-attack-target"; playerId: PlayerId; targetId: string | `weakness:${BattleSlot}` }
  | { type: "counter-pass"; playerId: PlayerId }
  | { type: "counter-call"; playerId: PlayerId; instanceId: string; sacrifices: readonly string[] }
  | { type: "counter-effect"; playerId: PlayerId; effectId: string; sourceInstanceId: string }
  | { type: "choose-effect"; playerId: PlayerId; choiceId: string; value: string | boolean | readonly string[] };
```

`CardInstance` stores only mutable runtime state and a reference to a catalog
card code. `PlayerState` stores instance IDs in each zone. `GameState` stores
the full state, active/priority players, turn counters, pending choices, a
resolution queue, and ordered events. `GameAction` must be a discriminated
union for mulligan, deployment, CALL, movement, battle, counter, effect choice,
pass, and phase end actions. `EngineResult` must be either `{ ok: true,
state, events }` or `{ ok: false, state, error }`.

- [ ] **Step 1: Write type-level behavior tests**

Test that a state can be serialized and restored without losing card instance
IDs, hidden-zone flags, attachments, or pending choices.

```ts
test("simulator state is JSON serializable", () => {
  const restored = JSON.parse(JSON.stringify(sampleState)) as GameState;
  assert.deepEqual(restored, sampleState);
});
```

- [ ] **Step 2: Run the new type tests before implementation**

Run: `npx tsx --test lib/simulator/types.test.ts lib/simulator/rules.test.ts`

Expected: FAIL because the simulator types and rule helpers do not exist.

- [ ] **Step 3: Implement the domain types and pure rule helpers**

Implement `getAreaLimit(zone)`, `getBattleDistance(from, to)`,
`isBattleSlot(zone)`, `getOpponent(playerId)`, and `isWinningTimeline(timeline)`.
Keep these functions free of card definitions and UI imports.

- [ ] **Step 4: Run the new tests and typecheck**

Run: `npx tsx --test lib/simulator/types.test.ts lib/simulator/rules.test.ts`

Expected: all tests pass.

Run: `npx tsc --noEmit`

Expected: no errors.

---

### Task 3: Build the Cloud Deck Adapter and Game Setup Input

**Files:**
- Create: `lib/simulator/adapter.ts`
- Create: `lib/simulator/adapter.test.ts`
- Modify: `lib/simulator/types.ts`

**Interfaces:**

Add these exact input and result shapes:

```ts
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

export function adaptCloudDeck(
  entries: readonly SimulatorDeckEntry[],
  catalog: readonly SimulatorCatalogCard[],
  supportedCardCodes: ReadonlySet<string>,
): AdapterResult;

export function adaptBotDeck(
  entries: readonly SimulatorBotDeckEntry[],
  catalog: readonly SimulatorCatalogCard[],
  supportedCardCodes: ReadonlySet<string>,
): AdapterResult;
```

The adapter must reuse the existing deck validation semantics for exactly 50
cards, at most 2 colors, and at most 3 copies by `cardCode`. It must resolve
every entry to a base Character definition, reject unsupported cards before
game setup, and reject null Power/Range for simulator cards. Add
`createRuntimeRushPointDeck(ownerId)` returning exactly nine distinct runtime
instances with no catalog dependency.

- [ ] **Step 1: Write failing adapter tests**

Cover valid 50-card input, invalid total, fourth copy by card code, third color,
missing catalog card, unsupported card, missing Power, missing Range, and nine
runtime Rush Point instances.

```ts
test("accepts a valid 50-card cloud deck", () => {
  const result = adaptCloudDeck(validEntries, catalog, supportedCardCodes);
  assert.equal(result.ok, true);
});

test("creates nine runtime Rush Points without catalog rows", () => {
  const points = createRuntimeRushPointDeck("player");
  assert.equal(points.length, 9);
  assert.equal(new Set(points.map((point) => point.instanceId)).size, 9);
});
```

- [ ] **Step 2: Run adapter tests and verify failure**

Run: `npx tsx --test lib/simulator/adapter.test.ts`

Expected: FAIL because the adapter functions do not exist.

- [ ] **Step 3: Implement the adapter and runtime Rush Point factory**

Keep the adapter pure. It must not query the database, read browser storage, or
create React state. The route will provide catalog rows and owned deck entries.

- [ ] **Step 4: Run adapter tests and typecheck**

Run: `npx tsx --test lib/simulator/adapter.test.ts`

Expected: all adapter tests pass.

Run: `npx tsc --noEmit`

Expected: no errors.

---

### Task 4: Implement Setup, Mulligan, Action Phase, and Immutable Transitions

**Files:**
- Create: `lib/simulator/engine.ts`
- Create: `lib/simulator/engine-action.test.ts`
- Modify: `lib/simulator/types.ts`
- Modify: `lib/simulator/rules.ts`

**Interfaces:**

Implement these functions:

```ts
export function setupGame(input: {
  playerEntries: readonly SimulatorDeckEntry[];
  botEntries: readonly SimulatorDeckEntry[];
  definitions: ReadonlyMap<string, SimulatorCardDefinition>;
  seed: number;
  firstPlayer: PlayerId;
}): GameState;

export function getLegalActions(
  state: GameState,
  playerId: PlayerId,
): readonly GameAction[];

export function applyAction(
  state: GameState,
  action: GameAction,
): EngineResult;
```

`setupGame` expands quantities into unique instances, shuffles both Character
Decks and Rush Point Decks with the seeded RNG, draws six cards, and opens the
`mulligan` window. The first-player mulligan decision is resolved before the
second player's decision. The engine must not use `Math.random()` or time.

Implement the following action rules before Battle logic:

- Mulligan selected cards to the bottom, draw replacements, then shuffle.
- Draw two cards at Draw Phase.
- Base Deployment once per Action Phase: place one hand card face-down in
  Base, then draw one card.
- Lv1-Lv3 CALL directly from Hand.
- Lv4+ CALL by retreating field cards whose combined original Level equals the
  called card's Level; face-down Base cards count as Level 1.
- Action CALL maximum three times, with the first-player first-turn maximum of
  one.
- BATTLE-BASE MOVE once per Character per turn, excluding a Character placed
  onto the Field during that turn.
- End Action Phase and move through Start, Draw, Action, and End windows.

- [ ] **Step 1: Write failing setup and action tests**

Test seeded setup, six-card opening hand, mulligan order, Base Deployment,
CALL level requirements, CALL count limits, first-turn exception, and movement
eligibility.

Define the test fixtures in this file: `fixtureSetup` is a complete setup input
with two legal 50-card fixture decks and definitions; `setupInActionPhase()`
returns a state with the player as active priority; and every fixture uses
unique instance IDs so deep equality can detect accidental mutation.

```ts
test("setup draws six cards and opens mulligan", () => {
  const state = setupGame(fixtureSetup);
  assert.equal(state.phase, "mulligan");
  assert.equal(state.actionWindow, "mulligan");
  assert.equal(state.players.player.hand.length, 6);
});

test("invalid action preserves the previous state", () => {
  const state = setupInActionPhase();
  const result = applyAction(state, {
    type: "base-deploy",
    playerId: "bot",
    instanceId: state.players.player.hand[0],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.state, state);
});
```

- [ ] **Step 2: Run the action tests and verify failure**

Run: `npx tsx --test lib/simulator/engine-action.test.ts`

Expected: FAIL because setup and action transitions are not implemented.

- [ ] **Step 3: Implement setup, seeded shuffle, mulligan, and Action Phase**

Use immutable copies of zone arrays and instance records. Store all successful
transitions as events with a monotonically increasing sequence number. Keep
`priorityPlayer` and `actionWindow` in the state after every transition.

- [ ] **Step 4: Run the action tests and typecheck**

Run: `npx tsx --test lib/simulator/engine-action.test.ts`

Expected: all setup and Action Phase tests pass.

Run: `npx tsc --noEmit`

Expected: no errors.

---

### Task 5: Implement Battle, Counter Windows, and Win Conditions

**Files:**
- Modify: `lib/simulator/engine.ts`
- Modify: `lib/simulator/rules.ts`
- Create: `lib/simulator/engine-battle.test.ts`

Implement the remaining core flow:

- First player skips the first Battle Phase.
- Rearrange up to four Characters in Battle once per Battle Phase.
- Attack in Front, then Wings, then Back; allow either Wing order.
- Give each Character one attack opportunity per turn.
- Calculate Battle distance and legal targets from the attacker's current Range.
- Allow an empty reachable Battle slot to be targeted as Weakness.
- Open a Counter Step where opponent priority comes first and both players may
  pass; two consecutive passes resolve the battle.
- Compare current Attack Power, retreat the loser, and retreat both on equal
  Power.
- On a successful Weakness attack, move the attacker's top Rush Point to its
  Timeline and check the nine-point win condition.
- Check deck-out after any effect or rule action that removes the last card.
- Finish End Phase triggers/cleanup and enforce a nine-card hand limit.

The battle action sequence is explicit:

```text
declare-attack
-> battle-select-target
-> battle-counter (opponent priority first)
-> battle-confirmation
-> next attack slot or Counter Phase
```

- [ ] **Step 1: Write failing battle tests**

Cover distance 0/1/2/3, unavailable targets, Weakness, Front/Wing/Back order,
equal Power, retreat, Timeline progress, first-turn skip, counter pass order,
and deck-out.

Define `setupWeaknessAttackState()` with one legal attacker, an empty reachable
opponent Battle slot, and at least one Rush Point remaining. Define the test
helpers `declareAttack`, `selectTarget`, and `counterPass` as constructors for
the corresponding `GameAction` union members.

```ts
test("a successful Weakness attack moves one Rush Point to Timeline", () => {
  const state = setupWeaknessAttackState();
  const result = applyActionsForTest(state, [
    declareAttack("player", attackerId),
    selectTarget("player", "weakness:front"),
    counterPass("bot"),
    counterPass("player"),
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.state.players.player.timeline.length, 1);
});

function applyActionsForTest(
  state: GameState,
  actions: readonly GameAction[],
) {
  let current = state;
  for (const action of actions) {
    const result = applyAction(current, action);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.error.message);
    current = result.state;
  }
  return { ok: true as const, state: current };
}
```

- [ ] **Step 2: Run battle tests and verify failure**

Run: `npx tsx --test lib/simulator/engine-battle.test.ts`

Expected: FAIL because battle windows and confirmation are not implemented.

- [ ] **Step 3: Implement battle and win transitions**

Keep target legality in `rules.ts` and state changes in `engine.ts`. Do not let
the board component decide whether a target is in range or whether a Character
has already attacked.

- [ ] **Step 4: Run battle tests and full simulator engine tests**

Run: `npx tsx --test lib/simulator/engine-action.test.ts lib/simulator/engine-battle.test.ts`

Expected: all simulator engine tests pass.

---

### Task 6: Add Ability Header Parsing and Typed Runtime Effects

**Files:**
- Create: `lib/simulator/effects.ts`
- Create: `lib/simulator/effects.test.ts`
- Create: `lib/simulator/cards.ts`
- Create: `lib/simulator/cards.test.ts`
- Modify: `lib/simulator/types.ts`
- Modify: `lib/simulator/engine.ts`

**Interfaces:**

Implement metadata parsing without pretending to parse arbitrary English:

```ts
export type ParsedAbility = {
  effectId: string;
  kind: "trigger" | "auto" | "activated";
  counter: boolean;
  locations: readonly string[];
  oncePerTurn: boolean;
  body: string;
};

export function parseAbilityText(
  cardCode: string,
  abilityText: string | null,
): readonly ParsedAbility[];
```

The parser must handle `TRIG`, `AUTO`, `ACTI`, `COUNTER·ACTI`,
`COUNTER(AUTO...)`, `UNIQUE(...)`, Unicode brackets, multiple clauses in one
ability text, spaces around colons, and `/ONCE PER TURN`. It must preserve the
raw body and reject malformed headers with a typed parser error.

The runtime registry uses this interface; handlers live in the registry and are
never stored in `GameState`:

```ts
export type EffectContext = {
  state: GameState;
  sourceInstanceId: string;
  controllerId: PlayerId;
  event: GameEvent;
};

export type EffectOperation =
  | { type: "draw"; playerId: PlayerId; count: number }
  | { type: "discard"; instanceId: string }
  | { type: "move"; instanceId: string; destination: Zone }
  | { type: "retreat"; instanceId: string }
  | { type: "prune"; instanceId: string }
  | { type: "attach"; instanceId: string; targetInstanceId: string }
  | { type: "modify"; instanceId: string; attribute: "level" | "range" | "power"; amount: number };

export type RuntimeEffectDefinition = {
  effectId: string;
  metadata: ParsedAbility;
  canResolve: (context: EffectContext) => boolean;
  resolve: (context: EffectContext) => readonly EffectOperation[];
};
```

Runtime effects are keyed by stable `cardCode` and effect index, not database
UUID. State queue entries store effect IDs and source instance IDs, never
function values. Implement these primitive operations first:

- Draw and discard.
- Move between Field and Base.
- Retreat and prune.
- Place a card from a legal public/private zone.
- Attach and detach.
- Modify current Level, Range, or Power for the current turn.
- Select a target from a typed filter.

The initial supported definitions include the following BP01 cards so the bot
deck has a legal 50-card composition and the engine exercises distinct effect
types:

```text
BP01-001 BP01-002 BP01-003 BP01-004 BP01-005 BP01-006 BP01-007
BP01-008 BP01-009 BP01-010 BP01-011 BP01-012 BP01-013 BP01-014
BP01-015 BP01-016 BP01-017
```

Implement their effects from the catalog text and Rules 1.03, including trigger
location checks, optional choices, once-per-turn usage, target filters, hand
effects, field movement, retreat/prune, and temporary Power/Range changes. A
card with an unimplemented effect is not included in the supported set.

Use the resolution queue as serializable effect instances:

```ts
type Resolution = {
  effectId: string;
  sourceInstanceId: string;
  controllerId: PlayerId;
  context: Readonly<Record<string, string | number | boolean | readonly string[]>>;
};
```

When an event is emitted, matching Trigger Effects are queued in the Rules 1.03
order. Required choices create `pendingChoice`; the engine resumes the current
resolution after the choice and any derived effects finish. Auto Effects are
queried as active modifiers instead of being queued repeatedly.

- [ ] **Step 1: Write failing parser and effect tests**

Test these inputs and expected metadata:

```ts
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
```

Also test `COUNTER·ACTI`, multiple clauses, malformed headers, queue ordering,
optional target choices, and once-per-turn usage markers.

- [ ] **Step 2: Run effect tests and verify failure**

Run: `npx tsx --test lib/simulator/effects.test.ts lib/simulator/cards.test.ts`

Expected: FAIL because the parser, runtime registry, and effect resolver do not
exist.

- [ ] **Step 3: Implement the parser, registry, queue, and primitive operations**

Keep parsed metadata separate from semantic handlers. Use explicit typed effect
definitions for the 17 supported BP01 cards. Do not call an NLP service, use
regular-expression guesses for effect body meaning, or store closures in state.

- [ ] **Step 4: Run effect tests and engine regression tests**

Run: `npx tsx --test lib/simulator/effects.test.ts lib/simulator/cards.test.ts lib/simulator/engine-action.test.ts lib/simulator/engine-battle.test.ts`

Expected: all effect and engine tests pass.

Run: `npx tsc --noEmit`

Expected: no errors.

---

### Task 7: Add the Fixed Demo Bot

**Files:**
- Modify: `lib/simulator/cards.ts`
- Create: `lib/simulator/bot.ts`
- Create: `lib/simulator/bot.test.ts`

**Interfaces:**

Add these exports:

```ts
export const BOT_DEMO_DECK: readonly SimulatorBotDeckEntry[];

export function chooseBotAction(
  view: BotView,
): GameAction | null;
```

`BOT_DEMO_DECK` must use the 17 BP01 card codes registered in Task 6: three
copies of `BP01-001` through `BP01-016` and two copies of `BP01-017`, totaling
50 cards, one color, and no code above three copies. The adapter must validate
this list through the same path as the player deck.

`BotView` includes the bot's private zones and public state but excludes the
player's private Hand and Deck. `chooseBotAction` only selects from
`view.legalActions` (which the engine produced for the bot) and uses the seeded
RNG for ties. Apply
these priorities in order: immediate win, mandatory resolution, useful CALL,
legal attack/move, supported effect, then pass/end window.

- [ ] **Step 1: Write failing bot and deck invariant tests**

Build `catalogByCardCode` from the complete `fixtureCatalog` before running the
helpers below; every BP01 code in `BOT_DEMO_DECK` must resolve to red.

```ts
test("the demo bot deck is a legal 50-card deck", () => {
  assert.equal(sumQuantities(BOT_DEMO_DECK), 50);
  assert.ok(BOT_DEMO_DECK.every((entry) => entry.quantity <= 3));
  assert.equal(getColorCount(BOT_DEMO_DECK), 1);
});

test("the bot always chooses a legal action", () => {
  const action = chooseBotAction(botView);
  assert.ok(
    action === null ||
      botView.legalActions.some(
        (candidate) => JSON.stringify(candidate) === JSON.stringify(action),
      ),
  );
});

function sumQuantities(entries: readonly SimulatorDeckEntry[]) {
  return entries.reduce((total, entry) => total + entry.quantity, 0);
}

function getColorCount(entries: readonly SimulatorBotDeckEntry[]) {
  return new Set(
    entries.map((entry) => catalogByCardCode.get(entry.cardCode)?.colorCode),
  ).size;
}
```

- [ ] **Step 2: Run bot tests and verify failure**

Run: `npx tsx --test lib/simulator/bot.test.ts`

Expected: FAIL because the fixed deck and bot decision function do not exist.

- [ ] **Step 3: Implement the fixed deck and legal-move policy**

Use the engine's legal-action list as the only action source. Add a view-level
test that changing the player's private hand does not change the bot input.

- [ ] **Step 4: Run bot, adapter, and engine tests**

Run: `npx tsx --test lib/simulator/bot.test.ts lib/simulator/adapter.test.ts lib/simulator/engine-action.test.ts lib/simulator/engine-battle.test.ts`

Expected: all tests pass.

---

### Task 8: Build the Authenticated Simulator Route and UI

**Files:**
- Create: `app/(dashboard)/simulator/page.tsx`
- Create: `components/simulator-screen.tsx`
- Create: `components/simulator-board.tsx`
- Create: `components/simulator-hand.tsx`
- Create: `components/simulator-status.tsx`
- Create: `components/simulator-event-log.tsx`
- Create: `app/(dashboard)/simulator/page.test.tsx`
- Create: `components/simulator-screen.test.tsx`

**Interfaces:**

The server page follows the existing authenticated decks pattern:

```ts
export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string }>;
}) {
  // Require the Better Auth session, load owned deck summaries, and load the
  // selected owned deck only after ownership validation.
}
```

The client screen owns a local `useReducer` state with these events:

```ts
type SimulatorUiAction =
  | { type: "start"; seed: number; firstPlayer: PlayerId }
  | { type: "game"; action: GameAction }
  | { type: "bot-turn" };
```

The route behavior is:

- Unauthenticated visitors are redirected to sign-in with a simulator return
  path.
- `/simulator` without `deck` renders owned deck choices.
- `/simulator?deck=<id>` verifies ownership server-side and renders setup data.
- An incomplete, unsupported, or invalid deck renders setup errors before a
  game starts.
- The board renders only state and legal actions from the engine; it does not
  duplicate phase or target rules.
- The hand hides private cards from the opponent view; the bot's hand is never
  rendered to the player.
- Pending choices are rendered as focused controls and dispatch typed actions.
- The event log renders public events in sequence order.

- [ ] **Step 1: Write failing route and setup-state tests**

Cover unauthenticated redirect, missing deck selection, owned deck loading,
ownership failure, unsupported-card setup error, and a successful game start.

```ts
test("requires authentication for the simulator route", () => {
  const source = readFileSync(
    new URL("./page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /requireAuthSession/);
  assert.match(source, /sign-in\?next=%2Fsimulator/);
});
```

- [ ] **Step 2: Run focused route/component tests and verify failure**

Run: `npx tsx --test "app/(dashboard)/simulator/page.test.tsx" components/simulator-screen.test.tsx`

Expected: FAIL because the route and UI components do not exist.

- [ ] **Step 3: Implement the authenticated route and client game screen**

Reuse existing `requireAuthSession`, owned deck queries, `getCards`, and app
layout components. Keep all running game state in the client reducer and send
every game action to `applyAction`.

- [ ] **Step 4: Implement board, hand, status, pending choices, and event log**

Render Front, Wings, Back, Base, hand, Timeline, deck counts, phase, priority,
available actions, and winner state. Use existing card artwork components and
Next.js `Image`; do not introduce a game-board library.

- [ ] **Step 5: Run route/component tests and typecheck**

Run: `npx tsx --test "app/(dashboard)/simulator/page.test.tsx" components/simulator-screen.test.tsx`

Expected: all focused UI tests pass.

Run: `npx tsc --noEmit`

Expected: no errors.

---

### Task 9: Wire the Test Suite and Complete Verification

**Files:**
- Modify: `architecture.test.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-09-27-simulator-design.md` only if an implementation discovery changes an approved contract

- [ ] **Step 1: Add architecture and test-script coverage**

Assert that `app/(dashboard)/simulator/page.tsx` and `lib/simulator/` exist in
the documented architecture test. Add all new simulator test files to the
explicit `npm test` script so they run in CI and local verification.

- [ ] **Step 2: Run all simulator tests**

Run: `npx tsx --test lib/simulator/types.test.ts lib/simulator/rules.test.ts lib/simulator/adapter.test.ts lib/simulator/engine-action.test.ts lib/simulator/engine-battle.test.ts lib/simulator/effects.test.ts lib/simulator/cards.test.ts lib/simulator/bot.test.ts "app/(dashboard)/simulator/page.test.tsx" components/simulator-screen.test.tsx`

Expected: all simulator tests pass with zero failures.

- [ ] **Step 3: Run the complete project test suite**

Run: `npm test`

Expected: all existing and simulator tests pass with zero failures.

- [ ] **Step 4: Run typecheck, lint, and production build**

Run:

```text
npx tsc --noEmit
npm run lint
npm run build
```

Expected: TypeScript and build exit successfully. Lint has zero errors; existing
repository warnings may remain and must not be increased by simulator files.

- [ ] **Step 5: Review the final diff without committing**

Run: `git status --short` and `git diff -- docs/superpowers/plans/2026-09-27-mhr-simulator.md`

Confirm that only intended simulator/catalog files changed and no secrets,
generated environment files, or unrelated worktree changes were modified.
