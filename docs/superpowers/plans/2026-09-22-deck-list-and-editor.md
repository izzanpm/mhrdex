# Deck List and Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated populated deck list, direct-create-to-edit flow, seeded demo decks for `admin@mail.com`, and proactive deck-rule enforcement.

**Architecture:** Keep `/decks` as a server-rendered list/detail page selected by `?deck=<id>`. Create an empty cloud draft through a Server Action and redirect to `/decks/[deckId]/edit`, where a client editor owns only the in-progress card quantities and calls a server mutation to save. Put pure deck-rule and color-filter logic in a database-free module shared by the editor and server mutation, while all catalog resolution and ownership checks remain server-side.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, Drizzle ORM, PostgreSQL, Better Auth, Tailwind CSS, native Node test runner via `tsx`.

**Spec:** `specs/deck-list-and-editor.md`

## Global Constraints

- Use the existing dependencies; do not install a new library.
- Resolve Better Auth users through `users.better_auth_user_id` before every deck read or mutation; provision only the current Better Auth identity when its local mapping does not exist.
- Never trust a client-provided application user ID.
- Enforce at most 50 total cards, at most two distinct colors, and at most three copies per `card_code`.
- Allow an empty draft because create redirects directly into edit mode.
- Derive `deck_colors` from selected catalog card colors; an empty draft has no color rows.
- Update `decks.updated_at` explicitly during deck saves.
- Keep IndexedDB out of Server Components, Server Actions, and cloud deck queries.
- Preserve the existing empty state when an authenticated user has no decks.
- Use `next/image` for any rendered card artwork and preserve the existing dark design tokens.
- Do not commit changes unless explicitly requested.

---

### Task 1: Add Shared Deck Types and Rule Logic

**Files:**
- Create: `types/deck.ts`
- Create: `lib/deck-validation.ts`
- Test: `lib/deck-validation.test.ts`
- Modify: `types/card.ts`
- Modify: `lib/cards.ts`
- Modify: existing card fixtures in `components/card-library.test.tsx`, `app/(dashboard)/decks/page.test.tsx`, and any other TypeScript fixture that constructs `CardListItem`

**Interfaces:**
- `CardListItem` gains `cardId: string`, the base `cards.id`; its existing `id` remains the selected `card_variants.id` used by the card library.
- `DeckCardDraft` is `{ cardId: string; quantity: number }`.
- `DeckCatalogCard` is `{ cardId: string; cardCode: string; colorCode: string }`.
- `DeckValidationResult` is either `{ valid: true; total: number; colorCodes: string[] }` or `{ valid: false; code: string; message: string }`.
- `getDraftColorCodes(entries, catalog): string[]` returns distinct colors for entries with positive quantity.
- `getAllowedColorCodes(entries, catalog, allColorCodes): string[]` returns all catalog colors until two colors are active, then only the active colors.
- `getCardAddBlockReason(entry, entries, catalog): "max_cards" | "max_copies" | "max_colors" | null` explains why an increment is blocked.
- `canAddDeckCard(entry, entries, catalog): boolean` checks the third-color, three-copy, and 50-card limits for one proposed addition.
- `validateDeckContents(entries, catalog): DeckValidationResult` performs the complete server-safe validation.

- [ ] **Step 1: Extend the public card shape with the base card ID.**

  Add `cardId` to `CardListItem`. In `lib/cards.ts`, select `cards.id` as `cardId` and include it in each mapped result. Update all test fixtures with a base card ID instead of using a variant ID as the deck identity.

- [ ] **Step 2: Write failing rule and progressive-filter tests.**

  Use the native `node:test` style already used in `lib/*.test.ts`. Cover these concrete cases:

  ```ts
  const catalog = [
    { cardId: "red-1", cardCode: "R-001", colorCode: "red" },
    { cardId: "red-2", cardCode: "R-002", colorCode: "red" },
    { cardId: "blue-1", cardCode: "B-001", colorCode: "blue" },
    { cardId: "green-1", cardCode: "G-001", colorCode: "green" },
  ];

  assert.equal(
    validateDeckContents([{ cardId: "red-1", quantity: 3 }], catalog).valid,
    true,
  );
  assert.equal(
    validateDeckContents([{ cardId: "red-1", quantity: 4 }], catalog).valid,
    false,
  );
  assert.equal(
    validateDeckContents(
      [
        { cardId: "red-1", quantity: 1 },
        { cardId: "blue-1", quantity: 1 },
        { cardId: "green-1", quantity: 1 },
      ],
      catalog,
    ).valid,
    false,
  );
  assert.equal(
    validateDeckContents([{ cardId: "red-1", quantity: 51 }], catalog).valid,
    false,
  );
  assert.deepEqual(
    getAllowedColorCodes(
      [
        { cardId: "red-1", quantity: 1 },
        { cardId: "blue-1", quantity: 1 },
      ],
      catalog,
      ["red", "blue", "green"],
    ),
    ["red", "blue"],
  );
  assert.equal(
    canAddDeckCard(
      { cardId: "green-1", quantity: 1 },
      [
        { cardId: "red-1", quantity: 1 },
        { cardId: "blue-1", quantity: 1 },
      ],
      catalog,
    ),
    false,
  );
  ```

  Also test that removing the last entry of one color makes that color available again and that an empty draft is valid.

