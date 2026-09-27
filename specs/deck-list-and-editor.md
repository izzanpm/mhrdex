# Deck List and Editor Specification

## Goal

Replace the current deck empty state with a real authenticated deck flow:

- `/decks` shows the user's deck list and the selected deck detail.
- Creating a deck immediately opens that deck in edit mode.
- `/decks/[deckId]/edit` provides a functional card builder.
- The active account `admin@mail.com` receives three seeded demo decks.

## Routes

### `/decks`

Authenticated server-rendered page.

- Shows an empty state when the user has no decks.
- Shows the user's decks in the left panel when decks exist.
- Shows the selected deck in the right panel.
- Selects the deck from `?deck=<deckId>`.
- Selects the first owned deck when the query is absent or does not identify an owned deck.
- Shows a `New deck` action.
- Shows an `Edit deck` action for the selected deck.
- Never queries or displays another user's deck.

### `/decks/new`

No longer hosts the builder. Direct visits redirect to `/decks`.

The `New deck` action creates a draft with the default name `New deck`, no card rows,
and no color rows, then redirects to `/decks/[deckId]/edit`.

### `/decks/[deckId]/edit`

Authenticated server-rendered page with a client-side draft editor.

- Loads only a deck owned by the authenticated user.
- Allows editing the deck name.
- Displays the current card quantities and total.
- Saves through an authenticated Server Action.
- Redirects to `/decks?deck=<deckId>` after a successful save.
- Allows an empty draft to remain empty.

## Ownership

Every deck read and mutation must:

1. Resolve the Better Auth session user ID.
2. Resolve the application user through `users.better_auth_user_id`, creating a
   local application account for that Better Auth identity on first protected use
   when no mapping exists.
3. Scope the deck query or mutation to that application user ID.

Client-provided user IDs are never trusted. A missing session redirects to sign-in.
An owned deck that is not found is treated as not found rather than exposing ownership
information.

## Deck Rules

The rules apply while editing and again when saving:

- Total quantity is at most 50 cards.
- A deck may contain at most two distinct card colors.
- The aggregate quantity for one `card_code` is at most three, including multiple
  entries or variants that resolve to the same code.
- Quantities are positive integers for persisted card rows.
- An empty draft is allowed because creation opens directly in edit mode.
- No minimum nonempty deck size is introduced.

The persisted `deck_colors` rows are derived from the colors of the persisted card
entries. An empty draft has no color rows.

Validation must resolve every submitted card ID against the catalog and reject unknown
cards. It must return a useful error that the editor can show to the user.

## Progressive Color Filtering

The editor uses the current draft to prevent accidental third-color additions:

- With no cards selected, all catalog colors are searchable.
- With cards from one color selected, all colors remain searchable so the user can
  choose the second color intentionally.
- With cards from two colors selected, only those two colors are searchable.
- Removing the last card of a color removes that color from the active set and makes it
  available again.
- A card from a third color is not rendered as an available result and cannot be added
  through the client controls.
- The `+` control is disabled when the `card_code` aggregate reaches three.
- The `+` control is disabled when the total deck quantity reaches 50.

The client-side filter is a usability guard, not the security boundary. The Server
Action repeats the complete validation against current catalog data inside the save
transaction.

## Save Transaction

Saving a deck is atomic:

1. Authenticate and resolve the owned deck.
2. Resolve submitted card IDs to base card IDs, `card_code`, and color.
3. Validate total quantity, color count, quantity per `card_code`, and card existence.
4. Replace the deck's `deck_cards` rows.
5. Replace the deck's `deck_colors` rows with the derived distinct colors.
6. Update the deck name and `updated_at` explicitly.

If validation fails, no deck rows change.

## Seed Data

Add an idempotent manual seed command:

```text
npm run seed:decks -- admin@mail.com
```

The command:

- Requires the target Better Auth user to already exist.
- Creates the local `users` mapping for the explicit target email when it does not
  exist; it does not auto-link unrelated legacy accounts.
- Fails clearly when the target user or catalog is missing.
- Creates three demo decks for that account.
- Uses deterministic selection and quantities so rerunning the command does not create
  duplicates or change existing seeded decks.
- Creates valid `deck_colors` and `deck_cards` rows through the same domain rules.
- Skips a seeded deck that already exists rather than overwriting user edits.

The demo data represents the populated design with three decks and varied card totals.
Card selection may be arbitrary, but every seeded deck must obey the three deck rules.
The command does not seed every user and is never run automatically by a page request.

## UI

### Deck List

Match the supplied populated design:

- Dark application shell and existing typography/tokens.
- Deck list on the left and selected deck detail on the right on desktop.
- Selected deck is visibly highlighted.
- Detail shows deck name, color indicators, total cards out of 50, card entries, and
  an `Edit deck` action.
- Empty state remains available when no decks exist.
- On mobile, stack the deck list above the selected deck detail.

### Editor

- Reuse the existing card search/filter visual language.
- Show current quantities in the card results and selected deck summary.
- Show the active colors derived from the draft.
- Show the total quantity and the 50-card ceiling.
- Show inline feedback when an add is blocked by a third color, the copy limit, or the
  total limit.
- Use real buttons with accessible labels and disabled states.
- Provide a save action and preserve the current error state when save fails.

## Types and Boundaries

Use deliberate public response types rather than importing Drizzle table types into
client components. The client needs only:

- deck summary data,
- selected deck card data,
- catalog card data needed for filtering and validation,
- card quantities keyed by base card ID.

The pure validation and progressive-filtering logic must not open the database and must
be testable without a browser or database connection.

## Tests

Add coverage for:

- 50-card limit acceptance and rejection.
- Two-color acceptance and third-color rejection.
- Three-copy acceptance and fourth-copy rejection.
- Aggregation of one `card_code` across multiple entries.
- Unknown card rejection.
- Progressive color filtering for zero, one, and two active colors.
- Reopening a color after its last selected card is removed.
- Empty draft behavior.
- Ownership-scoped deck reads and writes where practical with existing test patterns.
- Seed assignment producing valid quantities, colors, and no duplicate seed rows on rerun.

## Non-goals

- Automatic two-way sync with IndexedDB guest decks.
- Deck sharing codes.
- Match log changes.
- Additional game rules beyond the three requested rules.
- Automatic seeding for new users.
- A new dependency.
