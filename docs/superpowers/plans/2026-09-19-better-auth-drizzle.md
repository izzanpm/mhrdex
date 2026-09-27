# Better Auth And Drizzle Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a working Better Auth foundation backed by PostgreSQL and Drizzle, while preserving the existing application account UUIDs and documenting the new auth contract.

**Architecture:** Better Auth owns the `user`, `session`, `account`, and `verification` tables. The existing `users` table remains the application-account boundary and receives a nullable unique `better_auth_user_id` foreign key; existing `clerk_user_id` values remain nullable legacy data. The App Router auth route delegates to Better Auth, and the client helper uses the same-origin `/api/auth` endpoint.

**Tech Stack:** Next.js 16 App Router, TypeScript strict mode, Better Auth, `@better-auth/drizzle-adapter/relations-v2`, Drizzle ORM v1 RC, Drizzle Kit v1 RC, PostgreSQL, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-19-better-auth-drizzle-design.md`

## Global Constraints

- Better Auth replaces Clerk as the authentication provider.
- Use `better-auth/minimal` for the server instance.
- Use `@better-auth/drizzle-adapter/relations-v2` with `provider: "pg"` and the complete Drizzle schema object.
- Enable email/password authentication initially; do not configure Google or Apple without credentials.
- Keep `users.id` as a UUID and do not delete or rewrite existing application account rows.
- Preserve existing `clerk_user_id` values as nullable legacy data.
- Never write real secrets to source control, `.env.example`, client code, or test fixtures.
- Keep `schema_cloud.md`, `schema_cloud.sql`, `ERD.MD`, `src/db/schema.ts`, and Drizzle migrations aligned.
- Do not reset or overwrite unrelated uncommitted catalog, import, UI, or shadcn changes.
- Do not commit changes unless the user explicitly requests a commit.

## File Map

- Modify `package.json` and `package-lock.json`: add Better Auth and its Drizzle adapter.
- Modify `.env.example`: document `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` placeholders.
- Modify `.gitignore`: allow the safe `.env.example` contract to be tracked while continuing to ignore real env files.
- Modify `src/db/schema.ts`: add Better Auth tables, Relations v2 declarations, indexes, and the application-account mapping column.
- Modify `src/db/schema.test.ts`: assert auth table names, columns, indexes, foreign keys, and the nullable legacy mapping.
- Modify `architecture.test.ts`: require the auth server, client, and App Router handler in the documented folders.
- Create `lib/auth.ts`: configure Better Auth with the Drizzle Relations v2 adapter and email/password.
- Create `lib/auth-client.ts`: expose the browser Better Auth client.
- Create `app/api/auth/[...all]/route.ts`: expose Better Auth GET and POST handlers.
- Create `drizzle/<timestamp>_add_better_auth/migration.sql`: create auth tables and alter `users` without data loss.
- Modify `schema_cloud.sql`: update the executable fresh-install schema with auth tables and the new mapping.
- Modify `schema_cloud.md` and `ERD.MD`: document auth tables, identity mapping, and Better Auth ownership rules.
- Modify `AGENTS.md`: replace Clerk guidance and add Better Auth, its adapter, and shadcn/ui to the stack.

---

### Task 1: Install Better Auth And Define Environment Inputs

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`

**Interfaces:**
- Produces the `better-auth` and `@better-auth/drizzle-adapter` packages for the auth server and route tasks.
- Produces the documented server-only `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` inputs.

- [ ] **Step 1: Install the approved packages**

Run:

```powershell
npm install better-auth @better-auth/drizzle-adapter
```

Expected: `package.json` and `package-lock.json` contain both runtime dependencies; no unrelated dependency is added.

- [ ] **Step 2: Add environment placeholders**

Update `.env.example` to retain `DATABASE_URL` and add:

```dotenv
# Better Auth server secret. Use at least 32 random characters in `.env`.
BETTER_AUTH_SECRET=replace-with-a-32-character-minimum-secret

# Public application URL used by Better Auth.
BETTER_AUTH_URL=http://localhost:3000
```

Do not edit `.env` or put a usable secret in this file.

- [ ] **Step 3: Verify dependency resolution**

Run:

```powershell
npm ls better-auth @better-auth/drizzle-adapter
```

Expected: both packages resolve without an unmet dependency error.

### Task 2: Add Better Auth Tables And Application Mapping

**Files:**
- Modify: `src/db/schema.ts`
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Produces exported Drizzle tables `user`, `session`, `account`, and `verification` for the adapter schema object.
- Produces `users.betterAuthUserId: string | null` as a unique foreign key to `user.id`.
- Keeps `users.clerkUserId` nullable and otherwise preserves the existing application tables.

- [ ] **Step 1: Extend the schema test with failing auth assertions**

Import the four auth tables and add them to the table list. Extend the expected table names with:

```typescript
"user",
"session",
"account",
"verification",
```

Add assertions equivalent to:

