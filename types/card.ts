export type CardListItem = {
  id: string;
  cardId: string;
  cardCode: string;
  name: string;
  cardType: string | null;
  rarityCode: string;
  isBase: boolean;
  imageUrl: string | null;
  colorCode?: string | null;
  level?: number;
  range?: string | null;
  setCode?: string | null;
  traitNames?: string[];
};

export type CardFilters = {
  baseOnly: boolean;
  colorCodes: string[];
  levels: number[];
  ranges: string[];
  rarityCode: string | null;
  setCodes: string[];
  traitNames: string[];
};
