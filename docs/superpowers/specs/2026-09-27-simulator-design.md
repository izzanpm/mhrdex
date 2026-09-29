# MHR Simulator Design

**Date:** 2026-09-27
**Status:** Draft for review
**Rules source:** Marvel Hero Rush Comprehensive Rules 1.03, updated 2026-08-12

## Context

MHR Dex Web already contains the public card catalog, deck builder, and
authenticated cloud decks. Guest IndexedDB deck persistence is not implemented
in the current repository. The next feature is a browser simulator for solo
play against a bot.

The simulator must model the rules as a deterministic game engine rather than
putting game rules in React components. The first release uses a legal-move bot,
a curated set of supported cards, and runtime Rush Point definitions.

## Goals

- Let an authenticated player start a local solo game using a valid owned cloud
  deck.
- Use a fixed, checked-in 50-card demo deck for the bot.
- Implement the core game rules from Comprehensive Rules 1.03.
- Execute a curated set of supported card abilities through typed runtime
  definitions.
- Keep the engine serializable and deterministic so replay and multiplayer can
  be added later.
- Reuse existing deck validation and catalog data without making the engine
  depend on React, Next.js, Drizzle, or the DOM.

## Non-Goals

- Online multiplayer or realtime transport.
- Cloud persistence of an in-progress simulator game.
- Replay UI or resume-after-refresh.
- Guest IndexedDB deck persistence.
- A competitive bot or search-based AI.
- Executing arbitrary natural-language ability text.
- Supporting every card in the catalog in the first release.
- A separate Rush Point database table or catalog flow.

## Product Decisions

- The simulator is an authenticated route at `/simulator` for the first release.
- The player selects a valid owned cloud deck.
- The adapter accepts the existing deck draft shape rather than depending on
  cloud storage, so a future local deck source can be added without changing
  the engine.
- The bot uses one fixed 50-card demo deck composed only of supported cards.
- The main deck must contain exactly 50 Character cards, no more than 2 colors,
  and no more than 3 copies of the same `cardCode`.
- The simulator setup always creates a nine-card runtime Rush Point Deck.
- Rush Points have runtime definitions only. They do not need catalog rows for
  the first release because they only move to the Timeline as win progress.
- A game ends on nine Rush Points in a Timeline, an opponent deck with zero
  cards, or a supported effect that declares a winner.
- A browser refresh ends the current game in the first release.
- A game seed is stored in state. The same seed and action sequence must produce
  the same result.

## Rules Scope

The core engine implements these areas:

- Deck, Rush Point Deck, Hand, Timeline, Retreat, and Void.
- Battle Front, left Wing, right Wing, and Back.
- Base with a six-card limit, including face-down cards.
- Owner and controller identity.
- Face-down cards and attached cards at the state level.

The core turn flow is:

1. Start of Turn.
2. Draw Phase: draw two cards.
3. Action Phase: Base Deployment once, Action CALL up to three times with the
   first-player first-turn exception, BATTLE-BASE MOVE opportunities, supported
   Activated Effects, and End Action Phase.
4. Battle Phase: first player skips the first Battle Phase, battle rearrangement,
   Front/Wing/Back attack order, target selection, Counter Step, and confirmation.
5. Counter Phase.
6. End Phase: end triggers, end-of-turn effects, and hand limit nine.

Battle must support range-based target validation, Weakness attacks, Attack Power
comparison, equal-power Both Lose, retreat, and placing a Rush Point into the
Timeline after a successful Weakness attack.

## Engine Architecture

The engine lives under `lib/simulator/` and has no UI or database imports.

- `types.ts`: serializable state, card instances, actions, windows, events, and
  errors.
- `rules.ts`: phase rules, area limits, action limits, range calculation, and
  win checks.
- `engine.ts`: setup, legal-action generation, and `applyAction` transitions.
- `effects.ts`: effect metadata parsing, typed effect contexts, resolution, and
  supported primitive operations.
- `cards.ts`: supported Character runtime definitions and the fixed bot deck.
- `bot.ts`: deterministic legal-action selection with simple priorities.
- `adapter.ts`: conversion from existing deck/catalog data into simulator input.

The client UI uses a local reducer around the pure engine. It dispatches typed
actions, renders the returned state and events, and asks the bot for an action
when the bot owns the current priority.

## State Model

`GameState` contains:

- `rulesetVersion`, engine version, seed, and RNG state.
- Turn number, active player, phase, priority player, and current action window.
- Player state for both sides: deck, hand, battle slots, base, retreat, void,
  timeline, and Rush Point Deck.
- A serializable card-instance map. Areas contain instance IDs, while each
  instance stores its card ID, owner, current zone, face-down state, attachment
  relationship, turn flags, and active modifiers.
- A resolution queue for effects waiting to resolve.
- A pending choice for targets, optional effects, mulligan, card ordering, or
  counter decisions.
- Winner and ordered game events.

`phase` identifies the broad turn phase. `actionWindow` identifies the exact
allowed decision, such as `action`, `battle-select-target`, `battle-counter`,
`counter-phase`, `effect-choice`, or `mulligan`. `priorityPlayer` identifies who
may act next inside that window.

