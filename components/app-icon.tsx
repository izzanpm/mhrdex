import {
  ChevronRight,
  Clock3,
  House,
  ListSortDescending,
  Layers,
  Minus,
  Pencil,
  Plus,
  PlayingCardsFan,
  Save,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

export type IconName =
  | "cards"
  | "chevron"
  | "close"
  | "decks"
  | "home"
  | "list-sort-descending"
  | "match"
  | "minus"
  | "pencil"
  | "plus"
  | "save"
  | "search"
  | "trash";

const ICONS: Record<IconName, LucideIcon> = {
  cards: PlayingCardsFan,
  chevron: ChevronRight,
  close: X,
  decks: Layers,
  home: House,
  "list-sort-descending": ListSortDescending,
  match: Clock3,
  minus: Minus,
  pencil: Pencil,
  plus: Plus,
  save: Save,
  search: Search,
  trash: Trash2,
};

export function AppIcon({ name, size = 15 }: { name: IconName; size?: number }) {
  const Icon = ICONS[name];

  return <Icon aria-hidden size={size} strokeWidth={1.5} />;
}
