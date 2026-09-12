export type IconName =
  | "cards"
  | "chevron"
  | "close"
  | "decks"
  | "home"
  | "match"
  | "search";

export function AppIcon({ name, size = 15 }: { name: IconName; size?: number }) {
  const iconProps = {
    "aria-hidden": true,
    fill: "none",
    height: size,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.5,
    viewBox: "0 0 24 24",
    width: size,
  };

  switch (name) {
    case "home":
      return (
        <svg {...iconProps}>
          <path d="m4 10 8-6 8 6" />
          <path d="M6 9.5V20h12V9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case "cards":
      return (
        <svg {...iconProps}>
          <rect height="11" rx="1.5" width="8" x="4" y="7" />
          <path d="m7 7 1-3h8a2 2 0 0 1 2 2v8l-3 1" />
        </svg>
      );
    case "decks":
      return (
        <svg {...iconProps}>
          <path d="m4 8 8-4 8 4-8 4-8-4Z" />
          <path d="m4 12 8 4 8-4" />
          <path d="m4 16 8 4 8-4" />
        </svg>
      );
    case "match":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v4l2.5 1.5" />
        </svg>
      );
    case "search":
      return (
        <svg {...iconProps}>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="m15 15 4.5 4.5" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...iconProps}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "close":
      return (
        <svg {...iconProps}>
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      );
  }
}
