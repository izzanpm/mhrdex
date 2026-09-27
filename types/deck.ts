import type { CardListItem } from "./card";

export type DeckCardDraft = {
  cardId: string;
  quantity: number;
};

export type DeckCatalogCard = {
  cardId: string;
  cardCode: string;
  colorCode: string;
};

export type DeckAddBlockReason =
  | "max_cards"
  | "max_copies"
  | "max_colors"
  | "unknown_card";

export type DeckValidationResult =
  | {
      valid: true;
      total: number;
      colorCodes: string[];
    }
  | {
      valid: false;
      code: "max_cards" | "max_copies" | "max_colors" | "unknown_card" | "invalid_quantity";
      message: string;
    };

export type DeckSummary = {
  id: string;
  name: string;
  cardCount: number;
  colorCodes: string[];
  updatedAt: string;
};

export type DeckCardView = {
  cardId: string;
  cardCode: string;
  name: string;
  colorCode: string;
  imageUrl: string | null;
  quantity: number;
};

export type DeckDetail = DeckSummary & {
  cards: DeckCardView[];
};

export type DeckEditorCard = CardListItem & {
  cardId: string;
  colorCode: string;
};

export type SaveDeckInput = {
  name: string;
  cards: DeckCardDraft[];
};

export type SaveDeckResult =
  | { ok: true }
  | { ok: false; code: string; message: string };
