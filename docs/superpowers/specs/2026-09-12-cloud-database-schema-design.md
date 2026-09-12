# Cloud Database Schema Design

## Goal

Implement the cloud PostgreSQL model described by `ERD.MD` with Drizzle ORM and generate an initial Drizzle Kit migration for a new database. The migration will be generated but not applied.

## Sources Of Truth

- `src/db/schema.ts` is the implementation source of truth.
- `ERD.MD` remains the supplied detailed model.
- `schema_cloud.md` mirrors the cloud data contract required by `AGENTS.md`.
- `schema_cloud.sql` is the executable PostgreSQL reference and must match the generated initial migration.
- `drizzle/` contains the generated migration and Drizzle metadata.

## Tables

The schema contains these 11 tables:

1. `card_colors`
2. `card_rarities`
3. `sets`
4. `cards`
5. `traits`
6. `card_traits`
7. `users`
8. `match_logs`
9. `decks`
10. `deck_colors`
11. `deck_cards`

Column names, nullability, defaults, and database names follow `ERD.MD` exactly. UUID identifiers use `uuid().defaultRandom()`. Timestamp columns use PostgreSQL timestamps with time zones. Date-only fields use PostgreSQL `date` values.

## Database Constraints

Drizzle will represent constraints that PostgreSQL can enforce per row:

- Primary and unique keys from the ERD.
- Composite primary keys for `card_traits`, `deck_colors`, and `deck_cards`.
- Foreign keys with `ON DELETE CASCADE` only for dependent records named by the ERD.
- `cards.level` between 1 and 6.
- `deck_cards.quantity` between 1 and 3.
- Optional match scores are nonnegative when present.
- `match_logs.result` is `win`, `loss`, or `draw`.
- A second player deck color differs from the first.
- A second opponent color requires a first opponent color and differs from it.

Aggregate deck rules cannot be expressed safely as row checks. One or two identity colors, total quantity at most 50, and card color membership remain atomic application-level validations.

## Indexes

The schema includes the ERD indexes:

- `idx_cards_color`
- `idx_cards_rarity`
- `idx_cards_set`
- `idx_cards_level`
- `idx_cards_name`, a GIN expression index over `to_tsvector('simple', cards.name)`
- `idx_match_logs_user`
- `idx_decks_user`

No speculative indexes or Drizzle relations are added.

## Initial Migration

`drizzle-kit generate` creates the baseline migration from `src/db/schema.ts`. The generated SQL is then completed with:

- `CREATE EXTENSION IF NOT EXISTS pgcrypto` before tables that use `gen_random_uuid()`.
- Seed rows for `card_colors`: blue, red, yellow, green, purple, and orange. Purple and orange are inactive.
- Seed rows for `card_rarities`: ER, GR, MR, PR, R, SEC, SR, TR, and UR in the documented priority order.

The initial migration targets an empty database. It does not include a legacy `cost` to `level` rename because the user confirmed there is no existing database to preserve.

## Verification

- A focused schema contract test checks all expected table names and critical constraints/indexes exposed by Drizzle metadata.
- `drizzle-kit generate` must complete without prompts or errors.
- `drizzle-kit check` must accept the generated migration history.
- The generated SQL is inspected for all 11 tables, required indexes, `pgcrypto`, and lookup seeds.
- `npm test`, `npx tsc --noEmit`, and `npm run lint -- --quiet` must pass.
- No migration command is run against `DATABASE_URL`.

## Scope Boundaries

- No query layer, repositories, Server Actions, seed command, or runtime migration runner is added.
- No IndexedDB schema is changed.
- No database is created, reset, or migrated during this task.
