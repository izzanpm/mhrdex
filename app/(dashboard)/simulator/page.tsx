import { redirect } from "next/navigation";

import {
  SimulatorScreen,
  type SimulatorSetup,
} from "@/components/simulator-screen";
import { requireAuthSession } from "@/lib/auth-guard";
import { getCards } from "@/lib/cards";
import { adaptBotDeck, adaptCloudDeck } from "@/lib/simulator/adapter";
import {
  BOT_DEMO_DECK,
  createSupportedCardDefinitions,
  getSupportedCardCodes,
} from "@/lib/simulator/cards";
import type { SimulatorCatalogCard } from "@/lib/simulator/types";
import { getOwnedDeck, getOwnedDecks } from "@/lib/decks";
import type { CardListItem } from "@/types/card";
import type { AuthenticatedUser } from "@/types/user";

function toSimulatorCatalog(cards: readonly CardListItem[]): {
  cards: CardListItem[];
  catalog: SimulatorCatalogCard[];
} {
  const seenCodes = new Set<string>();
  const simulatorCards: CardListItem[] = [];

  for (const card of cards) {
    if (
      !card.isBase ||
      card.cardType !== "Character" ||
      card.colorCode === null ||
      card.colorCode === undefined ||
      card.level === undefined ||
      seenCodes.has(card.cardCode)
    ) {
      continue;
    }

    seenCodes.add(card.cardCode);
    simulatorCards.push(card);
  }

  return {
    cards: simulatorCards,
    catalog: simulatorCards.map((card) => ({
      cardId: card.cardId,
      cardCode: card.cardCode,
      name: card.name,
      cardType: card.cardType,
      colorCode: card.colorCode!,
      isBase: card.isBase,
      level: card.level!,
      power: card.power,
      range: card.range,
      traitNames: card.traitNames ?? [],
      abilityText: card.abilityText,
    })),
  };
}

function userFromSession(session: {
  user: { email: string; image?: string | null; name: string };
}): AuthenticatedUser {
  return {
    email: session.user.email,
    image: session.user.image ?? null,
    name: session.user.name,
  };
}

function setupError(title: string, message: string): SimulatorSetup {
  return { kind: "error", title, message };
}

const INVALID_COLOR_SNAPSHOT_MESSAGE =
  "The deck color identity is invalid. Review the deck and try again.";

export function validateSimulatorDeckColorSnapshot(
  snapshot: unknown,
  resolvedColorCodes: readonly string[],
): string | null {
  if (!Array.isArray(snapshot) || snapshot.length < 1 || snapshot.length > 2) {
    return INVALID_COLOR_SNAPSHOT_MESSAGE;
  }

  if (
    snapshot.some(
      (colorCode) =>
        typeof colorCode !== "string" || colorCode.trim().length === 0,
    )
  ) {
    return INVALID_COLOR_SNAPSHOT_MESSAGE;
  }

  const snapshotColors = [...new Set(snapshot)];
  const resolvedColors = [...new Set(resolvedColorCodes)];
  if (
    snapshotColors.length !== snapshot.length ||
    resolvedColors.length < 1 ||
    resolvedColors.length > 2 ||
    snapshotColors.length !== resolvedColors.length ||
    snapshotColors.some((colorCode) => !resolvedColors.includes(colorCode))
  ) {
    return INVALID_COLOR_SNAPSHOT_MESSAGE;
  }

  return null;
}

export function SimulatorPageContent({
  setup,
  user,
}: {
  setup: SimulatorSetup;
  user: AuthenticatedUser;
}) {
  return <SimulatorScreen setup={setup} user={user} />;
}

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string }>;
}) {
  const session = await requireAuthSession(
    undefined,
    () => redirect("/sign-in?next=%2Fsimulator"),
  );
  const params = await searchParams;
  const user = userFromSession(session);
  const decks = await getOwnedDecks(session.user.id);

  if (params.deck === undefined) {
    return SimulatorPageContent({
      setup: { kind: "select-deck", decks },
      user,
    });
  }

  const selectedDeck = await getOwnedDeck(session.user.id, params.deck);
  if (selectedDeck === null) {
    return SimulatorPageContent({
      setup: setupError(
        "Deck unavailable",
        "That deck is not available for this account. Choose one of your owned decks to continue.",
      ),
      user,
    });
  }

  const { catalogCards, simulatorCatalog } = await loadCatalog();
  const supportedCardCodes = getSupportedCardCodes(simulatorCatalog);
  const playerAdapter = adaptCloudDeck(
    selectedDeck.cards.map(({ cardId, quantity }) => ({ cardId, quantity })),
    simulatorCatalog,
    supportedCardCodes,
  );
  if (!playerAdapter.ok) {
    return SimulatorPageContent({
      setup: setupError("Deck cannot start", playerAdapter.message),
      user,
    });
  }

  const resolvedColorCodes = playerAdapter.entries
    .map(
      ({ cardId }) =>
        simulatorCatalog.find((card) => card.cardId === cardId)?.colorCode,
    )
    .filter((colorCode): colorCode is string => colorCode !== undefined);
  const colorSnapshotError = validateSimulatorDeckColorSnapshot(
    selectedDeck.colorCodes,
    resolvedColorCodes,
  );
  if (colorSnapshotError !== null) {
    return SimulatorPageContent({
      setup: setupError("Deck cannot start", colorSnapshotError),
      user,
    });
  }

  const botAdapter = adaptBotDeck(
    BOT_DEMO_DECK,
    simulatorCatalog,
    supportedCardCodes,
  );
  if (!botAdapter.ok) {
    return SimulatorPageContent({
      setup: setupError(
        "Simulator unavailable",
        `The fixed bot deck cannot start: ${botAdapter.message}`,
      ),
      user,
    });
  }

  const definitions = createSupportedCardDefinitions(simulatorCatalog);
  const missingDefinition = playerAdapter.entries.find(
    (entry) => !definitions.has(entry.cardId),
  );
  if (missingDefinition !== undefined) {
    return SimulatorPageContent({
      setup: setupError(
        "Deck cannot start",
        "One or more cards are incomplete for simulator play. Update the deck and try again.",
      ),
      user,
    });
  }

  return SimulatorPageContent({
    setup: {
      kind: "ready",
      deck: selectedDeck,
      playerEntries: playerAdapter.entries,
      botEntries: botAdapter.entries,
      definitions: [...definitions.values()],
      cards: catalogCards,
    },
    user,
  });
}

async function loadCatalog() {
  const cards = await getCards();
  const { cards: catalogCards, catalog: simulatorCatalog } = toSimulatorCatalog(cards);
  return { catalogCards, simulatorCatalog };
}
