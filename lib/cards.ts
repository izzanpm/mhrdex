import { asc, eq } from "drizzle-orm";

import { db } from "@/src/db/client";
import {
  cardRarities,
  cardSets,
  cardTraits,
  cardVariants,
  cards,
  traits,
} from "@/src/db/schema";
import { normalizeCardType, type CardListItem } from "@/types/card";

export async function getCards(): Promise<CardListItem[]> {
  const rows = await db
    .select({
      id: cardVariants.id,
      cardId: cards.id,
      cardCode: cards.cardCode,
      name: cards.name,
      cardType: cards.cardType,
      colorCode: cards.colorCode,
      rarityCode: cardVariants.rarityCode,
      isBase: cardVariants.isBase,
      level: cardVariants.level,
      power: cardVariants.power,
      range: cardVariants.range,
      abilityText: cards.abilityText,
      imageUrl: cardVariants.imageUrl,
      setCode: cardSets.code,
      traitName: traits.name,
    })
    .from(cards)
    .innerJoin(cardVariants, eq(cardVariants.cardId, cards.id))
    .innerJoin(cardRarities, eq(cardRarities.code, cardVariants.rarityCode))
    .leftJoin(cardSets, eq(cardSets.id, cards.setId))
    .leftJoin(cardTraits, eq(cardTraits.cardId, cards.id))
    .leftJoin(traits, eq(traits.id, cardTraits.traitId))
    .orderBy(asc(cards.cardCode), asc(cardRarities.sortOrder));

  const cardsByVariant = new Map<string, CardListItem>();

  for (const row of rows) {
    const existingCard = cardsByVariant.get(row.id);

    if (existingCard) {
      if (row.traitName && !existingCard.traitNames?.includes(row.traitName)) {
        existingCard.traitNames?.push(row.traitName);
      }
      continue;
    }

    cardsByVariant.set(row.id, {
      cardId: row.cardId,
      cardCode: row.cardCode,
      cardType: normalizeCardType(row.cardType),
      colorCode: row.colorCode,
      id: row.id,
      imageUrl: row.imageUrl,
      isBase: row.isBase,
      level: row.level,
      name: row.name,
      power: row.power,
      range: row.range,
      abilityText: row.abilityText,
      rarityCode: row.rarityCode,
      setCode: row.setCode,
      traitNames: row.traitName ? [row.traitName] : [],
    });
  }

  return [...cardsByVariant.values()];
}
