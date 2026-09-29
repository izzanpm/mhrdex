export type CardListItem = {
  id: string;
  cardId: string;
  cardCode: string;
  name: string;
  cardType: string | null;
  rarityCode: string;
  isBase: boolean;
  imageUrl: string | null;
  power: number | null;
  range: number | null;
  abilityText: string | null;
  colorCode?: string | null;
  level?: number;
  setCode?: string | null;
  traitNames?: string[];
};

export type CardFilters = {
  baseOnly: boolean;
  colorCodes: string[];
  levels: number[];
  ranges: number[];
  rarityCode: string | null;
  setCodes: string[];
  traitNames: string[];
};

export function normalizeCardType(value: string): string;
export function normalizeCardType(value: string | null): string | null;
export function normalizeCardType(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;
  return `${trimmed[0]!.toUpperCase()}${trimmed.slice(1).toLowerCase()}`;
}
