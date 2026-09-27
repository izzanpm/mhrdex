import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getCards } from "@/lib/cards";
import { db } from "@/src/db/client";
import {
  cardRarities,
  cardVariants,
  cards,
  deckCards,
  deckColors,
  decks,
  user as authUser,
  users,
} from "@/src/db/schema";
import {
  validateDeckContents,
  type DeckCatalogCard,
  type DeckCardDraft,
} from "@/lib/deck-validation";
import type {
  DeckDetail,
  DeckEditorCard,
  DeckSummary,
  SaveDeckInput,
  SaveDeckResult,
} from "@/types/deck";

type ParsedSaveDeckInput =
  | { ok: true; value: SaveDeckInput }
  | { ok: false; message: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function buildApplicationUserRecord(
  sessionUserId: string,
  email: string | null,
) {
  return { betterAuthUserId: sessionUserId, email };
}

export function normalizeDeckEntries(
  entries: readonly DeckCardDraft[],
): DeckCardDraft[] {
  const quantities = new Map<string, number>();

  for (const entry of entries) {
    quantities.set(
      entry.cardId,
      (quantities.get(entry.cardId) ?? 0) + entry.quantity,
    );
  }

  return [...quantities].map(([cardId, quantity]) => ({ cardId, quantity }));
}

export function parseSaveDeckInput(input: unknown): ParsedSaveDeckInput {
  if (!isRecord(input) || typeof input.name !== "string" || !Array.isArray(input.cards)) {
    return { ok: false, message: "The deck changes are invalid." };
  }

  const cardsInput: DeckCardDraft[] = [];
  for (const card of input.cards) {
    if (
      !isRecord(card) ||
      typeof card.cardId !== "string" ||
      card.cardId.length === 0 ||
      typeof card.quantity !== "number" ||
      !Number.isInteger(card.quantity) ||
      card.quantity < 1
    ) {
      return { ok: false, message: "Card quantities must be positive integers." };
    }

    cardsInput.push({ cardId: card.cardId, quantity: card.quantity });
  }

  return {
    ok: true,
    value: {
      name: input.name.trim() || "New deck",
      cards: normalizeDeckEntries(cardsInput),
    },
  };
}

export async function getApplicationUserId(sessionUserId: string) {
  const [applicationUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.betterAuthUserId, sessionUserId))
    .limit(1);

  if (applicationUser) return applicationUser.id;

  const [authenticatedUser] = await db
    .select({ email: authUser.email })
    .from(authUser)
    .where(eq(authUser.id, sessionUserId))
    .limit(1);
  if (!authenticatedUser) {
    throw new Error("Authenticated user not found.");
  }

  const [createdUser] = await db
    .insert(users)
    .values(buildApplicationUserRecord(sessionUserId, authenticatedUser.email))
    .onConflictDoNothing({ target: users.betterAuthUserId })
    .returning({ id: users.id });
  if (createdUser) return createdUser.id;

  const [mappedAfterRace] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.betterAuthUserId, sessionUserId))
    .limit(1);
  if (!mappedAfterRace) {
    throw new Error("Authenticated user mapping could not be created.");
  }

  return mappedAfterRace.id;
}

export async function getOwnedDecks(sessionUserId: string): Promise<DeckSummary[]> {
  const applicationUserId = await getApplicationUserId(sessionUserId);
  const deckRows = await db
    .select({
      id: decks.id,
      name: decks.name,
      updatedAt: decks.updatedAt,
    })
    .from(decks)
    .where(eq(decks.userId, applicationUserId))
    .orderBy(desc(decks.updatedAt));

  if (deckRows.length === 0) return [];

  const deckIds = deckRows.map((deck) => deck.id);
  const [colorRows, cardRows] = await Promise.all([
    db
      .select({ deckId: deckColors.deckId, colorCode: deckColors.colorCode })
      .from(deckColors)
      .where(inArray(deckColors.deckId, deckIds)),
    db
      .select({ deckId: deckCards.deckId, quantity: deckCards.quantity })
      .from(deckCards)
      .where(inArray(deckCards.deckId, deckIds)),
  ]);

  const colorsByDeck = new Map<string, string[]>();
  for (const row of colorRows) {
    const colors = colorsByDeck.get(row.deckId) ?? [];
    colors.push(row.colorCode);
    colorsByDeck.set(row.deckId, colors);
  }

  const cardCountByDeck = new Map<string, number>();
  for (const row of cardRows) {
    cardCountByDeck.set(
      row.deckId,
      (cardCountByDeck.get(row.deckId) ?? 0) + row.quantity,
    );
  }

  return deckRows.map((deck) => ({
    id: deck.id,
    name: deck.name,
    cardCount: cardCountByDeck.get(deck.id) ?? 0,
    colorCodes: colorsByDeck.get(deck.id) ?? [],
    updatedAt: deck.updatedAt.toISOString(),
  }));
}

