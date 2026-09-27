import { DeckListScreen } from "@/components/deck-list-screen";
import { requireAuthSession } from "@/lib/auth-guard";
import { getCards } from "@/lib/cards";
import { getOwnedDeck, getOwnedDecks } from "@/lib/decks";
import type { CardListItem } from "@/types/card";
import type { AuthenticatedUser } from "@/types/user";
import type { DeckDetail, DeckSummary } from "@/types/deck";

export function DecksPageContent({
  cards = [],
  user,
  decks,
  selectedDeck,
}: {
  cards?: CardListItem[];
  user: AuthenticatedUser;
  decks: DeckSummary[];
  selectedDeck: DeckDetail | null;
}) {
  return (
    <DeckListScreen
      cards={cards}
      decks={decks}
      selectedDeck={selectedDeck}
      user={user}
    />
  );
}

export default async function DecksPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string }>;
}) {
  const session = await requireAuthSession();
  const params = await searchParams;
  const decks = await getOwnedDecks(session.user.id);
  let selectedDeck: DeckDetail | null = null;
  let cards: CardListItem[] = [];
  if (decks.length > 0) {
    const [deck, catalogCards] = await Promise.all([
      getOwnedDeck(session.user.id, params.deck ?? decks[0].id),
      getCards(),
    ]);
    selectedDeck = deck;
    cards = catalogCards;
    if (!selectedDeck && params.deck !== decks[0].id) {
      selectedDeck = await getOwnedDeck(session.user.id, decks[0].id);
    }
  }

  return (
    <DecksPageContent
      cards={cards}
      decks={decks}
      selectedDeck={selectedDeck}
      user={{
        email: session.user.email,
        image: session.user.image ?? null,
        name: session.user.name,
      }}
    />
  );
}