- [ ] **Step 3: Implement the smallest pure rule module.**

  Build maps from `cardId` to catalog metadata and aggregate totals by `cardCode`. Reject non-integer or non-positive persisted quantities, unknown card IDs, totals above 50, aggregate code quantities above 3, and more than two distinct colors. Keep the progressive filter database-free and return stable catalog order.

- [ ] **Step 4: Run the focused test and typecheck.**

  Run `npx tsx --test lib/deck-validation.test.ts` and `npx tsc --noEmit`. The new tests must pass and existing card fixture types must remain valid.

### Task 2: Add Ownership-Scoped Deck Queries and Server Actions

**Files:**
- Create: `lib/decks.ts`
- Create: `lib/deck-actions.ts`
- Create: `types/deck.ts` additions for `DeckSummary`, `DeckCardView`, `DeckDetail`, `DeckEditorCard`, `SaveDeckInput`, and `SaveDeckResult`

**Interfaces:**
- `getOwnedDecks(sessionUserId: string): Promise<DeckSummary[]>`
- `getOwnedDeck(sessionUserId: string, deckId: string): Promise<DeckDetail | null>`
- `getDeckEditorCards(): Promise<DeckEditorCard[]>`
- `createDeck(): Promise<never>` as a Server Action that redirects to `/decks/[id]/edit`
- `saveDeck(deckId: string, input: unknown): Promise<SaveDeckResult | never>` as a Server Action that narrows untrusted input to `SaveDeckInput`, returns a serializable error, or redirects after success

- [ ] **Step 1: Define public deck response types.**

  Keep Drizzle row types server-only. Define summary data with `id`, `name`, `cardCount`, and `colorCodes`; selected detail data adds `cards` containing base `cardId`, `cardCode`, `name`, `colorCode`, `quantity`, and one representative `imageUrl` or `null`. Define editor cards using the existing card-library display fields plus required `cardId` and `colorCode`.

- [ ] **Step 2: Implement the application-user resolver.**

  In `lib/decks.ts`, query `users` by `betterAuthUserId` and return the application UUID. If no mapping exists, read the Better Auth user record and insert a local `users` row with `onConflictDoNothing`, then re-read after a conflict. Do not auto-link unrelated legacy rows and do not accept an application user ID from callers that originate in the browser.

- [ ] **Step 3: Implement the owned deck list query.**

  Query `decks` filtered by the resolved application user ID. Left join `deck_colors` and `deck_cards`, aggregate colors and quantities in TypeScript, and order by `updated_at` descending. Return one summary per deck, including zero-card and zero-color drafts.

- [ ] **Step 4: Implement the owned deck detail query.**

  Reject malformed UUIDs before querying PostgreSQL. Query the requested deck with the same owner predicate. Join `deck_cards` to `cards` and use a deterministic representative `card_variants` row for `imageUrl`. Return `null` for an absent, foreign, or malformed deck. Aggregate its color codes and total quantity without inventing colors for an empty draft.

- [ ] **Step 5: Implement editor catalog loading.**

  Reuse the existing catalog query and expose the base `cardId` on each result. Deduplicate variants by base card ID for the editor while retaining the first deterministic representative variant for display. Keep the full variant list available to the public card library behavior.

- [ ] **Step 6: Implement `createDeck` as a Server Action.**

  Add the `"use server"` directive to `lib/deck-actions.ts`. Require the current session with `requireAuthSession`, resolve or provision the application user, insert `decks` with name `New deck`, and call `redirect(`/decks/${deck.id}/edit`)` outside the database error `try` block. Do not insert `deck_colors` or `deck_cards` for the initial draft.

- [ ] **Step 7: Implement the atomic `saveDeck` Server Action.**

  Reject malformed UUIDs before resolving the session mapping. Require the current session and resolve ownership inside the transaction. Narrow the unknown action input by checking the deck name, entry array, base card IDs, and integer quantities before querying. Resolve submitted base card IDs from `cards` and validate them with `validateDeckContents`. On success, delete and reinsert the deck's `deck_cards`, replace `deck_colors` with the returned distinct colors, update the deck name and `updatedAt`, call `revalidatePath("/decks")`, and redirect to `/decks?deck=<id>`. On validation failure or an unexpected database exception, return a generic serializable error before changing any rows. Return a generic not-found error for foreign/missing decks.