export async function getOwnedDeck(
  sessionUserId: string,
  deckId: string,
): Promise<DeckDetail | null> {
  if (!UUID_PATTERN.test(deckId)) return null;
  const applicationUserId = await getApplicationUserId(sessionUserId);
  const [deck] = await db
    .select({
      id: decks.id,
      name: decks.name,
      updatedAt: decks.updatedAt,
    })
    .from(decks)
    .where(and(eq(decks.id, deckId), eq(decks.userId, applicationUserId)))
    .limit(1);

  if (!deck) return null;

  const [colorRows, cardRows] = await Promise.all([
    db
      .select({ colorCode: deckColors.colorCode })
      .from(deckColors)
      .where(eq(deckColors.deckId, deckId)),
    db
      .select({
        cardId: deckCards.cardId,
        cardCode: cards.cardCode,
        name: cards.name,
        colorCode: cards.colorCode,
        quantity: deckCards.quantity,
        imageUrl: cardVariants.imageUrl,
        raritySortOrder: cardRarities.sortOrder,
      })
      .from(deckCards)
      .innerJoin(cards, eq(cards.id, deckCards.cardId))
      .leftJoin(cardVariants, eq(cardVariants.cardId, cards.id))
      .leftJoin(cardRarities, eq(cardRarities.code, cardVariants.rarityCode))
      .where(eq(deckCards.deckId, deckId))
      .orderBy(asc(cards.cardCode), asc(cardRarities.sortOrder)),
  ]);

  const cardsById = new Map<string, DeckDetail["cards"][number]>();
  for (const row of cardRows) {
    if (cardsById.has(row.cardId)) continue;
    cardsById.set(row.cardId, {
      cardId: row.cardId,
      cardCode: row.cardCode,
      name: row.name,
      colorCode: row.colorCode,
      imageUrl: row.imageUrl,
      quantity: row.quantity,
    });
  }

  const selectedCards = [...cardsById.values()];
  return {
    id: deck.id,
    name: deck.name,
    cardCount: selectedCards.reduce((total, card) => total + card.quantity, 0),
    colorCodes: colorRows.map((row) => row.colorCode),
    updatedAt: deck.updatedAt.toISOString(),
    cards: selectedCards,
  };
}

export async function getDeckEditorCards(): Promise<DeckEditorCard[]> {
  const catalog = await getCards();
  const seenCardIds = new Set<string>();
  const editorCards: DeckEditorCard[] = [];

  for (const card of catalog) {
    if (seenCardIds.has(card.cardId) || !card.isBase || !card.colorCode) continue;
    seenCardIds.add(card.cardId);
    editorCards.push({ ...card, colorCode: card.colorCode });
  }

  return editorCards;
}

export async function createOwnedDeck(sessionUserId: string) {
  const applicationUserId = await getApplicationUserId(sessionUserId);
  const [deck] = await db
    .insert(decks)
    .values({ userId: applicationUserId, name: "New deck" })
    .returning({ id: decks.id });

  return deck.id;
}

export async function deleteOwnedDeck(
  sessionUserId: string,
  deckId: string,
): Promise<boolean> {
  if (!UUID_PATTERN.test(deckId)) return false;

  const applicationUserId = await getApplicationUserId(sessionUserId);
  const deletedDecks = await db
    .delete(decks)
    .where(and(eq(decks.id, deckId), eq(decks.userId, applicationUserId)))
    .returning({ id: decks.id });

  return deletedDecks.length > 0;
}

export async function saveOwnedDeck(
  sessionUserId: string,
  deckId: string,
  input: unknown,
): Promise<SaveDeckResult> {
  if (!UUID_PATTERN.test(deckId)) {
    return {
      ok: false,
      code: "not_found",
      message: "That deck could not be found.",
    };
  }

  const parsed = parseSaveDeckInput(input);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_input", message: parsed.message };
  }
  if (parsed.value.cards.some((entry) => !UUID_PATTERN.test(entry.cardId))) {
    return {
      ok: false,
      code: "invalid_input",
      message: "One or more selected cards are invalid.",
    };
  }

  const applicationUserId = await getApplicationUserId(sessionUserId);
  return db.transaction(async (tx) => {
    const [ownedDeck] = await tx
      .select({ id: decks.id })
      .from(decks)
      .where(and(eq(decks.id, deckId), eq(decks.userId, applicationUserId)))
      .limit(1);

    if (!ownedDeck) {
      return {
        ok: false,
        code: "not_found",
        message: "That deck could not be found.",
      };
    }

    const cardIds = parsed.value.cards.map((entry) => entry.cardId);
    const catalogRows =
      cardIds.length === 0
        ? []
        : await tx
            .select({
              cardId: cards.id,
              cardCode: cards.cardCode,
              colorCode: cards.colorCode,
            })
            .from(cards)
            .where(inArray(cards.id, cardIds));
    const catalog: DeckCatalogCard[] = catalogRows;
    const validation = validateDeckContents(parsed.value.cards, catalog);

    if (!validation.valid) {
      return {
        ok: false,
        code: validation.code,
        message: validation.message,
      };
    }

    await tx.delete(deckCards).where(eq(deckCards.deckId, deckId));
    await tx.delete(deckColors).where(eq(deckColors.deckId, deckId));

    if (parsed.value.cards.length > 0) {
      await tx.insert(deckCards).values(
        parsed.value.cards.map((entry) => ({
          deckId,
          cardId: entry.cardId,
          quantity: entry.quantity,
        })),
      );
    }
    if (validation.colorCodes.length > 0) {
      await tx.insert(deckColors).values(
        validation.colorCodes.map((colorCode) => ({ deckId, colorCode })),
      );
    }

    await tx
      .update(decks)
      .set({ name: parsed.value.name, updatedAt: new Date() })
      .where(eq(decks.id, deckId));

    return { ok: true };
  });
}
