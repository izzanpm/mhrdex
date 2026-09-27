"use client";

import { useDeferredValue, useState } from "react";

import { AppIcon } from "@/components/app-icon";
import { CardDetailModal, getCardVariants } from "@/components/card-detail-modal";
import {
  CatalogState,
  EMPTY_FILTERS,
  FilterSheet,
  filterCards,
  getFilterOptions,
} from "@/components/card-library";
import { CardGridItem } from "@/components/card-grid-item";
import { Input } from "@/components/ui/input";
import { formatDeckColorName } from "@/lib/deck-colors";
import { cn } from "@/lib/utils";
import {
  getAllowedColorCodes,
  getCardAddBlockReason,
  type DeckCardDraft,
} from "@/lib/deck-validation";
import type { CardFilters, CardListItem } from "@/types/card";
import type { DeckCatalogCard } from "@/types/deck";

const BLOCK_REASON_LABELS = {
  max_cards: "Deck is full at 50 cards.",
  max_colors: "A third card color is not allowed.",
  max_copies: "This card already has 3 copies.",
  unknown_card: "This card is unavailable.",
} as const;

const DEFAULT_FILTERS: CardFilters = {
  ...EMPTY_FILTERS,
  baseOnly: true,
};

function getQuantity(cardId: string, entries: readonly DeckCardDraft[]) {
  return entries.find((entry) => entry.cardId === cardId)?.quantity ?? 0;
}

function getCatalog(cards: CardListItem[]): DeckCatalogCard[] {
  return cards.flatMap(({ cardId, cardCode, colorCode }) =>
    colorCode ? [{ cardId, cardCode, colorCode }] : [],
  );
}

export function DeckBuilderCardSearch({
  cards,
  draftEntries,
  allColorCodes,
  loadError = false,
  onQuantityChange,
}: {
  cards: CardListItem[];
  draftEntries: DeckCardDraft[];
  allColorCodes: string[];
  loadError?: boolean;
  onQuantityChange: (cardId: string, delta: -1 | 1) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<CardFilters>({
    ...DEFAULT_FILTERS,
  });
  const [selectedCard, setSelectedCard] = useState<CardListItem | null>(null);
  const deferredQuery = useDeferredValue(query);
  const catalog = getCatalog(cards);
  const { sets: setOptions, traits: traitOptions } = getFilterOptions(cards);
  const allowedColorCodes = getAllowedColorCodes(
    draftEntries,
    catalog,
    allColorCodes,
  );
  const visibleCards = filterCards(cards, deferredQuery, activeFilters).filter(
    (card) => card.colorCode && allowedColorCodes.includes(card.colorCode),
  );
  const hasActiveFilters =
    activeFilters.baseOnly ||
    activeFilters.colorCodes.length > 0 ||
    activeFilters.levels.length > 0 ||
    activeFilters.ranges.length > 0 ||
    activeFilters.rarityCode !== null ||
    activeFilters.setCodes.length > 0 ||
    activeFilters.traitNames.length > 0;
  const foundLabel = loadError
    ? "Card count unavailable"
    : `${visibleCards.length} results`;

  function clearSearch() {
    setQuery("");
    setActiveFilters({ ...DEFAULT_FILTERS });
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Search cards by name or code</span>
          <span className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-app-text-muted">
            <AppIcon name="search" size={12} />
          </span>
          <Input
            aria-label="Card search"
            className="h-[52px] w-full rounded-[8px] border-0 bg-app-surface-card pl-[52px] pr-6 text-[13px] text-app-text-panel placeholder:text-app-text-muted focus-visible:border-app-border-control focus-visible:ring-1 focus-visible:ring-app-accent"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search cards by name..."
            type="search"
            value={query}
          />
        </label>
        <FilterSheet
          activeFilters={activeFilters}
          iconOnly
          onApply={setActiveFilters}
          resetFilters={DEFAULT_FILTERS}
          setOptions={setOptions}
          showBaseFilter={true}
          traitOptions={traitOptions}
          triggerClassName="h-[52px] w-[52px] shrink-0 rounded-[8px] border-0 bg-app-surface-card p-0 text-app-text-panel hover:border-0 hover:bg-app-surface-card hover:text-app-text-panel lg:w-[52px]"
        />
      </div>

      <div className="mt-7 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.08em]">
        <span className="text-app-text-muted">Search cards</span>
        <span aria-live="polite" className="text-app-amber">
          {foundLabel}
        </span>
      </div>
      {allowedColorCodes.length < allColorCodes.length ? (
        <p role="alert" className="mt-3 text-[10px] leading-4 text-app-amber">
          Search is limited to the deck&apos;s selected colors: {allowedColorCodes
            .map(formatDeckColorName)
            .join(" and ")}.
        </p>
      ) : null}

      {loadError ? (
        <CatalogState error />
      ) : visibleCards.length === 0 ? (
        <CatalogState
          hasFilters={hasActiveFilters}
          hasQuery={query.trim().length > 0}
          onClear={clearSearch}
        />
      ) : (
        <section
          aria-label="Card results"
          className="mt-5 grid grid-cols-3 gap-1 max-[319px]:grid-cols-2"
        >
          {visibleCards.map((card) => {
            const quantity = getQuantity(card.cardId, draftEntries);
            const showControls = quantity > 0;
            const blockReason = getCardAddBlockReason(
              { cardId: card.cardId, quantity: 1 },
              draftEntries,
              catalog,
            );
            const blockMessage = blockReason
              ? BLOCK_REASON_LABELS[blockReason]
              : null;

            return (
              <div className="group relative min-w-0" key={card.id}>
                <CardGridItem
                  card={card}
                  onClick={() => setSelectedCard(card)}
                />
                <div
                  className={cn(
                    "absolute inset-x-0 bottom-1 z-10 flex justify-between transition-opacity",
                    showControls
                      ? "pointer-events-auto opacity-100"
                      : "pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-focus-within:pointer-events-auto",
                  )}
                >
                  <button
                    aria-label={`Remove one ${card.name}`}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-app-border-control bg-app-surface-card/95 text-app-text-panel outline-none transition-colors hover:border-app-accent hover:text-app-accent focus-visible:ring-2 focus-visible:ring-app-accent disabled:cursor-not-allowed disabled:opacity-35"
                    data-deck-control="minus"
                    disabled={quantity === 0}
                    onClick={() => onQuantityChange(card.cardId, -1)}
                    type="button"
                  >
                    <AppIcon name="minus" size={12} />
                  </button>
                  <button
                    aria-label={
                      blockMessage
                        ? `${card.name}: ${blockMessage}`
                        : `Add one ${card.name}`
                    }
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-app-border-control bg-app-surface-card/95 text-app-text-panel outline-none transition-colors hover:border-app-accent hover:text-app-accent focus-visible:ring-2 focus-visible:ring-app-accent disabled:cursor-not-allowed disabled:opacity-35"
                    data-deck-control="plus"
                    disabled={blockReason !== null}
                    onClick={() => onQuantityChange(card.cardId, 1)}
                    title={blockMessage ?? undefined}
                    type="button"
                  >
                    <AppIcon name="plus" size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}
      <CardDetailModal
        card={selectedCard}
        key={selectedCard?.id ?? "deck-builder-card-detail-closed"}
        onOpenChange={(open) => {
          if (!open) setSelectedCard(null);
        }}
        open={selectedCard !== null}
        variants={selectedCard ? getCardVariants(cards, selectedCard.cardCode) : []}
      />
    </>
  );
}
