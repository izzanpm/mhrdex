import Image from "next/image";

import { AppIcon } from "@/components/app-icon";
import type { CardListItem } from "@/types/card";

export function CardGridItem({
  card,
  onClick,
  showDeckControls = false,
}: {
  card: CardListItem;
  onClick?: () => void;
  showDeckControls?: boolean;
}) {
  const localImage =
    card.imageUrl?.startsWith("/") && !card.imageUrl.startsWith("//")
      ? card.imageUrl
      : null;

  return (
    <article
      aria-label={`${card.name}, ${card.cardCode}, ${card.rarityCode}`}
      className="group relative aspect-[744/1040] min-w-0 overflow-hidden rounded-[10px] border border-app-border-image bg-app-image-surface"
    >
      {localImage ? (
        <Image
          alt={card.name}
          className="object-cover"
          fill
          sizes="(min-width: 1536px) 12vw, (min-width: 1024px) 16vw, (min-width: 640px) 25vw, 50vw"
          src={localImage}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0">
          <span className="absolute bottom-0 left-0 w-[72%] origin-bottom-left -rotate-[36deg] border-t border-app-image-line" />
          <span className="absolute bottom-0 right-0 w-[72%] origin-bottom-right rotate-[36deg] border-t border-app-image-line" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-app-shadow/55 to-transparent" />
      {showDeckControls ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          data-deck-controls="true"
        >
          <span
            className="flex size-7 items-center justify-center rounded-full border border-app-border-control bg-app-surface-card/90 text-app-text-panel"
            data-deck-control="minus"
          >
            <AppIcon name="minus" size={12} />
          </span>
          <span
            className="flex size-7 items-center justify-center rounded-full border border-app-border-control bg-app-surface-card/90 text-app-text-panel"
            data-deck-control="plus"
          >
            <AppIcon name="plus" size={12} />
          </span>
        </div>
      ) : null}
      {onClick ? (
        <button
          aria-label={`Open details for ${card.name}, ${card.cardCode}, ${card.rarityCode}`}
          className="absolute inset-0 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-inset"
          onClick={onClick}
          type="button"
        />
      ) : null}
    </article>
  );
}
