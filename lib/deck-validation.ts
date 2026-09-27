import type {
  DeckAddBlockReason,
  DeckCatalogCard,
  DeckCardDraft,
  DeckValidationResult,
} from "@/types/deck";

export type {
  DeckCatalogCard,
  DeckCardDraft,
} from "@/types/deck";

const MAX_CARDS = 50;
const MAX_COPIES = 3;
const MAX_COLORS = 2;

function getCatalogMap(catalog: readonly DeckCatalogCard[]) {
  return new Map(catalog.map((card) => [card.cardId, card]));
}

function getUnique(values: readonly string[]) {
  return [...new Set(values)];
}

export function getDraftColorCodes(
  entries: readonly DeckCardDraft[],
  catalog: readonly DeckCatalogCard[],
): string[] {
  const catalogMap = getCatalogMap(catalog);
  const activeColors = new Set<string>();

  for (const entry of entries) {
    if (entry.quantity <= 0) continue;
    const card = catalogMap.get(entry.cardId);
    if (card) activeColors.add(card.colorCode);
  }

  return catalog
    .map((card) => card.colorCode)
    .filter((colorCode, index, colors) =>
      activeColors.has(colorCode) && colors.indexOf(colorCode) === index,
    );
}

export function getAllowedColorCodes(
  entries: readonly DeckCardDraft[],
  catalog: readonly DeckCatalogCard[],
  allColorCodes: readonly string[],
): string[] {
  const activeColors = getDraftColorCodes(entries, catalog);
  return activeColors.length < MAX_COLORS
    ? getUnique(allColorCodes)
    : activeColors;
}

function getCardCodeQuantity(
  cardCode: string,
  entries: readonly DeckCardDraft[],
  catalogMap: ReadonlyMap<string, DeckCatalogCard>,
) {
  return entries.reduce((total, entry) => {
    return total + (catalogMap.get(entry.cardId)?.cardCode === cardCode ? entry.quantity : 0);
  }, 0);
}

export function getCardAddBlockReason(
  entry: DeckCardDraft,
  entries: readonly DeckCardDraft[],
  catalog: readonly DeckCatalogCard[],
): DeckAddBlockReason | null {
  const catalogMap = getCatalogMap(catalog);
  const card = catalogMap.get(entry.cardId);
  if (!card) return "unknown_card";

  const total = entries.reduce((sum, current) => sum + current.quantity, 0);
  if (total >= MAX_CARDS) return "max_cards";
  if (getCardCodeQuantity(card.cardCode, entries, catalogMap) >= MAX_COPIES) {
    return "max_copies";
  }

  const activeColors = getDraftColorCodes(entries, catalog);
  if (!activeColors.includes(card.colorCode) && activeColors.length >= MAX_COLORS) {
    return "max_colors";
  }

  return null;
}

export function canAddDeckCard(
  entry: DeckCardDraft,
  entries: readonly DeckCardDraft[],
  catalog: readonly DeckCatalogCard[],
) {
  return getCardAddBlockReason(entry, entries, catalog) === null;
}

export function validateDeckContents(
  entries: readonly DeckCardDraft[],
  catalog: readonly DeckCatalogCard[],
): DeckValidationResult {
  const catalogMap = getCatalogMap(catalog);
  const codeQuantities = new Map<string, number>();
  const colors = new Set<string>();
  let total = 0;

  for (const entry of entries) {
    if (!Number.isInteger(entry.quantity) || entry.quantity < 1) {
      return {
        valid: false,
        code: "invalid_quantity",
        message: "Card quantities must be positive integers.",
      };
    }

    const card = catalogMap.get(entry.cardId);
    if (!card) {
      return {
        valid: false,
        code: "unknown_card",
        message: "One or more selected cards no longer exist.",
      };
    }

    total += entry.quantity;
    if (total > MAX_CARDS) {
      return {
        valid: false,
        code: "max_cards",
        message: "A deck can contain at most 50 cards.",
      };
    }

    const codeQuantity = (codeQuantities.get(card.cardCode) ?? 0) + entry.quantity;
    if (codeQuantity > MAX_COPIES) {
      return {
        valid: false,
        code: "max_copies",
        message: `A deck can contain at most 3 copies of ${card.cardCode}.`,
      };
    }

    codeQuantities.set(card.cardCode, codeQuantity);
    colors.add(card.colorCode);
    if (colors.size > MAX_COLORS) {
      return {
        valid: false,
        code: "max_colors",
        message: "A deck can contain cards from at most 2 colors.",
      };
    }
  }

  return {
    valid: true,
    total,
    colorCodes: catalog
      .map((card) => card.colorCode)
      .filter((colorCode, index, colorList) =>
        colors.has(colorCode) && colorList.indexOf(colorCode) === index,
      ),
  };
}
