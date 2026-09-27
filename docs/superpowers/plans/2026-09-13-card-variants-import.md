# Card Variants And Catalog Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize scraped card variants, download their images locally, import the complete English catalog idempotently, and render all 357 variants in the public Card Library.

**Architecture:** `cards` stores shared game-card identity while `card_variants` stores printing-specific rarity, stats, artwork, and provenance. A native TypeScript importer validates `cards.en.json`, downloads deterministic local images, then performs all PostgreSQL upserts in one transaction. The Card Library joins base cards to variants and displays one grid item per variant.

**Tech Stack:** TypeScript, Next.js 16 App Router, Drizzle ORM/Kit 1.0 RC, PostgreSQL, native Node filesystem APIs, native `fetch`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-13-card-variants-import-design.md`

## Global Constraints

- Use SQL table name `card_variants`.
- Remove `sets.name`; do not invent set names.
- Preserve existing card data in the versioned migration before dropping old variant columns.
- Do not modify the already-applied initial migration.
- Download images to `public/cards/` and persist only local `/cards/...` paths.
- Do not persist signed image URLs.
- Use no new dependency.
- Validate scraped JSON before network or database writes.
- Keep `deck_cards.card_id` referencing base `cards` rows.
- Do not delete catalog records merely because a later scrape omits them.
- Do not stage or commit; the user handles Git manually.

## File Map

- Modify `src/db/schema.ts`: final Drizzle definitions for `sets`, `cards`, and `cardVariants`.
- Modify `src/db/schema.test.ts`: schema metadata checks for the normalized model.
- Create one new generated folder under `drizzle/`: incremental migration and final snapshot.
- Modify `schema_cloud.md`, `schema_cloud.sql`, `ERD.MD`, and `AGENTS.md`: synchronized database contracts.
- Create `scripts/cards-import.ts`: validation, deterministic filenames, image downloading, and transactional upserts.
- Create `scripts/cards-import.test.ts`: parser and image-path behavior tests.
- Create `scripts/import-cards.ts`: minimal CLI entry point.
- Modify `package.json`: test registration and `import:cards` command.
- Modify `lib/cards.ts`: joined variant query.
- Modify `types/card.ts`: variant-oriented Card Library response.
- Modify `components/card-library.test.tsx`: variant rendering contract.
- Create `public/cards/*`: 357 downloaded image assets.

---

### Task 1: Normalize The Drizzle Schema

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/schema.test.ts`

**Interfaces:**
- Produces: exported `cardVariants` Drizzle table.
- Produces: `cards` without `rarityCode`, `level`, `power`, `range`, or `imageUrl`.
- Produces: `cardSets` without `name`.
- Consumed later by: migration generation, importer, and `getCards()`.

- [ ] **Step 1: Update the schema metadata test first**

Change expected table names to include `card_variants`. Add assertions equivalent to:

```ts
const variantsConfig = getTableConfig(cardVariants);

assert.equal(getTableConfig(cardSets).columns.some((column) => column.name === "name"), false);
assert.equal(getTableConfig(cards).columns.some((column) => column.name === "rarity_code"), false);
assert.equal(getTableConfig(cards).columns.some((column) => column.name === "level"), false);
assert.deepEqual(
  variantsConfig.columns.map((column) => column.name),
  [
    "id",
    "card_id",
    "rarity_code",
    "level",
    "power",
    "range",
    "image_url",
    "source_page_url",
  ],
);
assert.ok(variantsConfig.uniqueConstraints.some((constraint) => constraint.name === "card_variants_card_rarity_unique"));
assert.ok(variantsConfig.checks.some((constraint) => constraint.name === "card_variants_level_check"));
assert.deepEqual(
  variantsConfig.indexes.map((index) => index.config.name).sort(),
  ["idx_card_variants_card", "idx_card_variants_level", "idx_card_variants_rarity"],
);
```

- [ ] **Step 2: Run the schema test and verify RED**

Run: `npx tsx --test src/db/schema.test.ts`

Expected: FAIL because `cardVariants` does not exist and old columns remain.

- [ ] **Step 3: Implement the normalized schema**

Define the table using the existing array callback style:

```ts
export const cardVariants = pgTable(
  "card_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    rarityCode: text("rarity_code")
      .notNull()
      .references(() => cardRarities.code),
    level: integer("level").notNull(),
    power: integer("power"),
    range: text("range"),
    imageUrl: text("image_url"),
    sourcePageUrl: text("source_page_url"),
  },
  (table) => [
    unique("card_variants_card_rarity_unique").on(
      table.cardId,
      table.rarityCode,
    ),
    index("idx_card_variants_card").on(table.cardId),
    index("idx_card_variants_rarity").on(table.rarityCode),
    index("idx_card_variants_level").on(table.level),
    check("card_variants_level_check", sql`${table.level} between 1 and 6`),
  ],
);
```

Remove `name` from `cardSets`. Remove variant-owned fields and their indexes/check from `cards`.

- [ ] **Step 4: Run focused and full checks**

Run: `npx tsx --test src/db/schema.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: FAIL only where the old card fields are still consumed. Record those sites for Task 4; do not add compatibility fields.

- [ ] **Step 5: Review checkpoint**

Review only `src/db/schema.ts` and `src/db/schema.test.ts`. Do not stage or commit.

---

### Task 2: Generate The Data-Preserving Migration And Synchronize Contracts

**Files:**
- Create: one Drizzle-generated migration folder under `drizzle/`
- Modify: generated `migration.sql` in that folder
- Modify: `schema_cloud.md`
- Modify: `schema_cloud.sql`
- Modify: `ERD.MD`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: normalized Drizzle schema from Task 1.
- Produces: an incremental migration accepted by `drizzle-kit migrate`.
- Produces: fresh-install SQL matching the final schema.

- [ ] **Step 1: Verify migration history before generation**

Run: `npx drizzle-kit check`

Expected: `Everything's fine` for the existing migration history.

- [ ] **Step 2: Generate one incremental migration**

Run: `npx drizzle-kit generate --name=normalize_card_variants`

Expected: one new timestamped folder containing `migration.sql` and `snapshot.json`. Record the exact generated path in the execution report.

- [ ] **Step 3: Add the existing-card backfill before generated column drops**

Insert this statement after `card_variants` and its foreign keys exist, but before old `cards` columns are dropped:

```sql
INSERT INTO "card_variants" (
  "card_id",
  "rarity_code",
  "level",
  "power",
  "range",
  "image_url"
)
SELECT
  "id",
  "rarity_code",
  "level",
  "power",
  "range",
  "image_url"
FROM "cards";
```

Do not edit the generated snapshot by hand.

- [ ] **Step 4: Update the human and executable contracts**

Apply the schema described in the spec to `schema_cloud.md` and `ERD.MD`. Update `schema_cloud.sql` as a fresh-install reference, with `card_variants` created directly and no backfill statement. Update `AGENTS.md` so level, power, range, rarity, and artwork are variant attributes while deck cards continue to reference base cards.

- [ ] **Step 5: Verify migration and representation alignment**

Run: `npx drizzle-kit check`

Expected: `Everything's fine`.

Run a table-name coverage check for all 12 tables across `src/db/schema.ts`, the final snapshot, `schema_cloud.md`, and `schema_cloud.sql`.

Run: `git diff --check -- src/db/schema.ts src/db/schema.test.ts drizzle schema_cloud.md schema_cloud.sql ERD.MD AGENTS.md`

Expected: exit 0, allowing informational line-ending warnings.

- [ ] **Step 6: Review checkpoint**

Confirm the initial migration is byte-for-byte unchanged and the new migration backfills before dropping columns. Do not stage or commit.

---

### Task 3: Build The Validated Idempotent Importer And Image Downloader

**Files:**
- Create: `scripts/cards-import.ts`
- Create: `scripts/cards-import.test.ts`
- Create: `scripts/import-cards.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `parseCatalog(value: unknown): ScrapedCatalog`.
- Produces: `getVariantImageName(cardCode: string, rarityCode: string, contentType: string): string`.
- Produces: `prepareCardImages(catalog: ScrapedCatalog, outputDirectory: string): Promise<Map<string, string>>`.
- Produces: `importCatalog(catalog: ScrapedCatalog, imagePaths: Map<string, string>): Promise<ImportCounts>`.
- CLI: `npm run import:cards -- [optional-json-path]`.

- [ ] **Step 1: Write parser and filename tests first**

Use a complete one-card fixture with one variant. Test:

```ts
test("parses a complete supported catalog", () => {
  const catalog = parseCatalog(validCatalog);
  assert.equal(catalog.cards[0].variants[0].rarityCode, "MR");
});

test("rejects duplicate card and variant natural keys", () => {
  assert.throws(() => parseCatalog(duplicateCatalog), /duplicate/i);
});

test("rejects unknown colors, rarities, and invalid levels", () => {
  assert.throws(() => parseCatalog(invalidCatalog), /color|rarity|level/i);
});

test("derives deterministic safe image filenames", () => {
  assert.equal(
    getVariantImageName("BP01-001", "MR", "image/webp"),
    "bp01-001-mr.webp",
  );
  assert.throws(
    () => getVariantImageName("BP01-001", "MR", "text/html"),
    /unsupported image content type/i,
  );
});
```

- [ ] **Step 2: Register and run the tests to verify RED**

Add `scripts/cards-import.test.ts` to the existing `test` script and add:

```json
"import:cards": "tsx scripts/import-cards.ts"
```

Run: `npx tsx --test scripts/cards-import.test.ts`

Expected: FAIL because importer functions do not exist.

- [ ] **Step 3: Implement strict native validation**

Parse `unknown` data using object, string, integer, nullable-string, array, URL, uniqueness, and enum guards. Accept only `schema_version === 2`, `language === "en"`, colors `blue|red|yellow|green`, seeded rarity codes, levels 1 through 6, HTTP(S) source URLs, and nonempty variants/traits.

Map snake-case JSON into these internal interfaces:

```ts
export type ScrapedVariant = {
  rarityCode: string;
  level: number;
  power: number | null;
  range: number | null;
  imageUrl: string;
  sourcePageUrl: string;
};

export type ScrapedCard = {
  cardCode: string;
  name: string;
  colorCode: string;
  setCode: string;
  cardType: string;
  traits: string[];
  abilityText: string | null;
  flavorText: string | null;
  variants: ScrapedVariant[];
};
```

- [ ] **Step 4: Implement deterministic atomic image downloads**

Support `image/jpeg`, `image/png`, and `image/webp`. Reuse an existing nonempty deterministic file. Otherwise fetch the signed URL, reject non-2xx or unsupported content, write `<filename>.tmp`, then rename it. Download in batches of eight to avoid 357 simultaneous requests. Return map keys in the form `${cardCode}|${rarityCode}` and values in the form `/cards/<filename>`.

- [ ] **Step 5: Implement transactional idempotent upserts**

After all images are prepared, call `db.transaction`. Use `onConflictDoUpdate` for sets, traits, cards, and variants. For each imported card, delete its existing `card_traits` rows and insert the validated current links. Use `onConflictDoNothing` only for the composite card-trait key.

Return literal counts:

```ts
export type ImportCounts = {
  cards: number;
  variants: number;
  sets: number;
  traits: number;
  cardTraits: number;
};
```

Do not delete cards or variants missing from the source file.

- [ ] **Step 6: Implement the minimal CLI**

Read `process.argv[2] ?? "cards.en.json"`, parse JSON, prepare images in `public/cards`, import rows, and print only counts. On failure, print the error message without URL query strings or tokens and set `process.exitCode = 1`.

- [ ] **Step 7: Run focused checks**

Run: `npx tsx --test scripts/cards-import.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: importer types pass; only Task 4 consumers may remain red.

- [ ] **Step 8: Review checkpoint**

Review parser trust boundaries, token-safe errors, temporary-file cleanup, conflict targets, and transaction scope. Do not stage or commit.

---

### Task 4: Render One Card Library Item Per Variant

**Files:**
- Modify: `lib/cards.ts`
- Modify: `types/card.ts`
- Modify: `components/card-library.test.tsx`

**Interfaces:**
- Consumes: `cards`, `cardVariants`, and `cardRarities` from Task 1.
- Produces: `getCards(): Promise<CardListItem[]>` with variant IDs and local image paths.

- [ ] **Step 1: Change the Card Library fixture to prove variant identity**

Use two fixtures sharing `cardCode` and `name` but with different variant IDs, rarity codes, and image paths. Assert that two `<article>` elements render, the count is `2 cards found`, and accessible labels distinguish `MR` from `UR`.

- [ ] **Step 2: Run the focused test and verify RED if the public type changes**

Run: `npx tsx --test components/card-library.test.tsx`

Expected: FAIL until `CardListItem` and the query use variant IDs consistently.

- [ ] **Step 3: Update the response type and joined query**

Keep the existing public fields, add `rarityCode`, and use the variant ID as `id`. Update `CardGridItem` so its accessible label contains the rarity. Implement:

```ts
return db
  .select({
    id: cardVariants.id,
    cardCode: cards.cardCode,
    name: cards.name,
    cardType: cards.cardType,
    rarityCode: cardVariants.rarityCode,
    imageUrl: cardVariants.imageUrl,
  })
  .from(cards)
  .innerJoin(cardVariants, eq(cardVariants.cardId, cards.id))
  .innerJoin(cardRarities, eq(cardRarities.code, cardVariants.rarityCode))
  .orderBy(asc(cards.cardCode), asc(cardRarities.sortOrder));
```

- [ ] **Step 4: Run focused and complete application checks**

Run: `npx tsx --test components/card-library.test.tsx`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Review checkpoint**

Confirm no client component imports database modules and no remote image host was allowlisted. Do not stage or commit.

---

### Task 5: Apply, Import, And Verify The Complete Catalog

**Files:**
- Create at runtime: `public/cards/*`
- No source edits unless a preceding verification exposes a defect.

**Interfaces:**
- Consumes: migration and import command from Tasks 2 and 3.
- Produces: populated local PostgreSQL catalog and 357 local image files.

- [ ] **Step 1: Confirm the target without exposing credentials**

Print only protocol, host, port, and database parsed from `DATABASE_URL`. Confirm the target is the intended local `mhrdex` database.

- [ ] **Step 2: Apply the new migration**

Run: `npx drizzle-kit migrate`

Expected: migrations applied successfully with one new migration-history row.

- [ ] **Step 3: Run the first complete import**

Run: `npm run import:cards -- cards.en.json`

Use a timeout appropriate for 357 image downloads. Expected report:

```text
sets: 9
traits: 30
cards: 288
variants: 357
cardTraits: 595
```

- [ ] **Step 4: Verify database natural keys and local files**

Run read-only SQL through the installed `pg` client and assert:

```text
sets = 9
traits = 30
cards = 288
card_variants = 357
card_traits = 595
duplicate cards.card_code = 0
duplicate card_variants(card_id, rarity_code) = 0
orphan card_traits = 0
orphan card_variants = 0
card_variants with non-local image_url = 0
```

Count nonempty files under `public/cards`; expected 357.

- [ ] **Step 5: Prove idempotence**

Run: `npm run import:cards -- cards.en.json`

Expected: success without downloading existing images again.

Repeat the read-only SQL count check. Every count and duplicate result must remain unchanged.

- [ ] **Step 6: Verify the application**

Run in parallel:

```text
npm test
npx tsc --noEmit
npm run lint -- --quiet
npx drizzle-kit check
```

Then run: `npm run build`

Expected: all commands exit 0 and `/` remains dynamically rendered.

Start or reuse the development server and request `/`. Expected: HTTP 200, `357 cards found`, and local `/_next/image` URLs referencing `/cards/` assets.

- [ ] **Step 7: Final integrity review**

Run: `git diff --check`

Inspect `git status --short` and confirm no `.env` file, temporary image file, signed image token outside `cards.en.json`, or unrelated generated artifact was added.

Review the complete live deliverable against the spec. Do not stage or commit.
