import type { DeckSummary } from "@/types/deck";
import type { CardListItem } from "@/types/card";

export function filterDeckSummaries(
  decks: readonly DeckSummary[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return decks;

  return decks.filter((deck) =>
    deck.name.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function getDeckTraitNames(
  cards: readonly CardListItem[],
  deckCards: readonly { cardCode?: string; cardId: string }[],
) {
  const traitNames = new Set<string>();

  for (const deckCard of deckCards) {
    const catalogCard = cards.find(
      (card) =>
        card.cardId === deckCard.cardId ||
        (deckCard.cardCode !== undefined && card.cardCode === deckCard.cardCode),
    );

    for (const traitName of catalogCard?.traitNames ?? []) {
      if (traitName) traitNames.add(traitName);
    }
  }

  return [...traitNames].sort((left, right) => left.localeCompare(right));
}
