import { asc, eq } from "drizzle-orm";

import { db } from "@/src/db/client";
import { cardRarities, cardVariants, cards } from "@/src/db/schema";
import type { CardListItem } from "@/types/card";

export function getCards(): Promise<CardListItem[]> {
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
}
