export type SidebarNavKey = "cards" | "decks" | "match";

export type SidebarIconName = "cards" | "decks" | "home" | "match";

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
    comingSoon: true,
    icon: "decks",
    key: "decks",
    label: "Decks",
  },
  {
    comingSoon: true,
    icon: "match",
    key: "match",
    label: "Match",
  },
];
