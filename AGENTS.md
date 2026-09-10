You are an expert Next.js and TypeScript engineer helping me build MHR Dex Web.
Write clean, simple, maintainable code. Prioritize clarity over unnecessary abstraction.
Think like a senior full-stack web developer.

---

## Project Overview

We are building MHR Dex Web, an unofficial companion app for the Marvel Hero Rush (MHR) TCG community in Indonesia. 

The site includes:
- Card database/library & search (filter by color, set, rarity, level, trait, range; detail view also shows power and ability text)
- Deck builder (1–2 color identity rules, max 3 copies per card, deck sharing via deck code, max 50 cards in a deck) — guest decks start in the browser and can be explicitly imported into the authenticated user's cloud account (see Data Layer Rules)
- Post-match log (scores → auto win/lose, opponent name/deck color, dice roll result, turn order, match format, date/time, location) — synced to the user's account

Card browsing is public. Match logs and cloud decks require login. Guests can build decks locally in IndexedDB and can explicitly import a local deck after login. Imports create cloud copies and do not enable automatic two-way synchronization.

Keep the implementation simple and readable.

---

## Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Drizzle ORM + Drizzle Kit + PostgreSQL
- Zustand — client-only state (e.g. deck builder draft, UI state)
- Clerk — authentication (Google & Apple Sign-In), public card browsing; access to decks remains an open decision (see Decision Register)
- Browser `IndexedDB` (native API, no wrapper library) — local, browser-only storage for decks; its contract is documented in `schema_local.md`

Do not introduce new major libraries unless there is a strong reason. Ask before installing anything new.

---

## Development Philosophy

Build feature by feature.

For every feature:
1. Read this file first.
2. Keep the implementation simple.
3. Avoid overengineering.
4. Prefer readable code over clever code.
5. Build the smallest useful version first.
6. Refactor only when repetition appears.
7. Prefer Server Components and Server Actions for data fetching/mutation; only reach for a client component when interactivity genuinely requires it (forms with local state, the deck builder, live score/result previews).

---

## Decision Making

If something is unclear or could be improved, suggest a better approach. If a new library would significantly help, recommend it, explain why, and ask before adding it.

Do not install new libraries without approval.

---

## Architecture

Use this folder structure:

```
app/
  (auth)/
  (dashboard)/
    cards/
    decks/
    log/
    settings/
  api/
components/
lib/
src/db/
drizzle/
store/
types/
```

