"use client";

import { useDeferredValue, useState, type ReactNode } from "react";

import { AccountControls } from "@/components/account-controls";
import { AppIcon } from "@/components/app-icon";
import { CardDetailModal, getCardVariants } from "@/components/card-detail-modal";
import { CardGridItem } from "@/components/card-grid-item";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CardFilters, CardListItem } from "@/types/card";
import type { AuthenticatedUser } from "@/types/user";

const copy = {
  emptyMessage: "Cards will appear here after catalog data is added.",
  emptyTitle: "No cards in the catalog yet",
  placeholder: "Search by card name or code...",
} as const;

export const EMPTY_FILTERS: CardFilters = {
  baseOnly: false,
  colorCodes: [],
  levels: [],
  ranges: [],
  rarityCode: null,
  setCodes: [],
  traitNames: [],
};

const RARITY_OPTIONS = [
  "C",
  "R",
  "SR",
  "GR",
  "UR",
  "MR",
  "SEC",
  "PR",
  "ER",
  "TR",
] as const;
const RANGE_OPTIONS = ["0", "1", "2", "3", "4", "5"] as const;
const LEVEL_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const COLOR_OPTIONS = [
  { className: "bg-app-card-blue", label: "Blue", value: "blue" },
  { className: "bg-app-card-red", label: "Red", value: "red" },
  { className: "bg-app-card-yellow", label: "Yellow", value: "yellow" },
  { className: "bg-app-card-green", label: "Green", value: "green" },
] as const;

export function getFilterOptions(cards: CardListItem[]) {
  const setCodes = new Set<string>();
  const traitNames = new Set<string>();

  for (const card of cards) {
    if (card.setCode) setCodes.add(card.setCode);
    for (const traitName of card.traitNames ?? []) traitNames.add(traitName);
  }

  return {
    sets: [...setCodes].sort(),
    traits: [...traitNames].sort(),
  };
}

function getActiveFilterLabels(filters: CardFilters) {
  const colorLabels = filters.colorCodes
    .map(
      (value) =>
        COLOR_OPTIONS.find((option) => option.value === value)?.label ?? value,
    )
    .join(", ");

  return [
    filters.baseOnly ? "Base variant only" : null,
    filters.setCodes.length ? `Set: ${filters.setCodes.join(", ")}` : null,
    filters.rarityCode ? `Rarity: ${filters.rarityCode}` : null,
    filters.ranges.length ? `Range: ${filters.ranges.join(", ")}` : null,
    filters.levels.length ? `Level: ${filters.levels.join(", ")}` : null,
    colorLabels ? `Color: ${colorLabels}` : null,
    filters.traitNames.length
      ? `Trait: ${filters.traitNames.join(", ")}`
      : null,
  ].filter((label): label is string => label !== null);
}

export function filterCards(
  cards: CardListItem[],
  query: string,
  filters?: CardFilters,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return cards.filter(
    (card) =>
      (!normalizedQuery ||
        card.name.toLocaleLowerCase().includes(normalizedQuery) ||
        card.cardCode.toLocaleLowerCase().includes(normalizedQuery)) &&
      (!filters?.baseOnly || card.isBase) &&
      (!filters?.setCodes.length ||
        (card.setCode && filters.setCodes.includes(card.setCode))) &&
      (!filters?.rarityCode || card.rarityCode === filters.rarityCode) &&
      (!filters?.ranges.length ||
        (card.range && filters.ranges.includes(card.range))) &&
      (!filters?.levels.length ||
        (card.level !== undefined && filters.levels.includes(card.level))) &&
      (!filters?.colorCodes.length ||
        (card.colorCode && filters.colorCodes.includes(card.colorCode))) &&
      (!filters?.traitNames.length ||
        filters.traitNames.every((selectedTrait) =>
          card.traitNames?.some(
            (trait) =>
              trait.toLocaleLowerCase() === selectedTrait.toLocaleLowerCase(),
          ),
        )),
  );
}

