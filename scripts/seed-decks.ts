import "dotenv/config";

import { and, asc, eq, sql } from "drizzle-orm";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validateDeckContents } from "../lib/deck-validation";
import { db } from "../src/db/client";
import {
  cards,
  deckCards,
  deckColors,
  decks,
  user,
  users,
} from "../src/db/schema";

type SeedConfig = {
  name: string;
  colors: readonly string[];
  total: number;
  offset: number;
};

const SEED_CONFIGS: readonly SeedConfig[] = [
  {
    name: "Ember Avengers",
    colors: ["red", "yellow"],
    total: 37,
    offset: 0,
  },
  {
    name: "Cosmic Tempo",
    colors: ["blue", "green"],
    total: 21,
    offset: 2,
  },
  {
    name: "Dark Reign Control",
    colors: ["red", "green"],
    total: 14,
    offset: 4,
  },
];

export type SeedCard = {
  cardId: string;
  cardCode: string;
  colorCode: string;
};

export type SeedDeck = {
  name: string;
  entries: { cardId: string; quantity: number }[];
};

export type SeedApplicationUser = {
  id: string;
  betterAuthUserId: string | null;
  clerkUserId: string | null;
};

export function resolveApplicationUserLink(
  authUserId: string,
  email: string,
  mappedUser: { id: string } | undefined,
  emailUser: SeedApplicationUser | undefined,
) {
  if (mappedUser) return { action: "existing" as const, id: mappedUser.id };
  if (emailUser?.betterAuthUserId) {
    if (emailUser.betterAuthUserId !== authUserId) {
      throw new Error(`Application account for ${email} is already linked.`);
    }
    return { action: "existing" as const, id: emailUser.id };
  }
  return { action: "create" as const };
}

export function buildSeedDecks(catalog: readonly SeedCard[]): SeedDeck[] {
  return SEED_CONFIGS.map((config) => {
    const cardsByColor = config.colors.map((colorCode) =>
      catalog.filter((card) => card.colorCode === colorCode),
    );

    if (
      cardsByColor.some((cardsForColor) => cardsForColor.length === 0) ||
      cardsByColor.flat().length * 3 < config.total
    ) {
      throw new Error(
        `Not enough catalog cards to seed ${config.name} with its color identity.`,
      );
    }

    const availableCards = Array.from({
      length: Math.max(...cardsByColor.map((cardsForColor) => cardsForColor.length)),
    }).flatMap((_, index) =>
      cardsByColor.flatMap((cardsForColor) => {
        const card = cardsForColor[index];
        return card ? [card] : [];
      }),
    );

    const entries: SeedDeck["entries"] = [];
    let remaining = config.total;
    let index = 0;

    while (remaining > 0) {
      const card = availableCards[(config.offset + index) % availableCards.length];
      const quantity = Math.min(1 + ((index + config.offset) % 3), remaining);
      entries.push({ cardId: card.cardId, quantity });
      remaining -= quantity;
      index += 1;
    }

    const validation = validateDeckContents(entries, availableCards);
    if (!validation.valid) {
      throw new Error(`Invalid generated seed for ${config.name}: ${validation.message}`);
    }

    return { name: config.name, entries };
  });
}

async function seedDecks(email: string) {
  const [authUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!authUser) throw new Error(`Better Auth user not found for ${email}.`);

  const catalog = await db
    .select({
      cardId: cards.id,
      cardCode: cards.cardCode,
      colorCode: cards.colorCode,
    })
    .from(cards)
    .orderBy(asc(cards.cardCode));
  const seedDecks = buildSeedDecks(catalog);

  const results = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`mhr-decks:${authUser.id}`}))`,
    );

    const [mappedUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.betterAuthUserId, authUser.id))
      .limit(1);
    const [emailUser] = mappedUser
      ? []
      : await tx
          .select({
            id: users.id,
            betterAuthUserId: users.betterAuthUserId,
            clerkUserId: users.clerkUserId,
          })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
    const mapping = resolveApplicationUserLink(
      authUser.id,
      email,
      mappedUser,
      emailUser,
    );
    let applicationUserId: string;
    let mappingAction: "created" | "existing";
    if (mapping.action === "existing") {
      applicationUserId = mapping.id;
      mappingAction = "existing";
    } else {
      const [createdUser] = await tx
        .insert(users)
        .values({ betterAuthUserId: authUser.id, email })
        .onConflictDoNothing({ target: users.betterAuthUserId })
        .returning({ id: users.id });
      if (createdUser) {
        applicationUserId = createdUser.id;
        mappingAction = "created";
      } else {
        const [mappedAfterRace] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.betterAuthUserId, authUser.id))
          .limit(1);
        if (!mappedAfterRace) {
          throw new Error(`Application account mapping failed for ${email}.`);
        }
        applicationUserId = mappedAfterRace.id;
        mappingAction = "existing";
      }
    }

    const catalogById = new Map(catalog.map((card) => [card.cardId, card]));
    const seedResults: { action: "created" | "skipped"; name: string }[] = [];

    for (const seedDeck of seedDecks) {
      const [existingDeck] = await tx
        .select({ id: decks.id })
        .from(decks)
        .where(
          and(
            eq(decks.userId, applicationUserId),
            eq(decks.name, seedDeck.name),
          ),
        )
        .limit(1);

      if (existingDeck) {
        seedResults.push({ action: "skipped", name: seedDeck.name });
        continue;
      }

      const [deck] = await tx
        .insert(decks)
        .values({ userId: applicationUserId, name: seedDeck.name })
        .returning({ id: decks.id });
      const selectedCards = seedDeck.entries.map((entry) => ({
        ...entry,
        colorCode: catalogById.get(entry.cardId)?.colorCode,
      }));
      const colors = [
        ...new Set(
          selectedCards.flatMap((card) => (card.colorCode ? [card.colorCode] : [])),
        ),
      ];

      await tx.insert(deckCards).values(
        seedDeck.entries.map((entry) => ({
          deckId: deck.id,
          cardId: entry.cardId,
          quantity: entry.quantity,
        })),
      );
      await tx.insert(deckColors).values(
        colors.map((colorCode) => ({ deckId: deck.id, colorCode })),
      );
      seedResults.push({ action: "created", name: seedDeck.name });
    }

    return { mappingAction, seedResults };
  });

  if (results.mappingAction === "created") {
    console.log(`Created application account for ${email}.`);
  }
  for (const result of results.seedResults) {
    console.log(
      `${result.action === "created" ? "Created" : "Skipped existing"} deck: ${result.name}`,
    );
  }
}

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: npm run seed:decks -- <email>");
  await seedDecks(email);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