- [ ] **Step 8: Run focused checks.**

  Run `npx tsc --noEmit` and the existing `npm test` suite. No schema migration should be generated because the existing `decks`, `deck_colors`, and `deck_cards` tables support empty drafts and the requested rules are aggregate application rules.

### Task 3: Add the Admin Demo Deck Seed

**Files:**
- Create: `scripts/seed-decks.ts`
- Create: `scripts/seed-decks.test.ts`
- Modify: `package.json`

**Interfaces:**
- `SeedCard` is `{ cardId: string; cardCode: string; colorCode: string }`.
- `buildSeedDecks(catalog: readonly SeedCard[]): SeedDeck[]`
- `SeedDeck` is `{ name: string; entries: DeckCardDraft[] }`.
- Stable seed configurations are `Ember Avengers` (`red` + `yellow`, 37 cards),
  `Cosmic Tempo` (`blue` + `green`, 21 cards), and `Dark Reign Control`
  (`red` + `green`, 14 cards).
- The executable accepts one email argument and runs `npm run seed:decks -- admin@mail.com`.

- [ ] **Step 1: Write deterministic seed-builder tests.**

  Build a small in-memory catalog with at least three colors and enough cards. Assert that three seed decks are returned, every deck has at most two colors, every quantity is 1 through 3, every total is at most 50, and running `buildSeedDecks` twice with the same catalog produces deep-equal output.

- [ ] **Step 2: Implement deterministic demo assignments.**

  Use stable array ordering and index arithmetic rather than `Math.random()`. Create three named examples with varied totals matching the populated design closely. Select only catalog cards whose colors fit each deck's one- or two-color identity, ensure both configured colors are represented, then call `validateDeckContents` before returning assignments. Keep the seed data arbitrary and readable; do not add a general deck generator.

- [ ] **Step 3: Implement the database command.**

  Load `dotenv/config`, read `process.argv[2]`, fail with a concise usage error if no email is provided, find the Better Auth `user` by email, resolve or explicitly create the target application `users` mapping, and load base cards plus a representative variant. For each stable seed name, use an account-scoped PostgreSQL advisory transaction lock, skip an existing owned deck, and insert missing `decks`, `deck_colors`, and `deck_cards` rows in one transaction. Export the pure builder without running the database command when the module is imported by `node:test`; execute `main()` only for the CLI entrypoint.

- [ ] **Step 4: Register the command.**

  Add `"seed:decks": "tsx scripts/seed-decks.ts"` to `package.json` and add both new test files to the explicit `npm test` script. Reuse the existing script error style and set `process.exitCode = 1` on failure without printing credentials or database URLs.

- [ ] **Step 5: Run the pure seed test.**

  Run `npx tsx --test scripts/seed-decks.test.ts`. If local database environment variables and the active account are available, run `npm run seed:decks -- admin@mail.com`, then rerun it and verify that the second run reports skipped existing seed decks rather than creating duplicates.

### Task 4: Implement the Populated Deck List

**Files:**
- Create: `components/deck-list-screen.tsx`
- Modify: `app/(dashboard)/decks/page.tsx`
- Modify: `app/(dashboard)/decks/page.test.tsx`

**Interfaces:**
- `DeckListScreen` receives the authenticated user, `decks: DeckSummary[]`, and `selectedDeck: DeckDetail | null`.
- `DeckListScreen` renders the `createDeck` action form and links to `/decks?deck=<id>` and `/decks/[id]/edit`.

- [ ] **Step 1: Replace the static page data with server queries.**

  In `app/(dashboard)/decks/page.tsx`, call `requireAuthSession`, parse the optional `searchParams.deck`, fetch owned summaries, select the requested owned deck or the first deck, and render `DeckListScreen`. Keep the existing sidebar and account controls.

- [ ] **Step 2: Add the empty and populated screen states.**

  Keep the current empty-state copy and `New deck` action when the list is empty. For populated data, match the supplied dark layout with the deck list on the left and selected detail on the right. Highlight the active deck and display name, color indicators, total `/50`, card names, and quantities.

- [ ] **Step 3: Add real navigation and creation.**

  Use links for selection and editing. Use a server form action bound to `createDeck` for `New deck`; do not create a client-side fake deck. Make the selected deck query URL-stable on refresh.

- [ ] **Step 4: Make the card detail responsive and accessible.**

  Use a stacked layout on mobile, semantic headings, visible focus styles, meaningful link/button labels, and `aria-current` for the selected deck. Render artwork with `next/image` when `imageUrl` is present and a token-based placeholder when it is not.

