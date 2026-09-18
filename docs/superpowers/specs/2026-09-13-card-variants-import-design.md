# Card Variants And Catalog Import Design

## Goal

Import `cards.en.json` into PostgreSQL without losing rarity or artwork variants. The completed catalog contains 288 base cards, 357 variants, 9 sets, 30 traits, and 595 card-trait relationships. The public Card Library at `/` renders one grid item per variant.

## Source Data

The scraper output has schema version 2 and language `en`. Each base card contains shared identity and rules fields. Each nested variant contains rarity, level, power, range, image URL, and source page URL.

The current file has these verified properties:

- 288 unique `card_code` values.
- 357 variants with unique `(card_code, rarity_code)` pairs.
- 227 cards have one variant, 53 have two, and 8 have three.
- Variant stats do not differ within a base card in this revision, but the importer must preserve the source structure rather than rely on that coincidence.
- Every color and rarity exists in the current lookup seeds.
- Every level is an integer from 1 through 6.
- `range` is numeric in JSON and must be converted to text for PostgreSQL.
- All image URLs are signed URLs from `marvel-tcg.janime.cn` and expire about 24 hours after scraping.

## Cloud Schema

### `sets`

Remove required column `name`. The scraper only provides `set_code`, and the application must not invent display names. Keep:

- `id uuid primary key default gen_random_uuid()`
- `code text not null unique`
- `release_date date null`
- `description text null`

### `cards`

Keep one row per game card code. Keep:

- `id`
- `card_code`
- `name`
- `color_code`
- `card_type`
- `ability_text`
- `flavor_text`
- `set_id`
- `created_at`
- `updated_at`

Remove variant-owned columns:

- `rarity_code`
- `level`
- `power`
- `range`
- `image_url`

Remove the card-level rarity and level indexes and the card-level check with those columns.

`deck_cards.card_id` continues to reference the base `cards` row. Rarity and artwork variants do not change deck identity or copy-count rules.

### `card_variants`

Create:

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key; generated |
| `card_id` | `uuid` | Required; references `cards.id`; cascades on delete |
| `rarity_code` | `text` | Required; references `card_rarities.code` |
| `level` | `integer` | Required; between 1 and 6 |
| `power` | `integer` | Optional |
| `range` | `text` | Optional |
| `image_url` | `text` | Optional permanent local or hosted path |
| `source_page_url` | `text` | Optional scraper provenance |

Add a unique constraint on (`card_id`, `rarity_code`). Add indexes on `card_id`, `rarity_code`, and `level` for joins and catalog filters.

## Versioned Migration

Generate a new Drizzle migration from the updated TypeScript schema. Preserve any existing card rows before dropping columns by inserting one `card_variants` row per old card from the old rarity, level, power, range, and image values. The current local database has no card rows, but the migration must remain data-preserving for another installation at the same baseline.

After the backfill, remove the five variant columns from `cards` and remove `sets.name`. Do not modify the already-applied initial migration. Apply only the new migration through `drizzle-kit migrate`.

The migration is valid only if the old card rows have valid rarity and level values. Existing constraints already enforce those requirements, so no guessed fallback is needed.

## Image Download

Before database writes, download each variant image while its signed URL is valid. Use native `fetch` and Node filesystem APIs with no new dependency.

Store images under `public/cards/` using deterministic lowercase names:

```text
<card-code>-<rarity-code>.<extension>
```

Determine the extension from the HTTP `content-type`; accept known image types only. Write to a temporary file and rename after the response completes so interrupted downloads do not leave apparently valid assets. Existing nonempty files are reused, making repeat imports independent of expired source URLs.

Store the public path, such as `/cards/bp01-001-mr.webp`, in `card_variants.image_url`. Keep the original API endpoint in `source_page_url`. The signed image URL itself is not persisted.

If an image is missing and its signed URL has expired, fail before the database transaction and instruct the operator to regenerate `cards.en.json`. Do not import a partial catalog silently.

The local asset strategy is deliberately simple. Move images to object storage when repository size, deployment bundle size, or CDN requirements become a measured problem. That migration would upload the same deterministic files and replace `image_url` values with allowlisted hosted URLs.

## Idempotent Import

Add one TypeScript import command that defaults to `cards.en.json`. It validates untrusted JSON before downloading or writing data. Validation covers root metadata, complete card and variant fields, unique natural keys, known colors and rarities, level bounds, nonempty traits, URL protocols, and supported language/schema version.

Use these conflict keys:

- `sets.code`
- `traits.name`
- `cards.card_code`
- `card_variants(card_id, rarity_code)`
- `card_traits(card_id, trait_id)`

Run database writes in one transaction after all images are ready:

1. Upsert the 9 set codes.
2. Upsert the 30 trait names.
3. Upsert each base card and return its ID.
4. Replace that card's trait links with the validated source list.
5. Upsert each variant and its local image path.

Upserts update mutable scraped fields and preserve generated IDs. Repeating the same import produces the same row counts and no duplicates. The importer does not delete cards absent from a later scrape because absence could mean a partial source response. Destructive catalog synchronization requires a separate explicit command if it becomes necessary.

The transaction prevents partial database updates. Image files downloaded before a failed transaction may remain unused; a later run safely reuses them.

## Card Library Query

Update `getCards()` to join `cards` with `card_variants` and return one list item per variant. Use the variant ID as the React key. Search still matches the shared name and `card_code`. The grid receives the permanent local image path, so the existing Next.js `Image` path policy remains unchanged.

Order by card code, then rarity sort order. The initial result count after import is 357.

Set filters use `sets.code` as their display value until verified set names are available from a future source.

Card detail behavior remains out of scope.

## Contracts And Documentation

Keep these representations aligned:

- `src/db/schema.ts`
- Versioned files under `drizzle/`
- `schema_cloud.md`
- `schema_cloud.sql`
- `ERD.MD`
- Database rules in `AGENTS.md`

`schema_cloud.sql` remains the executable reference for a fresh database. It must contain the final schema directly, not the incremental backfill logic.

## Testing And Verification

Use TDD for schema metadata, parser validation, deterministic image naming, and importer planning. Do not call the network or mutate PostgreSQL from unit tests.

Final verification must include:

- Unit tests pass.
- TypeScript and lint pass.
- Production build passes.
- `drizzle-kit check` passes.
- The new migration applies successfully.
- The importer reports 288 cards, 357 variants, 9 sets, and 30 traits.
- SQL verification confirms those counts and no duplicate natural keys.
- Running the importer a second time leaves counts unchanged.
- The Card Library returns 357 items and image paths resolve locally.
- `git diff --check` passes.

No secrets or signed image tokens may be printed in logs or committed outside the existing scraper JSON.