**app/** holds routes only, using Next.js route groups. `(auth)` contains Clerk sign-in/sign-up pages. `(dashboard)` contains the authenticated app itself, one subfolder per feature area, matching the feature list above. `api/` holds route handlers needed for things Server Actions can't cleanly do — primarily the Midtrans webhook notification handler and Clerk webhooks. Pages compose components and call server actions/queries; they should not contain large reusable UI blocks or business logic inline.

**components/** is for reusable UI. Create a component when it is reused in multiple places, when it makes a page easier to read, or when it represents a clear UI concept. Examples for this app: `CardGridItem`, `CardDetailSheet`, `RarityBadge`, `ColorTag`, `DeckColorIndicator`, `MatchResultPill`. Do not create components too early.

**lib/** holds external service helpers and server-side utilities: `db.ts` (Drizzle client singleton), `clerk.ts`, `cn.ts`, plus query/mutation functions grouped by domain (e.g. `lib/cards.ts`, `lib/decks-local.ts` for the IndexedDB layer). Server Actions live here or colocated in `app/`, never inline business logic in a page component.

**src/db/** holds the Drizzle table definitions and database client wiring. **drizzle/** holds versioned Drizzle Kit migrations. Drizzle is the implementation source of truth for server tables; `schema_cloud.md` is the cloud data contract and `schema_cloud.sql` is its executable PostgreSQL reference. Keep all three aligned when the server schema changes. The catalog uses the actual table names `card_colors`, `card_rarities`, `sets`, `cards`, `traits`, and `card_traits`. Account data uses `users`, `match_logs`, `decks`, `deck_colors`, and `deck_cards`. Cloud deck tables are active for authenticated users. `subscriptions`, `collection_items`, and `price_history` remain schema-only tables outside the current product scope.

**store/** holds Zustand stores for client-only, ephemeral state (e.g. the in-progress deck builder draft before it's saved to IndexedDB, filter UI state). This is not for server data — server data is fetched via Server Components/Server Actions, not duplicated into a client store.

**types/** holds shared TypeScript types, especially ones shared between server queries and client code. Keep database-only types on the server and derive public response types deliberately rather than importing database internals into client bundles.

---

## UI Rules

For any UI task:
- Replicate the provided design exactly.
- Match layout, spacing, padding, font sizes, font hierarchy, colors, border radius, shadows, alignment, and proportions.
- Do not approximate. Do not simplify unless explicitly asked.
- Dark mode is the primary designed experience, not an afterthought toggle.

---

## Styling Rules

Use Tailwind CSS utility classes directly in JSX. Avoid separate CSS files or CSS-in-JS unless Tailwind genuinely cannot express something (e.g. complex keyframe animations).

Reuse class patterns through either a small `cn()`-composed variant helper or extracted components — not through copy-pasted long className strings across multiple files.

Use Tailwind's config to define the app's color tokens (deck colors, rarity scale, semantic colors) as named theme colors rather than hardcoding hex values inline in components.

---

## Image Rule

Use Next.js `<Image>` for all card artwork and static assets — never a raw `<img>` tag, to get automatic optimization or Next.js will complain.

Centralize static/UI assets (logos, icons not covered by the icon library) under `public/` and reference them by path; don't inline base64 images in components.

Card artwork itself comes from the `image_url` field on each card record (server-side), not from a centralized static import — there are too many cards for that pattern to make sense.

---

## Data Layer Rules

- **Cloud catalog:** `card_colors`, `card_rarities`, `sets`, `cards`, `traits`, `card_traits`.
- **Cloud account data:** `users`, `match_logs`. Derive the owner from the authenticated session and enforce ownership in every read and mutation, including Server Actions and Route Handlers.
- **Guest deck persistence:** native browser IndexedDB stores each guest deck as one record in the `decks` object store, including its colors and card entries. This lets one transaction save a complete deck atomically. After login, an explicit import creates a new cloud deck. The local record is retained and is not automatically synchronized. The structure, indexes, upgrade rules, and validation contract are defined in `schema_local.md`.
- **Browser-only boundary:** IndexedDB is accessed only from client-side code. Server Components and Server Actions must not open or depend on it. Do not introduce SQLite, a local card-catalog cache, or offline queues into the web app unless the product scope changes explicitly.
- **Deferred tables:** subscriptions, collection tracking, and price history remain in the SQL reference, but are outside the initial web release.
- `schema_cloud.sql` creates a fresh PostgreSQL database. Existing cloud installations require versioned, data-preserving migrations. IndexedDB upgrades are defined separately in `schema_local.md` and run only inside `onupgradeneeded`.

---

## State Management

- Server data: fetched via Server Components (for reads) and Server Actions (for mutations). Do not duplicate server data into Zustand "just in case" — fetch fresh or revalidate.
- Zustand: client-only, ephemeral UI state — deck builder draft before save, filter panel state, multi-step form state.
- `IndexedDB` (native browser API): the persistence layer for decks specifically. 

---

## TypeScript

- Strict mode.
- No `any`.
- Keep types simple and readable.
- Prefer types inferred from Drizzle table definitions for server-side data; define hand-written types in `types/` only for public response shapes and data Drizzle does not model (IndexedDB deck records, Zustand store shapes, Midtrans webhook payload subsets).

---

## Feature Implementation

When building a feature:
1. Read this file first.
2. Identify the files to change.
3. Keep changes focused.
4. Do not rewrite unrelated code.
5. Follow existing patterns.
6. Make sure the feature works end to end.
7. Fix lint and type errors before finishing.

---

## Secrets

- Never expose secret keys in client code — this includes the PostgreSQL `DATABASE_URL`, Clerk secret key, and Midtrans server key.
- Only `NEXT_PUBLIC_`-prefixed environment variables may be referenced from client components; everything else stays server-only (Server Components, Server Actions, Route Handlers). The Midtrans **client key** is the only Midtrans credential allowed in client code (needed to load Snap.js); the **server key** never leaves the server.
- Midtrans webhook (notification) signature verification is mandatory on the webhook route handler — never trust an unverified notification payload.

---

## Authentication

Use Clerk. Do not build custom auth.

Public visitors may browse `/cards` and build local decks. `/log`, cloud deck operations, and account settings require login. A logged-in user can explicitly import a valid local deck into the account. Route groups such as `(dashboard)` do not define URL paths. Enforce access at the routing boundary and independently authorize every protected server read and mutation.

---

## Communication

Be concise. Explain what changed and how to test it.

---

## Final Reminder

Before every feature:
- Read this file.
- Follow it strictly.
- Build clean, simple code.
- Replicate UI exactly when designs are provided.

## Database Contract

- Use `cards.level` as a required integer from 1 through 6; the former name is `cost`. Preserve existing cloud values when migrating and reject invalid legacy values rather than guessing replacements. Deck records store only `cardId` and `quantity`, so catalog attributes are not duplicated in IndexedDB.
- Card detail includes nullable integer `power`, nullable text `range`, and traits through `traits` / `card_traits`. Text range and multiple traits are provisional representations, not a confirmed game taxonomy.
- Decks have 1–2 distinct identity colors, at most 3 copies per card, and at most 50 total cards. Validate totals, color membership, and nonempty identity atomically on save in the application; row constraints alone do not enforce aggregate rules. Apply the same validation to local save and cloud import. Whether incomplete drafts may be persisted is D3.
- Match logs preserve deck name and color snapshots even if a deck changes or is deleted. Store optional `opponent_name`, `player_score`, `opponent_score`, `turn_order`, `match_format`, and `played_at`; retain `match_date` for legacy records whose time is unknown. Do not invent a midnight timestamp for legacy data.
- Scores are optional nonnegative integers in this revision. The result remains required (`win`, `loss`, `draw`); do not implement automatic result calculation until D4 is resolved. When both date fields exist, validate their consistency in the selected display timezone.
- PostgreSQL `updated_at DEFAULT now()` only sets the initial value; mutations must update it explicitly (or use an agreed database trigger/Drizzle update mapping). Use account-scoped browser records before enabling multiple accounts on one device.
- Deck codes require versioning, validation, and a format decision before implementation (D5). A share code must not expose private account data.

## Decision Register

The original instructions contain conflicting choices. These items are open, not approved requirements:

| ID | Decision still needed | Current handling |
| --- | --- | --- |
| D2 | Are offline card download, collection tracking, subscriptions, and price history still planned? | Keep their cloud tables as deferred scope. The web client has no local catalog cache or offline mutation queue. |
| D3 | Valid power/range values, trait taxonomy, exact versus maximum 50 cards, saved incomplete drafts, and copy limits across card variants | Keep unresolved catalog fields nullable and preserve documented maximums; do not invent official rules. Card level is resolved as a required integer from 1 through 6. |
| D4 | Score meaning and win/loss calculation, draw support, match formats, turn-order values, and display timezone | Store optional raw fields; result stays explicit until these rules are confirmed. |
| D5 | Deck-code encoding/version and import/export behavior | Deck imports create a cloud copy and retain the local record. Automatic synchronization, conflict resolution, and deletion propagation are out of scope. |
| D6 | Midtrans versus RevenueCat and subscription lifecycle | Existing Midtrans guidance and legacy `revenuecat_customer_id` are provider-specific references, not a decision to implement both. Do not implement billing until one approach is selected. |

When a decision is confirmed, replace its open entry and update `schema_cloud.md`, `schema_cloud.sql`, `schema_local.md`, and the application schema as applicable. Never infer product behavior from schema-only tables.
