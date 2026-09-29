export type SidebarNavKey = "cards" | "decks" | "match" | "simulator";

export type SidebarIconName =
  | "cards"
  | "decks"
  | "gamepad-2"
  | "home"
  | "match";

export type SidebarNavigationItem = {
  comingSoon?: boolean;
  href?: string;
  icon: SidebarIconName;
  key: SidebarNavKey;
  label: string;
};

export const sidebarNavigationItems: readonly SidebarNavigationItem[] = [
  { href: "/", icon: "cards", key: "cards", label: "Cards" },
  {
    href: "/decks",
    icon: "decks",
    key: "decks",
    label: "Decks",
  },
  {
    href: "/match",
    icon: "match",
    key: "match",
    label: "Match",
  },
  {
    href: "/simulator",
    icon: "gamepad-2",
    key: "simulator",
    label: "SIM",
  },
];
