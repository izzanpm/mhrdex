import Image from "next/image";

import type { CardListItem } from "@/types/card";

export function CardGridItem({ card }: { card: CardListItem }) {
  const localImage =
    card.imageUrl?.startsWith("/") && !card.imageUrl.startsWith("//")
      ? card.imageUrl
      : null;

  return (
    <article
      aria-label={`${card.name}, ${card.cardCode}`}
      className="relative aspect-[3/4] min-w-0 overflow-hidden rounded-[10px] border border-app-border-image bg-app-image-surface"
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
      <p className="absolute bottom-[15px] left-[14px] font-mono text-[8px] uppercase tracking-[0.04em] text-app-text-muted">
        {card.cardType ?? "Card"}
      </p>
    </article>
  );
}
