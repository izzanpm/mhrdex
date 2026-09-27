# Better Auth And Drizzle Integration Design

## Goal

Replace the planned Clerk authentication integration with Better Auth, using the current Drizzle Relations v2 adapter and PostgreSQL. Add a working server foundation, route handler, client helper, schema migration, environment contract, and project documentation without adding provider credentials or auth UI that the request did not supply.

## Decisions

- Better Auth replaces Clerk as the authentication provider.
- Use `better-auth/minimal` for the server instance.
- Use `@better-auth/drizzle-adapter/relations-v2` with `provider: "pg"` and the complete Drizzle schema object.
- Use Better Auth core tables named `user`, `session`, `account`, and `verification`.
- Keep the application `users` table as the domain-account table so existing UUID foreign keys in `match_logs` and `decks` remain stable.
- Add nullable, unique `users.better_auth_user_id` for the mapping from a Better Auth user to an application account.
- Keep `users.clerk_user_id` nullable as legacy data during the transition. New application accounts use `better_auth_user_id`; no new Clerk integration is added.
- Enable email/password authentication initially. Google and Apple remain deferred until real client credentials and redirect requirements are provided.
- Do not change `.env`; add required variables only to `.env.example`.

## Scope

### Included

- Install `better-auth` and `@better-auth/drizzle-adapter`.
- Add `lib/auth.ts` with the Better Auth instance and Drizzle adapter.
- Add `app/api/auth/[...all]/route.ts` using the Next.js App Router handler.
- Add `lib/auth-client.ts` using `better-auth/react`.
- Add Better Auth Drizzle tables, relations, and indexes to `src/db/schema.ts`.
- Add a versioned data-preserving migration for the auth tables and the local account mapping column.
- Update `schema_cloud.md`, `schema_cloud.sql`, and `ERD.MD` to describe the auth tables and identity mapping.
- Update `.env.example` with `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` placeholders.
- Update `AGENTS.md` to list Better Auth, its Drizzle adapter, shadcn/ui, and the revised authentication rules.
- Add focused schema/configuration tests where the repository's existing test patterns support them.

### Excluded

- Google or Apple provider configuration without supplied credentials.
- Sign-in, sign-up, or account settings UI.
- Middleware that protects routes that do not yet exist.
- Automatic migration of existing Clerk identities to Better Auth identities.
- A second application-user synchronization service. The mapping is explicit and can be populated when protected account mutations are implemented.

## Data Model

Better Auth owns authentication state:

- `user`: identity, email verification state, profile image, and timestamps.
- `session`: bearer session tokens, expiry, request metadata, and user ownership.
- `account`: provider accounts and password credentials.
- `verification`: temporary email or verification values.

The existing `users` table remains the application account boundary. `better_auth_user_id` is nullable and unique so an authenticated Better Auth identity can map to one local account without changing existing UUID references. `clerk_user_id` becomes nullable legacy data and is not referenced by new runtime code.

## Runtime Flow

1. The browser calls the Better Auth client for email/password operations.
2. Requests go to `/api/auth/*`.
3. The route delegates GET and POST requests to `auth.handler` through `toNextJsHandler`.
4. `lib/auth.ts` stores and reads auth state through the Drizzle adapter and the PostgreSQL client already used by the project.
5. Future protected Server Actions and Route Handlers derive the Better Auth user from the request headers, then resolve the local `users` mapping before reading or mutating account-owned data.

## Environment Contract

- `DATABASE_URL`: existing PostgreSQL connection string.
- `BETTER_AUTH_SECRET`: high-entropy secret with at least 32 characters; server-only.
- `BETTER_AUTH_URL`: application base URL, for example `http://localhost:3000`.

No Better Auth secret is written to `.env` or any client bundle.

## Migration

The migration creates the four Better Auth tables with text IDs, required foreign keys, unique token/email/provider constraints, and lookup indexes. It adds `better_auth_user_id` as a nullable unique column on `users` and relaxes the legacy `clerk_user_id` requirement without deleting existing values. The migration must not drop existing application account rows or change the UUID type of `users.id`.

The fresh-install SQL and human-readable schema contracts will describe the final state directly. The incremental migration remains the only path for populated installations.

## Verification

- Schema metadata tests assert Better Auth table names, columns, unique constraints, foreign keys, and indexes.
- TypeScript checks the adapter configuration and route handler.
- Existing unit tests continue to pass.
- `npx drizzle-kit check` validates migration history.
- `npm run lint -- --quiet` and `npm run build` validate the Next.js integration.
- Auth route imports are checked without requiring a real secret or provider credential in the repository.

## Risks And Mitigations

- Existing Clerk IDs cannot be automatically matched to Better Auth IDs. Preserve them as nullable legacy values and require an explicit account-linking migration later.
- Better Auth's current Drizzle Relations v2 adapter is a separate package. Pin the import and package names in the implementation so the adapter is not accidentally replaced with the older built-in path.
- Auth tables may be generated by the Better Auth CLI, but the repository uses versioned Drizzle migrations as its source of truth. Review generated schema output before committing it.
