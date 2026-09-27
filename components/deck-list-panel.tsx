"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { AppIcon } from "@/components/app-icon";
import { createDeck } from "@/lib/deck-actions";
import {
  formatDeckColorName,
  getDeckColorClass,
} from "@/lib/deck-colors";
import { filterDeckSummaries } from "@/lib/deck-list";
import { cn } from "@/lib/utils";
import type { DeckSummary } from "@/types/deck";

export function ColorDots({ colorCodes }: { colorCodes: string[] }) {
  if (colorCodes.length === 0) {
    return <span className="text-[10px] text-app-text-dim">No colors</span>;
  }

  const colorNames = colorCodes.map(formatDeckColorName);

  return (
    <span
      aria-label={`${colorNames.join(" and ")} colors`}
      className="flex gap-1.5"
      role="img"
    >
      {colorCodes.map((colorCode) => (
        <span
          aria-label={formatDeckColorName(colorCode)}
          className={cn("size-3 rounded-full", getDeckColorClass(colorCode))}
          key={colorCode}
          title={formatDeckColorName(colorCode)}
        />
      ))}
    </span>
  );
}

export function CreateDeckForm() {
  return (
    <form action={createDeck} data-deck-create="true">
      <button
        className="flex min-h-11 w-full items-center justify-center rounded-[9px] bg-app-accent text-[12px] text-app-canvas outline-none transition-colors hover:bg-app-accent-hover focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface"
        type="submit"
      >
        New deck
      </button>
    </form>
  );
}

function DeckSummaryLink({
  deck,
  selected,
}: {
  deck: DeckSummary;
  selected: boolean;
}) {
  const progress = Math.min(100, (deck.cardCount / 50) * 100);

  return (
    <Link
      aria-current={selected ? "page" : undefined}
      className={cn(
        "block rounded-[8px] border p-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-app-accent",
        selected
          ? "border-app-accent bg-app-surface-active"
          : "border-transparent bg-app-surface-card hover:border-app-border-control hover:bg-app-surface-hover",
      )}
      href={`/decks?deck=${deck.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-[12px] text-app-text-strong">{deck.name}</h3>
        <span className="shrink-0 font-mono text-[10px] text-app-card-yellow">
          {deck.cardCount}/50
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="truncate font-mono text-[9px] text-app-text-dim">
          {deck.colorCodes.length > 0
            ? deck.colorCodes.map(formatDeckColorName).join(" · ")
            : "No colors"}
        </span>
        <ColorDots colorCodes={deck.colorCodes} />
      </div>
      <div
        aria-label={`${deck.cardCount} of 50 cards`}
        className="mt-4 h-1 rounded-full bg-app-progress-track"
        data-deck-progress={deck.cardCount}
      >
        <div
          className="h-full rounded-full bg-app-card-yellow transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </Link>
  );
}

export function DeckListPanel({
  decks,
  selectedDeckId,
}: {
  decks: DeckSummary[];
  selectedDeckId: string | null;
}) {
  const [query, setQuery] = useState("");
  const visibleDecks = filterDeckSummaries(decks, useDeferredValue(query));

  return (
    <aside className="min-w-0 rounded-[10px] border border-app-border-soft bg-app-surface p-3 sm:p-4">
      <div className="grid gap-2">
        <div className="relative" data-deck-search-field>
          <label className="sr-only" htmlFor="deck-search">
            Search decks by name
          </label>
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-app-text-dim"
            data-deck-search-icon
          >
            <AppIcon name="search" size={13} />
          </span>
          <input
            aria-label="Deck search"
            className="h-11 w-full rounded-[8px] border border-app-border-soft bg-app-surface-card pl-9 pr-3 text-[11px] text-app-text-panel outline-none placeholder:text-app-text-dim focus:border-app-accent focus:ring-1 focus:ring-app-accent"
            id="deck-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search decks by name..."
            type="search"
            value={query}
          />
        </div>
        <CreateDeckForm />
      </div>

      {visibleDecks.length > 0 ? (
        <div className="mt-6 grid gap-4">
          {visibleDecks.map((deck) => (
            <DeckSummaryLink
              deck={deck}
              key={deck.id}
              selected={selectedDeckId === deck.id}
            />
          ))}
        </div>
      ) : (
        <p
          className="mt-6 rounded-[8px] border border-dashed border-app-border-dashed px-4 py-6 text-center text-[11px] leading-4 text-app-text-muted"
          role="status"
        >
          No decks match your search.
        </p>
      )}
    </aside>
  );
}
