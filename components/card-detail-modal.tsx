"use client";

import Image from "next/image";
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { CardListItem } from "@/types/card";

export const CARD_DETAIL_LAYER_CLASS = "z-50";
export const CARD_DETAIL_POPUP_WIDTH_CLASS = "lg:w-fit";
export const CARD_DETAIL_GRID_CLASS = "lg:grid-cols-[320px_auto]";
export const CARD_DETAIL_TITLE_CLASS = "whitespace-nowrap";

export function getCardVariants(cards: CardListItem[], cardCode: string) {
  return cards.filter((card) => card.cardCode === cardCode);
}

function CardArtwork({
  card,
  className,
  sizes,
}: {
  card: CardListItem;
  className?: string;
  sizes: string;
}) {
  const localImage =
    card.imageUrl?.startsWith("/") && !card.imageUrl.startsWith("//")
      ? card.imageUrl
      : null;

  if (localImage) {
    return (
      <Image
        alt={`${card.name}, ${card.rarityCode} variant`}
        className={cn("object-cover", className)}
        fill
        sizes={sizes}
        src={localImage}
      />
    );
  }

  return (
    <span aria-hidden="true" className="absolute inset-0 bg-app-image-surface">
      <span className="absolute bottom-0 left-0 w-[72%] origin-bottom-left -rotate-[36deg] border-t border-app-image-line" />
      <span className="absolute bottom-0 right-0 w-[72%] origin-bottom-right rotate-[36deg] border-t border-app-image-line" />
    </span>
  );
}

function LanguageSwitch() {
  return (
    <>
      <div
        aria-label="Language"
        className="flex h-10 w-[130px] items-center rounded-[9px] border border-app-border bg-app-surface p-1"
        role="group"
      >
        <span className="flex h-8 flex-1 items-center justify-center rounded-[5px] bg-app-accent px-2 font-mono text-[9px] uppercase tracking-[0.08em] text-app-canvas">
          ENG
        </span>
        <Switch
          aria-label="Indonesian language, coming soon"
          checked={false}
          className="mx-1 shrink-0 data-unchecked:bg-app-accent/40"
          disabled
        />
        <span className="flex h-8 flex-1 items-center justify-center rounded-[5px] px-2 font-mono text-[9px] uppercase tracking-[0.08em] text-app-text-muted">
          IDN
        </span>
      </div>
      <p className="mt-3 font-mono text-[9px] tracking-[0.04em] text-app-text-muted">
        IDN&nbsp;&nbsp;·&nbsp;&nbsp;Coming soon
      </p>
    </>
  );
}

function VariantThumbnail({
  active,
  card,
  onClick,
}: {
  active: boolean;
  card: CardListItem;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`${card.rarityCode} variant`}
      aria-pressed={active}
      className={cn(
        "w-[62px] shrink-0 rounded-[7px] border bg-app-surface-input p-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-app-accent",
        active
          ? "border-app-accent"
          : "border-app-border hover:border-app-text-dim",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="relative block aspect-[744/1040] overflow-hidden rounded-[4px]">
        <CardArtwork card={card} sizes="54px" />
      </span>
      <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.04em] text-app-text-muted">
        {card.rarityCode}
      </span>
    </button>
  );
}

export function CardDetailModal({
  card,
  onOpenChange,
  open,
  variants,
}: {
  card: CardListItem | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  variants: CardListItem[];
}) {
  const [activeVariantId, setActiveVariantId] = useState(card?.id ?? "");

  if (!card) return null;

  const activeVariant =
    variants.find((variant) => variant.id === activeVariantId) ??
    variants[0] ??
    card;

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            CARD_DETAIL_LAYER_CLASS,
            "fixed inset-0 bg-app-overlay/80 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
          )}
        />
        <Dialog.Popup
          className={cn(
            CARD_DETAIL_LAYER_CLASS,
            CARD_DETAIL_POPUP_WIDTH_CLASS,
            "fixed top-1/2 left-1/2 flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[1200px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-[10px] border border-app-border bg-app-surface p-6 text-app-text shadow-2xl outline-none transition-[scale,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 sm:p-8 lg:p-[50px]",
          )}
        >
          <Dialog.Close
            aria-label="Close card details"
            className="absolute top-5 right-5 flex size-11 items-center justify-center rounded-[9px] border border-app-border bg-app-surface-modal-close text-app-text-muted outline-none transition-colors hover:border-app-text-dim hover:text-app-text focus-visible:ring-2 focus-visible:ring-app-accent"
          >
            <XIcon data-icon="inline-start" />
          </Dialog.Close>

          <div
            className={cn(
              CARD_DETAIL_GRID_CLASS,
              "mt-8 grid min-h-0 gap-10 lg:mt-8 lg:gap-[78px]",
            )}
          >
            <div className="min-w-0">
              <div className="relative aspect-[744/1040] overflow-hidden rounded-[9px] border border-app-amber bg-app-image-surface">
                <CardArtwork
                  card={activeVariant}
                  sizes="(min-width: 1024px) 320px, 82vw"
                />
              </div>

              {variants.length > 1 ? (
                <div className="mt-4">
                  <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-dim">
                    Variants
                  </p>
                  <div
                    aria-label="Card variants"
                    className="flex max-w-full gap-2 overflow-x-auto pb-1"
                  >
                    {variants.map((variant) => (
                      <VariantThumbnail
                        active={activeVariant.id === variant.id}
                        card={variant}
                        key={variant.id}
                        onClick={() => setActiveVariantId(variant.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col lg:min-w-max lg:max-w-[420px]">
              <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-app-text-muted">
                <span>{card.cardType ?? "Card"}</span>
                <span className="mx-2">·</span>
                <span>{activeVariant.rarityCode}</span>
                <span className="mx-2">·</span>
                <span>{card.setCode ?? "Set"}</span>
                <span className="mx-2">·</span>
                <span>{card.cardCode}</span>
              </div>
              <Dialog.Title
                className={cn(
                  CARD_DETAIL_TITLE_CLASS,
                  "mt-5 text-[26px] font-medium leading-none tracking-[-0.02em] text-app-text-strong sm:text-[30px]",
                )}
              >
                {card.name}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Card artwork and available variants for {card.name}.
              </Dialog.Description>

              <div className="mt-8">
                <p className="mb-3 font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-dim">
                  Language
                </p>
                <LanguageSwitch />
              </div>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