- [ ] **Step 5: Update route tests.**

  Replace assertions for the old static `/decks/new` link and empty-only markup with tests for empty state, three populated summaries, selected detail, query links, edit links, and the create form. Keep a separate assertion that `/decks/new/page.tsx` exists and redirects to `/decks`.

- [ ] **Step 6: Run the route tests.**

  Run `npx tsx --test "app/(dashboard)/decks/page.test.tsx"` and `npx tsc --noEmit`.

### Task 5: Make the Dynamic Editor Functional

**Files:**
- Create: `app/(dashboard)/decks/[deckId]/edit/page.tsx`
- Modify: `components/deck-builder-screen.tsx`
- Modify: `components/deck-builder-card-search.tsx`
- Modify: `components/card-grid-item.tsx` only where quantity/disabled presentation is required by the existing component API
- Modify: `app/(dashboard)/decks/new/page.tsx`
- Modify: `app/(dashboard)/decks/page.test.tsx`

**Interfaces:**
- `DeckBuilderScreen` receives `deck: DeckDetail`, `cards: DeckEditorCard[]`, and `user: AuthenticatedUser`.
- `DeckBuilderCardSearch` receives `cards`, `draftEntries`, `allColorCodes`, and `onQuantityChange(cardId, delta)`.
- `onQuantityChange` accepts `-1` or `1`, removes an entry at zero, and refuses a change that fails `canAddDeckCard`.

- [ ] **Step 1: Add the dynamic edit page.**

  Require the authenticated session, parse `params.deckId`, load the owned deck and editor catalog, call `notFound()` for an absent/foreign deck, and render the interactive builder. Use the current server/client boundary: data loads on the server, draft quantities live only in the client editor.

- [ ] **Step 2: Convert the builder to a controlled draft.**

  Initialize a `Map`-like array of `DeckCardDraft` from the selected deck. Keep the deck name, quantities, query, and filters in the client component. Derive total quantity and active colors from the current draft rather than duplicating server data in Zustand.

- [ ] **Step 3: Wire progressive search filtering.**

  Reuse `filterCards` and the existing deferred search query. Before rendering results, call `getAllowedColorCodes`; when two colors are active, hide all third-color cards. Keep all colors visible while zero or one active color remains so the user can intentionally choose the second color.

- [ ] **Step 4: Wire plus/minus controls.**

  Use `getCardAddBlockReason` before every increment and derive `canAddDeckCard` from the same result. Disable plus at quantity three, at total 50, or when the next card would introduce a third active color. Decrement quantities and remove zero rows so deleting the last card of a color reopens that color. Add the returned reason in accessible text near blocked controls.

- [ ] **Step 5: Wire save and error handling.**

  Submit `{ name, cards }` to `saveDeck`. Show returned validation and unexpected-save messages without discarding the local draft. On success, rely on the action redirect to `/decks?deck=<id>`. Disable the save button while the action is pending.

- [ ] **Step 6: Make `/decks/new` a redirect.**

  Replace the old builder page body with `redirect("/decks")`, so the only create path is the real action followed by `/decks/[deckId]/edit`.

- [ ] **Step 7: Update builder tests.**

  Replace empty/static expectations with tests for initial quantities, dynamic card count, plus/minus changes, blocked third colors, blocked fourth copies, blocked card 51, reopened colors after removal, filtered results, save action wiring, and empty draft rendering.

- [ ] **Step 8: Run focused editor checks.**

  Run `npx tsx --test "app/(dashboard)/decks/page.test.tsx" lib/deck-validation.test.ts` and `npx tsc --noEmit`.

### Task 6: Run the Full Verification Suite

**Files:**
- No source files; verification only

- [ ] **Step 1: Run all tests.**

  Run `npm test`. Confirm the existing card library, auth, schema, and route tests remain green alongside the new deck tests.

- [ ] **Step 2: Run static checks.**

  Run `npx tsc --noEmit` and `npm run lint -- --quiet`. Fix all errors instead of suppressing them.

- [ ] **Step 3: Build the application.**

  Run `npm run build` to verify the new dynamic route, Server Actions, and client boundary compile in a production build.

- [ ] **Step 4: Verify the database flow when configured.**

  With the existing local PostgreSQL environment, run `npm run seed:decks -- admin@mail.com`, inspect `/decks`, click each seeded deck, edit one card within the limits, and attempt one blocked third-color, fourth-copy, and 51st-card action. Confirm the seed command is idempotent on a second run.

- [ ] **Step 5: Check the final diff.**

  Run `git diff --check` and inspect `git status --short`. Do not touch unrelated existing worktree changes.
