import { asc } from "drizzle-orm";

import { db } from "@/src/db/client";
import { cards } from "@/src/db/schema";
import type { CardListItem } from "@/types/card";

export function getCards(): Promise<CardListItem[]> {
  return db
    .select({
      id: cards.id,
      cardCode: cards.cardCode,
      name: cards.name,
      cardType: cards.cardType,
      imageUrl: cards.imageUrl,
    })
    .from(cards)
    .orderBy(asc(cards.cardCode));
}
