import {
  validateDeckContents,
  type DeckCatalogCard,
} from "@/lib/deck-validation";

import type {
  AdapterResult,
  CardInstance,
  PlayerId,
  SimulatorBotDeckEntry,
  SimulatorCatalogCard,
  SimulatorDeckEntry,
} from "./types";

type AdapterEntry = SimulatorDeckEntry | SimulatorBotDeckEntry;

function adapterError(
  code: Exclude<AdapterResult, { ok: true }>["code"],
  message: string,
  cardCode?: string,
): AdapterResult {
  return cardCode === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, cardCode };
}

function isSimulatorCard(card: SimulatorCatalogCard) {
  return card.isBase && card.cardType === "Character";
}

function getOverLimitCardCode(
  entries: readonly SimulatorDeckEntry[],
  cards: readonly SimulatorCatalogCard[],
) {
  const quantities = new Map<string, number>();

  for (const [index, entry] of entries.entries()) {
    const cardCode = cards[index].cardCode;
    const quantity = (quantities.get(cardCode) ?? 0) + entry.quantity;
    quantities.set(cardCode, quantity);
    if (quantity > 3) return cardCode;
  }

  return undefined;
}

function validateResolvedEntries(
  entries: readonly SimulatorDeckEntry[],
  cards: readonly SimulatorCatalogCard[],
): AdapterResult {
  const deckCatalog: DeckCatalogCard[] = cards.map(
    ({ cardId, cardCode, colorCode }) => ({ cardId, cardCode, colorCode }),
  );
  const validation = validateDeckContents(entries, deckCatalog);

  if (!validation.valid) {
    switch (validation.code) {
      case "max_cards":
      case "invalid_quantity":
        return adapterError("invalid-deck-size", validation.message);
      case "max_copies": {
        return adapterError(
          "invalid-copy-count",
          validation.message,
          getOverLimitCardCode(entries, cards),
        );
      }
      case "max_colors":
        return adapterError("invalid-color-count", validation.message);
      case "unknown_card":
        return adapterError("missing-card", validation.message);
    }
  }

  if (validation.total !== 50) {
    return adapterError(
      "invalid-deck-size",
      "A simulator deck must contain exactly 50 cards.",
    );
  }

  return { ok: true, entries };
}

function adaptEntries(
  entries: readonly AdapterEntry[],
  catalog: readonly SimulatorCatalogCard[],
  supportedCardCodes: ReadonlySet<string>,
  resolveCard: (entry: AdapterEntry) => SimulatorCatalogCard | undefined,
): AdapterResult {
  const resolvedEntries: SimulatorDeckEntry[] = [];
  const resolvedCards: SimulatorCatalogCard[] = [];

  for (const entry of entries) {
    const requestedCardCode = "cardCode" in entry ? entry.cardCode : undefined;
    const card = resolveCard(entry);

    if (!card || !isSimulatorCard(card)) {
      const reference = requestedCardCode ?? ("cardId" in entry ? entry.cardId : "card");
      return adapterError(
        "missing-card",
        `Simulator card ${reference} is missing a base Character definition.`,
        requestedCardCode,
      );
    }

    if (!supportedCardCodes.has(card.cardCode)) {
      return adapterError(
        "unsupported-card",
        `Card ${card.cardCode} is not supported by the simulator.`,
        card.cardCode,
      );
    }

    if (card.power === null) {
      return adapterError(
        "missing-power",
        `Card ${card.cardCode} is missing Power.`,
        card.cardCode,
      );
    }

    if (card.range === null) {
      return adapterError(
        "missing-range",
        `Card ${card.cardCode} is missing Range.`,
        card.cardCode,
      );
    }

    resolvedEntries.push({
      cardId: card.cardId,
      quantity: entry.quantity,
    });
    resolvedCards.push(card);
  }

  return validateResolvedEntries(resolvedEntries, resolvedCards);
}

export function adaptCloudDeck(
  entries: readonly SimulatorDeckEntry[],
  catalog: readonly SimulatorCatalogCard[],
  supportedCardCodes: ReadonlySet<string>,
): AdapterResult {
  return adaptEntries(entries, catalog, supportedCardCodes, (entry) => {
    if (!("cardId" in entry)) return undefined;
    return catalog.find(
      (card) => card.cardId === entry.cardId && isSimulatorCard(card),
    );
  });
}

export function adaptBotDeck(
  entries: readonly SimulatorBotDeckEntry[],
  catalog: readonly SimulatorCatalogCard[],
  supportedCardCodes: ReadonlySet<string>,
): AdapterResult {
  return adaptEntries(entries, catalog, supportedCardCodes, (entry) => {
    if (!("cardCode" in entry)) return undefined;
    return catalog.find(
      (card) => card.cardCode === entry.cardCode && isSimulatorCard(card),
    );
  });
}

export function createRuntimeRushPointDeck(ownerId: PlayerId): CardInstance[] {
  return Array.from({ length: 9 }, (_, index) => ({
    instanceId: `${ownerId}-rush-point-${index + 1}`,
    cardCode: "RUSH-POINT",
    ownerId,
    controllerId: ownerId,
    zone: "rushPointDeck" as const,
    faceDown: true,
    covered: false,
    attachedTo: null,
    attachmentIds: [],
    modifiers: [],
    turnState: {
      attacked: false,
      moved: false,
      placed: false,
      usedEffectIds: [],
    },
  }));
}
