const DECK_COLOR_CLASSES: Record<string, string> = {
  blue: "bg-app-card-blue",
  green: "bg-app-card-green",
  orange: "bg-app-amber",
  purple: "bg-app-accent",
  red: "bg-app-card-red",
  yellow: "bg-app-card-yellow",
};

export function formatDeckColorName(colorCode: string) {
  return colorCode.charAt(0).toUpperCase() + colorCode.slice(1);
}

export function getDeckColorClass(colorCode: string) {
  return DECK_COLOR_CLASSES[colorCode] ?? "bg-app-text-dim";
}