Expected actions include setup choices, mulligan decisions, Base Deployment,
CALL, BATTLE-BASE MOVE, attack declaration, target selection, battle
rearrangement, Counter CALL, Counter-Activated Effects, Activated Effects,
effect choices, pass, and End Phase.

`applyAction(state, action)` returns either a new state with events or a typed
error while leaving the input state unchanged. No UI component performs direct
state mutation or bypasses this function.

## Effect Model

The raw `abilityText` remains in the card catalog. The simulator reads its
header into metadata such as:

- Effect type: Trigger, Auto, or Activated.
- Counter marker.
- Effect location: Field, Battle, Hand, Retreat, Void, Base, Front, Wing, or
  Back as applicable.
- Usage limit such as Once Per Turn.
- Raw effect body.

The header parser does not attempt to understand arbitrary English. The body is
mapped to a typed runtime definition for each supported card/effect. A runtime
definition can express trigger conditions, target filters, optional choices,
usage limits, and primitive operations such as draw, discard, move, retreat,
prune, attach, place, and modify Level, Range, or Power.

For a trigger such as:

`TRIG【BATTLE/ONCE PER TURN】: When your character with Lv4 or above enters the field by calling, ...`

the source card must be in Battle, the event condition is a Character Lv4 or
higher entering by CALL, and the usage marker prevents the same effect from
being used more than once in the turn. The location is not itself the trigger
event.

When an event creates one or more effects, the engine stores effect instances
in the resolution queue. The queue preserves the rules-defined resolution order,
pauses for required choices, and resumes the interrupted action after the
current effect and any derived effects finish.

Auto Effects are evaluated as active modifiers while their source is in the
required location. Activated Effects are exposed only in legal action windows.
Counter-Activated Effects are exposed only in Counter Step or Counter Phase as
allowed by the rules.

## Catalog and Deck Integration

The existing catalog already stores `cardVariants.power` as a nullable integer,
and the importer reads `power` from `cards.en.json`. The missing work is to
propagate it through the public card query and shared card type.

Catalog changes required by the simulator:

- Select `power` in `lib/cards.ts`.
- Add nullable integer `power` to `CardListItem`.
- Change `cardVariants.range` from text to integer through a validating,
  data-preserving migration.
- Change shared range types, filter values, and UI formatting to use integers.
- Select raw `abilityText` for the simulator catalog response and keep it
  available to the simulator adapter.
- Update the cloud schema, Drizzle schema, importer types, queries, and tests
  together.

Existing deck copy validation remains based on `cardCode`. Character names are
still available to runtime effects and `UNIQUE`, but do not replace the deck
copy key.

The adapter expands deck quantities into unique instances, resolves each card
to a supported runtime definition, rejects missing or invalid Power/Range data,
and returns a setup error before a game starts. It also creates nine generic
runtime Rush Point instances for the Rush Point Deck.

## Bot

The engine keeps the full state internally, but the bot decision function
receives a bot-specific view: its own private hand and deck plus all public
areas. It cannot read the player's private hand or deck when making decisions.
It calls `getLegalActions` and selects using deterministic priorities:

1. Take an immediate winning action.
2. Resolve a mandatory legal action.
3. CALL a useful Character when possible.
4. Make a legal move or attack.
5. Use a supported effect when its simple condition is met.
6. Pass or end the current window.

Ties use the seeded RNG. The bot never creates an action outside the engine's
legal-action list.

## UI and Data Flow

The authenticated route server component supplies public catalog data and the
user's owned deck choices. The client simulator screen combines the selected
cloud deck with the fixed bot deck and sends both through the adapter:

`selected decks -> adapter -> setupGame(seed) -> GameState -> applyAction -> state/events -> board UI`

The UI includes setup validation, battle board, hand, deck/Rush Point counts,
Timeline, available actions, pending choices, and an event log. It does not
implement rules independently.

## Error Handling

- Invalid deck setup returns a typed error with the affected card or rule.
- Unsupported card effects prevent game start and identify the unsupported
  card/effect.
- Invalid actions return an error and preserve the previous state.
- Invalid targets are rejected by the engine and are not merely disabled in UI.
- Exhausted or invalid data values are rejected during catalog migration/import.
- UI errors explain whether the problem is deck validity, unsupported content,
  or an invalid action.

## Testing

Pure engine tests cover:

- Setup, 50-card validation, nine Rush Points, starting hand, and mulligan.
- Phase transitions and action limits.
- CALL for Lv3 or lower and Lv4+ CALL requirements.
- Base and Battle area limits, movement, face-down cards, and attachments.
- Range-based target legality, attack order, Counter windows, and pass handling.
- Power comparison, Both Lose, retreat, Weakness, Timeline progress, deck-out,
  and all win conditions.
- Trigger header parsing and once-per-turn metadata.
- Supported runtime effects and resolution queue ordering.
- Deterministic replay from the same seed and action sequence.
- Bot actions always being legal.

Integration tests cover the adapter, catalog Power/Range propagation, fixed bot
deck setup, unsupported-card errors, and simulator setup UI states.

## Future Extensions

The serializable engine boundary leaves room for:

- More typed card definitions and effect primitives.
- A local IndexedDB deck source.
- Replay and resume using the seed plus action/event log.
- A stronger bot.
- Cloud game snapshots.
- An authoritative server or realtime multiplayer transport.

None of these are part of the first implementation.