export function CatalogState({
  error,
  hasFilters,
  hasQuery,
  onClear,
}: {
  error?: boolean;
  hasFilters?: boolean;
  hasQuery?: boolean;
  onClear?: () => void;
}) {
  const hasRefinement = hasQuery || hasFilters;

  return (
    <div className="mx-auto mt-16 w-full max-w-[420px] border-t border-app-border-strong px-4 pt-7 text-center">
      <h2 className="text-sm font-medium text-app-text-card">
        {error
          ? "Card catalog could not be loaded"
          : hasRefinement
            ? "No cards match these filters"
            : copy.emptyTitle}
      </h2>
      <p className="mt-2 text-[11px] leading-5 text-app-text-muted">
        {error
          ? "Check the database connection, then reload this page."
          : hasRefinement
            ? "Adjust your search or reset the selected filters."
            : copy.emptyMessage}
      </p>
      {hasRefinement ? (
        <Button
          className="mt-5 min-h-11 px-4 font-mono text-[9px] uppercase tracking-[0.08em] text-app-accent hover:text-app-accent-hover"
          onClick={onClear}
          type="button"
          variant="link"
        >
          Clear search and filters
        </Button>
      ) : null}
    </div>
  );
}

function LanguageSwitch() {
  return (
    <div className="flex flex-col items-end gap-2">
      <div
        aria-label="Language"
        className="flex h-10 w-[130px] items-center rounded-[9px] border border-app-border bg-app-surface p-1"
        role="group"
      >
        <span className="flex h-8 flex-1 items-center justify-center rounded-[5px] bg-app-accent px-2 font-mono text-[9px] uppercase tracking-[0.08em] text-app-canvas">
          ENG
        </span>
        <span className="flex h-8 flex-1 items-center justify-center rounded-[5px] px-2 font-mono text-[9px] uppercase tracking-[0.08em] text-app-text-muted">
          IDN
        </span>
      </div>
      <span className="font-mono text-[8px] tracking-[0.04em] text-app-text-dim">
        IDN&nbsp;&nbsp;·&nbsp;&nbsp;Coming soon
      </span>
    </div>
  );
}

