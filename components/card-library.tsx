"use client";

import { useDeferredValue, useState } from "react";

import { AppIcon } from "@/components/app-icon";
import { CardGridItem } from "@/components/card-grid-item";
import type { CardListItem } from "@/types/card";

const copy = {
  accountNotice: "Account settings are coming soon.",
  emptyMessage: "Cards will appear here after catalog data is added.",
  emptyTitle: "No cards in the catalog yet",
  filterNotice: "Filters are coming soon.",
  placeholder: "Search by card name or code...",
} as const;

export function filterCards(cards: CardListItem[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) return cards;

  return cards.filter(
    (card) =>
      card.name.toLocaleLowerCase().includes(normalizedQuery) ||
      card.cardCode.toLocaleLowerCase().includes(normalizedQuery),
  );
}

function CatalogState({
  error,
  hasQuery,
  onClear,
}: {
  error?: boolean;
  hasQuery?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="mx-auto mt-16 w-full max-w-[420px] border-t border-app-border-strong px-4 pt-7 text-center">
      <h2 className="text-sm font-medium text-app-text-card">
        {error
          ? "Card catalog could not be loaded"
          : hasQuery
            ? "No cards match this search"
            : copy.emptyTitle}
      </h2>
      <p className="mt-2 text-[11px] leading-5 text-app-text-muted">
        {error
          ? "Check the database connection, then reload this page."
          : hasQuery
            ? "Try another card name or code."
            : copy.emptyMessage}
      </p>
      {hasQuery ? (
        <button
          className="mt-5 min-h-11 px-4 font-mono text-[9px] uppercase tracking-[0.08em] text-app-accent hover:text-app-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
          onClick={onClear}
          type="button"
        >
          Clear search
        </button>
      ) : null}
    </div>
  );
}

export function CardLibrary({
  cards,
  loadError = false,
}: {
  cards: CardListItem[];
  loadError?: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const visibleCards = filterCards(cards, deferredQuery);
  const foundLabel = loadError
    ? "Card count unavailable"
    : `${visibleCards.length} ${visibleCards.length === 1 ? "card" : "cards"} found`;

  return (
    <>
      <header className="flex items-start justify-between gap-5">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">
            Card Library
          </p>
          <h1 className="mt-5 text-[30px] font-normal leading-none tracking-[-0.02em] text-app-text-strong">
            Card Library
          </h1>
        </div>

        <div className="flex items-center gap-[30px]">
          <div className="flex flex-col items-end gap-2">
            <div aria-label="Language" className="relative h-10 w-[130px]" role="group">
              <div className="absolute inset-0 flex items-center rounded-[9px] border border-app-border bg-app-surface p-1">
                <span className="flex h-8 flex-1 items-center justify-center rounded-[5px] bg-app-accent px-2 font-mono text-[9px] uppercase tracking-[0.08em] text-app-canvas">
                  ENG
                </span>
                <button
                  aria-label="Indonesian language, coming soon"
                  className="flex h-8 min-w-11 flex-1 items-center justify-center rounded-[5px] px-2 font-mono text-[9px] uppercase tracking-[0.08em] text-app-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
                  onClick={() => setNotice("Bahasa Indonesia is coming soon.")}
                  type="button"
                >
                  IDN
                </button>
              </div>
            </div>
            <span className="font-mono text-[8px] tracking-[0.04em] text-app-text-dim">
              IDN - Coming soon
            </span>
          </div>
          <button
            aria-label="Account settings, coming soon"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-app-border bg-app-surface font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-muted transition-colors hover:border-app-accent hover:text-app-text-logo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
            onClick={() => setNotice(copy.accountNotice)}
            type="button"
          >
            EP
          </button>
        </div>
      </header>

      <div className="mt-[31px] grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-4">
        <label className="relative block">
          <span className="sr-only">{copy.placeholder}</span>
          <span className="pointer-events-none absolute left-[25px] top-1/2 -translate-y-1/2 text-app-text-muted">
            <AppIcon name="search" size={12} />
          </span>
          <input
            className="h-[53px] w-full rounded-[9px] border border-app-border bg-app-surface-input pl-[52px] pr-4 text-[13px] text-app-text outline-none placeholder:text-app-text-muted focus:border-app-text-dim focus:ring-1 focus:ring-app-accent"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.placeholder}
            type="search"
            value={query}
          />
        </label>
        <button
          className="min-h-[53px] rounded-[9px] border border-app-border bg-app-surface-input px-3 font-mono text-[10px] font-medium tracking-[0.06em] text-app-text-logo transition-colors hover:border-app-accent hover:text-app-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent lg:w-fit lg:justify-self-end"
          onClick={() => setNotice(copy.filterNotice)}
          type="button"
        >
          Filter
        </button>
      </div>

      <div className="mt-[23px] border-b border-app-border-soft pb-[18px]">
        <p aria-live="polite" className="text-[13px] text-app-text-muted">
          {foundLabel}
        </p>
      </div>

      {loadError ? (
        <CatalogState error />
      ) : visibleCards.length === 0 ? (
        <CatalogState
          hasQuery={query.trim().length > 0}
          onClear={() => setQuery("")}
        />
      ) : (
        <section
          aria-label="Card results"
          className="mt-[30px] grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8"
        >
          {visibleCards.map((card) => (
            <CardGridItem card={card} key={card.id} />
          ))}
        </section>
      )}

      {notice ? (
        <div
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-4 rounded-[6px] border border-app-border-notice bg-app-surface-card px-4 py-3 text-sm text-app-text-notice shadow-xl shadow-app-shadow/25"
        >
          <span>{notice}</span>
          <button
            aria-label="Dismiss notice"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[5px] text-app-text-subtle hover:bg-app-surface-modal-close hover:text-app-text-logo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
            onClick={() => setNotice(null)}
            type="button"
          >
            <AppIcon name="close" size={14} />
          </button>
        </div>
      ) : null}
    </>
  );
}