```typescript
test("defines the Better Auth tables and application identity mapping", () => {
  assert.deepEqual(getTableConfig(user).columns.map(({ name }) => name), [
    "id",
    "name",
    "email",
    "email_verified",
    "image",
    "created_at",
    "updated_at",
  ]);
  assert.ok(
    getTableConfig(session).indexes.some(
      ({ config }) => config.name === "idx_auth_session_user",
    ),
  );
  assert.ok(
    getTableConfig(account).indexes.some(
      ({ config }) => config.name === "idx_auth_account_user",
    ),
  );
  assert.ok(
    getTableConfig(verification).indexes.some(
      ({ config }) => config.name === "idx_auth_verification_identifier",
    ),
  );
  assert.deepEqual(
    getTableConfig(users).columns.map(({ name }) => name),
    ["id", "clerk_user_id", "better_auth_user_id", "email", "created_at"],
  );
});
```

Also assert the auth session and account foreign keys reference `user.id`, and assert the `users` legacy and Better Auth identity columns are nullable through their column metadata.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npx tsx --test src/db/schema.test.ts
```

Expected: FAIL because the auth table exports and `better_auth_user_id` do not exist yet.

- [ ] **Step 3: Add the four core Better Auth tables**

Add `defineRelations` to the `drizzle-orm` imports and define the tables using the adapter's current PostgreSQL shape:

```typescript
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("idx_auth_session_user").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_auth_account_user").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_auth_verification_identifier").on(table.identifier),
  ],
);
```

- [ ] **Step 4: Add the explicit application-account mapping**

Change the existing `users` definition so the identity fields are:

```typescript
clerkUserId: text("clerk_user_id").unique(),
betterAuthUserId: text("better_auth_user_id")
  .unique()
  .references(() => user.id, { onDelete: "cascade" }),
```

Keep the existing UUID `id`, email, and created timestamp unchanged. Do not add a check requiring one identity column to be non-null; legacy rows and newly authenticated rows are migrated in separate application flows.

- [ ] **Step 5: Add Relations v2 declarations**

Add the core Relations v2 definition expected by the adapter. Drizzle ORM v1 uses one `defineRelations` call with `r.one`/`r.many` and explicit `from`/`to` joins:

```typescript
export const relations = defineRelations(
  { user, session, account, verification },
  (r) => ({
    user: {
      sessions: r.many.session(),
      accounts: r.many.account(),
    },
    session: {
      user: r.one.user({
        from: r.session.userId,
        to: r.user.id,
      }),
    },
    account: {
      user: r.one.user({
        from: r.account.userId,
        to: r.user.id,
      }),
    },
  }),
);
```

No relation is needed for `verification`; it has no user foreign key in Better Auth's core schema.

- [ ] **Step 6: Run the focused schema tests**

Run:

```powershell
npx tsx --test src/db/schema.test.ts
```

Expected: PASS, including the existing catalog, deck, and match-log assertions.

### Task 3: Add The Better Auth Server, Client, And Route

**Files:**
- Create: `lib/auth.ts`
- Create: `lib/auth-client.ts`
- Create: `app/api/auth/[...all]/route.ts`
- Modify: `architecture.test.ts`

**Interfaces:**
- `lib/auth.ts` exports `auth`, the single Better Auth server instance.
- `lib/auth-client.ts` exports `authClient`, the browser client.
- `app/api/auth/[...all]/route.ts` exports `GET` and `POST` from `toNextJsHandler(auth)`.

- [ ] **Step 1: Add architecture assertions for the auth boundary**

Add these paths to `expectedFiles` in `architecture.test.ts`:

```typescript
["app", "api", "auth", "[...all]", "route.ts"],
["lib", "auth.ts"],
["lib", "auth-client.ts"],
```

Run:

```powershell
npx tsx --test architecture.test.ts
```

Expected: FAIL because the three auth files do not exist yet.

- [ ] **Step 2: Configure the Better Auth server**

Create `lib/auth.ts` with the existing database client and complete schema:

```typescript
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth/minimal";

import { db } from "@/src/db/client";
import * as schema from "@/src/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
});
```

Do not add Clerk imports, provider credentials, or a fallback secret.

- [ ] **Step 3: Add the same-origin browser client**

Create `lib/auth-client.ts`:

```typescript
"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

Leave the base URL unset so the client uses the current origin and does not read a server-only environment variable.

- [ ] **Step 4: Add the App Router handler**

Create `app/api/auth/[...all]/route.ts`:

```typescript
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 5: Run type and architecture checks**

Run:

```powershell
npx tsx --test architecture.test.ts
npx tsc --noEmit
```

Expected: both commands pass without a missing export, invalid adapter schema, or client/server boundary error.

### Task 4: Generate And Review The Data-Preserving Migration

**Files:**
- Create: `drizzle/<generated-timestamp>_add_better_auth/migration.sql`
- Modify: `src/db/schema.ts` only if migration generation exposes a schema mismatch

**Interfaces:**
- Produces a migration that creates the four Better Auth tables before adding the foreign key from `users.better_auth_user_id`.
- Preserves all existing `users` rows and existing application table foreign keys.

- [ ] **Step 1: Generate the migration from the reviewed Drizzle schema**

Run:

```powershell
npx drizzle-kit generate --name add_better_auth
```

Expected: one new timestamped migration directory under `drizzle/`; do not modify either existing migration.

- [ ] **Step 2: Review the generated SQL against the required shape**

The migration must contain the equivalent of these operations, with Drizzle-generated constraint names accepted when semantics match:

```sql
CREATE TABLE "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL,
  CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE TABLE "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "users" ALTER COLUMN "clerk_user_id" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "better_auth_user_id" text;
