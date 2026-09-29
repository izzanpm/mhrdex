import {
  ChevronRight,
  Clock3,
  Gamepad2,
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
  | "gamepad-2"
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
  "gamepad-2": Gamepad2,
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