function FilterOption({
  children,
  className,
  onClick,
  selected,
}: {
  children: ReactNode;
  className?: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "min-h-11 min-w-0 rounded-[6px] border px-2 font-mono text-[9px] uppercase tracking-[0.02em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-app-accent sm:min-h-8",
        className,
        selected
          ? "border-app-accent bg-app-accent/5 text-app-accent"
          : "border-transparent bg-app-surface-input text-app-text-muted hover:border-app-border-control hover:text-app-text-hover",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function FilterSection({ children, label }: { children: ReactNode; label: string }) {
  return (
    <fieldset className="space-y-3">
      <legend className="font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-dim">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

export function FilterSheet({
  activeFilters,
  onApply,
  setOptions,
  traitOptions,
  showBaseFilter = true,
  resetFilters = EMPTY_FILTERS,
  iconOnly = false,
  triggerClassName,
}: {
  activeFilters: CardFilters;
  onApply: (filters: CardFilters) => void;
  setOptions: string[];
  traitOptions: string[];
  showBaseFilter?: boolean;
  resetFilters?: CardFilters;
  iconOnly?: boolean;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(activeFilters);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) setDraftFilters(activeFilters);
  }

  function applyFilterChange(nextFilters: CardFilters) {
    setDraftFilters(nextFilters);
    onApply(nextFilters);
  }

  function toggleStringFilter(key: "rarityCode", value: string) {
    applyFilterChange({
      ...draftFilters,
      [key]: draftFilters[key] === value ? null : value,
    });
  }

  function toggleMultiStringFilter(
    key: "colorCodes" | "ranges" | "setCodes" | "traitNames",
    value: string,
  ) {
    const values = draftFilters[key];
    const nextValues = values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];

    applyFilterChange({ ...draftFilters, [key]: nextValues });
  }

  function toggleLevelFilter(level: number) {
    applyFilterChange({
      ...draftFilters,
      levels: draftFilters.levels.includes(level)
        ? draftFilters.levels.filter((value) => value !== level)
        : [...draftFilters.levels, level],
    });
  }

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetTrigger
        render={
          <Button
            className={cn(
              "min-h-[53px] rounded-[9px] border-app-border bg-app-surface-input px-3 font-mono text-[10px] font-medium tracking-[0.06em] text-app-text-logo transition-colors hover:border-app-accent hover:bg-app-surface-input hover:text-app-accent-hover lg:w-fit lg:justify-self-end",
              iconOnly && "px-0",
              triggerClassName,
            )}
            aria-label={iconOnly ? "Filter cards" : undefined}
            type="button"
            variant="outline"
          />
        }
      >
        {iconOnly ? <AppIcon name="list-sort-descending" size={16} /> : "Filter"}
      </SheetTrigger>
      <SheetContent
        className="w-full max-w-none gap-0 border-app-border bg-app-surface p-0 text-app-text sm:w-[360px] sm:max-w-[360px]"
        side="right"
      >
        <SheetHeader className="border-b border-app-border-soft px-6 py-5 pr-16">
          <SheetTitle className="font-mono text-[18px] font-normal tracking-[-0.02em] text-app-text-logo">
            Filter
          </SheetTitle>
          <SheetDescription className="sr-only">
            Choose card catalog filters to update the results.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
          <div className="space-y-8">
            {showBaseFilter ? (
              <FilterSection label="Variant">
                <FilterOption
                  onClick={() =>
                    applyFilterChange({
                      ...draftFilters,
                      baseOnly: !draftFilters.baseOnly,
                    })
                  }
                  selected={draftFilters.baseOnly}
                >
                  Base variant only
                </FilterOption>
              </FilterSection>
            ) : null}

            <FilterSection label="Set">
              <div className="flex flex-wrap gap-2">
                {setOptions.map((option) => (
                  <FilterOption
                    className="shrink-0 whitespace-nowrap"
                    key={option}
                    onClick={() => toggleMultiStringFilter("setCodes", option)}
                    selected={draftFilters.setCodes.includes(option)}
                  >
                    {option}
                  </FilterOption>
                ))}
              </div>
            </FilterSection>

            <FilterSection label="Rarity">
              <div className="grid grid-cols-5 gap-2">
                {RARITY_OPTIONS.map((option) => (
                  <FilterOption
                    key={option}
                    onClick={() => toggleStringFilter("rarityCode", option)}
                    selected={draftFilters.rarityCode === option}
                  >
                    {option}
                  </FilterOption>
                ))}
              </div>
            </FilterSection>

            <FilterSection label="Range">
              <div className="grid grid-cols-5 gap-2">
                {RANGE_OPTIONS.map((option) => (
                  <FilterOption
                    key={option}
                    onClick={() => toggleMultiStringFilter("ranges", option)}
                    selected={draftFilters.ranges.includes(option)}
                  >
                    {option}
                  </FilterOption>
                ))}
              </div>
            </FilterSection>

            <FilterSection label="Level">
              <div className="grid grid-cols-6 gap-2">
                {LEVEL_OPTIONS.map((option) => (
                  <FilterOption
                    key={option}
                    onClick={() => toggleLevelFilter(option)}
                    selected={draftFilters.levels.includes(option)}
                  >
                    {option}
                  </FilterOption>
                ))}
              </div>
            </FilterSection>

            <FilterSection label="Color">
              <div className="grid grid-cols-4 gap-2">
                {COLOR_OPTIONS.map((option) => {
                  const selected = draftFilters.colorCodes.includes(option.value);

                  return (
                    <button
                      aria-label={option.label}
                      aria-pressed={selected}
                      className={cn(
                        "flex min-h-11 items-center justify-center rounded-[6px] border border-transparent bg-app-surface-input outline-none transition-colors focus-visible:ring-2 focus-visible:ring-app-accent sm:min-h-8",
                        selected
                          ? "border-app-accent bg-app-accent/5"
                          : "hover:border-app-border-control",
                      )}
                      key={option.value}
                      onClick={() =>
                        toggleMultiStringFilter("colorCodes", option.value)
                      }
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={cn("size-4 rounded-full", option.className)}
                      />
                    </button>
                  );
                })}
              </div>
            </FilterSection>

            <FilterSection label="Trait">
              <div className="grid grid-cols-2 gap-2">
                {traitOptions.map((option) => (
                  <FilterOption
                    key={option}
                    onClick={() =>
                      toggleMultiStringFilter("traitNames", option)
                    }
                    selected={draftFilters.traitNames.includes(option)}
                  >
                    {option}
                  </FilterOption>
                ))}
              </div>
            </FilterSection>
          </div>
        </div>

        <SheetFooter className="grid grid-cols-2 gap-4 p-6 pt-0">
          <Button
            className="min-h-12 rounded-[7px] border-app-border-control bg-app-surface-input font-mono text-[9px] font-normal uppercase tracking-[0.05em] text-app-text-panel hover:border-app-text-dim hover:bg-app-surface-input hover:text-app-text-logo"
            onClick={() => applyFilterChange({ ...resetFilters })}
            type="button"
            variant="outline"
          >
            Reset
          </Button>
          <Button
            className="min-h-12 rounded-[7px] bg-app-accent font-mono text-[9px] font-normal uppercase tracking-[0.05em] text-app-canvas hover:bg-app-accent-hover"
            onClick={() => setOpen(false)}
            type="button"
          >
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FilterSummary({
  filters,
  onClear,
}: {
  filters: CardFilters;
  onClear: () => void;
}) {
  const labels = getActiveFilterLabels(filters);

  if (labels.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-dim">
          Active filters
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {labels.map((label) => (
            <span
              className="rounded-[6px] border border-app-accent bg-app-accent/5 px-3 py-2 font-mono text-[9px] text-app-accent"
              key={label}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
      <button
        className="min-h-11 px-2 font-mono text-[9px] uppercase tracking-[0.05em] text-app-accent outline-none transition-colors hover:text-app-accent-hover focus-visible:ring-2 focus-visible:ring-app-accent"
        onClick={onClear}
        type="button"
      >
        Clear all
      </button>
    </div>
  );
}

export function CardLibrary({
  cards,
  loadError = false,
  user = null,
}: {
  cards: CardListItem[];
  loadError?: boolean;
  user?: AuthenticatedUser | null;
}) {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<CardFilters>({
    ...EMPTY_FILTERS,
  });
  const [selectedCard, setSelectedCard] = useState<CardListItem | null>(null);
  const deferredQuery = useDeferredValue(query);
  const { sets: setOptions, traits: traitOptions } = getFilterOptions(cards);
  const visibleCards = filterCards(cards, deferredQuery, activeFilters);
  const hasActiveFilters = getActiveFilterLabels(activeFilters).length > 0;
  const foundLabel = loadError
    ? "Card count unavailable"
    : `${visibleCards.length} ${visibleCards.length === 1 ? "card" : "cards"} found`;

  function clearFilters() {
    setActiveFilters({ ...EMPTY_FILTERS });
  }

  return (
    <>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">
            Card Library
          </p>
          <h1 className="mt-5 text-[30px] font-normal leading-none tracking-[-0.02em] text-app-text-strong">
            Card Library
          </h1>
        </div>

        <div className="flex flex-wrap items-start justify-end gap-4 sm:flex-nowrap sm:gap-[30px]">
          <LanguageSwitch />
          <AccountControls user={user} />
        </div>
      </header>

      <div className="mt-[31px] grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-4">
        <label className="relative block">
          <span className="sr-only">{copy.placeholder}</span>
          <span className="pointer-events-none absolute left-[25px] top-1/2 -translate-y-1/2 text-app-text-muted">
            <AppIcon name="search" size={12} />
          </span>
          <Input
            className="h-[53px] w-full rounded-[9px] border-app-border bg-app-surface-input pl-[52px] pr-4 text-[13px] text-app-text placeholder:text-app-text-muted focus-visible:border-app-text-dim focus-visible:ring-1 focus-visible:ring-app-accent"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.placeholder}
            type="search"
            value={query}
          />
        </label>
        <FilterSheet
          activeFilters={activeFilters}
          iconOnly
          onApply={setActiveFilters}
          setOptions={setOptions}
          traitOptions={traitOptions}
          triggerClassName="h-[53px] w-[53px] p-0 lg:w-[53px]"
        />
      </div>

      <div className="mt-[23px] border-b border-app-border-soft pb-[18px]">
        <FilterSummary filters={activeFilters} onClear={clearFilters} />
        <p aria-live="polite" className="text-[13px] text-app-text-muted">
          {foundLabel}
        </p>
      </div>

      {loadError ? (
        <CatalogState error />
      ) : visibleCards.length === 0 ? (
        <CatalogState
          hasFilters={hasActiveFilters}
          hasQuery={query.trim().length > 0}
          onClear={() => {
            setQuery("");
            clearFilters();
          }}
        />
      ) : (
        <section
          aria-label="Card results"
          className="mt-[30px] grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8"
        >
          {visibleCards.map((card) => (
            <CardGridItem
              card={card}
              key={card.id}
              onClick={() => setSelectedCard(card)}
            />
          ))}
        </section>
      )}

      <CardDetailModal
        card={selectedCard}
        key={selectedCard?.id ?? "card-detail-closed"}
        onOpenChange={(open) => {
          if (!open) setSelectedCard(null);
        }}
        open={selectedCard !== null}
        variants={
          selectedCard ? getCardVariants(cards, selectedCard.cardCode) : []
        }
      />

    </>
  );
}
