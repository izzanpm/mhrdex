import { notFound } from "next/navigation";

import { DeckBuilderScreen } from "@/components/deck-builder-screen";
import { requireAuthSession } from "@/lib/auth-guard";
import { getCards } from "@/lib/cards";
import { getOwnedDeck } from "@/lib/decks";
import type { CardListItem } from "@/types/card";

export default async function DeckEditPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const session = await requireAuthSession();
  const { deckId } = await params;
  const deck = await getOwnedDeck(session.user.id, deckId);

  if (!deck) notFound();

  let cards: CardListItem[] = [];
  let loadError = false;
  try {
    cards = await getCards();
  } catch {
    loadError = true;
  }

  return (
    <DeckBuilderScreen
      cards={cards}
      deck={deck}
      loadError={loadError}
      user={{
        email: session.user.email,
        image: session.user.image ?? null,
        name: session.user.name,
      }}
    />
  );
}