ALTER TABLE "users" ADD CONSTRAINT "users_better_auth_user_id_unique" UNIQUE("better_auth_user_id");
ALTER TABLE "users" ADD CONSTRAINT "users_better_auth_user_id_user_id_fkey"
  FOREIGN KEY ("better_auth_user_id") REFERENCES "user"("id") ON DELETE CASCADE;
```

The generated migration must also include the three auth lookup indexes and the `session.user_id` / `account.user_id` foreign keys with `ON DELETE CASCADE`. It must not drop `clerk_user_id`, truncate rows, change `users.id`, or recreate `decks` and `match_logs`.

- [ ] **Step 3: Validate migration history**

Run:

```powershell
npx drizzle-kit check
```

Expected: migration history passes with no journal or snapshot mismatch.

### Task 5: Synchronize SQL Contracts And Project Guidance

**Files:**
- Modify: `.gitignore`
- Modify: `schema_cloud.sql`
- Modify: `schema_cloud.md`
- Modify: `ERD.MD`
- Modify: `AGENTS.md`

**Interfaces:**
- Produces matching fresh-install SQL, human-readable schema documentation, ERD relationships, and repository instructions.

- [ ] **Step 1: Add the auth tables to `schema_cloud.sql`**

Insert the four core auth table definitions and their indexes/foreign keys before the application `users` mapping constraint. Update the `users` table definition from:

```sql
"clerk_user_id" text NOT NULL UNIQUE
```

to:

```sql
"clerk_user_id" text UNIQUE,
"better_auth_user_id" text UNIQUE
```

Add the foreign key from `users.better_auth_user_id` to `user.id`. Keep all existing catalog seed inserts and application constraints unchanged.

- [ ] **Step 2: Update both human-readable schema documents**

In `schema_cloud.md` and `ERD.MD`:

- Add `AUTH_USER`, `AUTH_SESSION`, `AUTH_ACCOUNT`, and `AUTH_VERIFICATION` to the Mermaid relationship map.
- Add sections describing the exact auth table columns and indexes.
- Change the `users` table contract so both `clerk_user_id` and `better_auth_user_id` are nullable unique text values, with the latter referencing Better Auth `user.id`.
- Replace “authenticated Clerk session” with “authenticated Better Auth session”.
- State that existing Clerk IDs are legacy values and are not automatically linked to Better Auth identities.
- Keep the existing deck, match-log, local IndexedDB, and migration rules unchanged.

- [ ] **Step 3: Update `AGENTS.md` authentication and stack guidance**

Make these focused replacements:

- Replace the Clerk tech-stack entry with Better Auth plus `@better-auth/drizzle-adapter`; state email/password is initial and Google/Apple are deferred.
- Add `shadcn/ui` to the UI/tooling stack.
- Change `(auth)` and `api/` descriptions to reference Better Auth routes rather than Clerk pages/webhooks.
- Change `lib/clerk.ts` to the Better Auth server/client helpers.
- Change secret guidance from the Clerk secret to `BETTER_AUTH_SECRET`.
- Replace “Use Clerk” with “Use Better Auth; do not build custom auth.”
- State that protected operations derive the Better Auth session and resolve the local `users` mapping before accessing decks or match logs.

- [ ] **Step 4: Keep the safe environment example trackable**

Immediately after the existing `.env*` ignore rule in `.gitignore`, add:

```gitignore
!.env.example
```

Do not unignore `.env`, provider credential files, or any other environment file.

- [ ] **Step 5: Check the documentation diff**

Run:

```powershell
git diff --check -- .gitignore AGENTS.md schema_cloud.md schema_cloud.sql ERD.MD
```

Expected: no whitespace errors and no remaining active Clerk integration instructions outside explicitly labeled legacy schema data.

### Task 6: Run Full Verification

**Files:**
- No new files; verify all changes from Tasks 1-5.

**Interfaces:**
- Confirms the auth foundation compiles, the schema tests pass, migration history is valid, and existing features remain intact.

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
npm test
```

Expected: all existing catalog, UI, architecture, and schema tests pass.

- [ ] **Step 2: Run type checking and lint**

Run:

```powershell
npx tsc --noEmit
npm run lint -- --quiet
```

Expected: no TypeScript, import-boundary, or ESLint errors.

- [ ] **Step 3: Run the production build with a temporary local secret**

In the current PowerShell process only, set a non-production test secret and run:

```powershell
$env:BETTER_AUTH_SECRET = "local-build-secret-that-is-at-least-32-characters"
$env:BETTER_AUTH_URL = "http://localhost:3000"
npm run build
```

Expected: the Next.js production build completes. Do not persist the variable or write it to `.env.example`.

- [ ] **Step 4: Inspect the final change set**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: only the planned auth, schema-contract, dependency, and documentation files are changed in addition to pre-existing worktree changes; no secret file is staged or modified.
