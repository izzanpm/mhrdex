"use client";

import { useState, useTransition } from "react";

import { AccountControls } from "@/components/account-controls";
import { AppIcon } from "@/components/app-icon";
import { CardDetailModal, getCardVariants } from "@/components/card-detail-modal";
import { DeckBuilderCardSearch } from "@/components/deck-builder-card-search";
import { CardGridItem } from "@/components/card-grid-item";
import { DeckTraitBadges } from "@/components/deck-trait-badges";
import { Sidebar } from "@/components/sidebar";
import { saveDeck } from "@/lib/deck-actions";
import { getDeckColorClass } from "@/lib/deck-colors";
import { getDeckTraitNames } from "@/lib/deck-list";
import {
  getCardAddBlockReason,
  getDraftColorCodes,
  type DeckCardDraft,
} from "@/lib/deck-validation";
import type { CardListItem } from "@/types/card";
import type { AuthenticatedUser } from "@/types/user";
import type { DeckCatalogCard, DeckDetail } from "@/types/deck";

const BLOCK_REASON_MESSAGES = {
  max_cards: "A deck can contain at most 50 cards.",
  max_colors: "A deck can contain cards from at most 2 colors.",
  max_copies: "A deck can contain at most 3 copies of the same card.",
  unknown_card: "That card is no longer available.",
} as const;

function getInitialEntries(deck: DeckDetail): DeckCardDraft[] {
  return deck.cards.map(({ cardId, quantity }) => ({ cardId, quantity }));
}

function getCatalog(cards: CardListItem[]): DeckCatalogCard[] {
  return cards.flatMap(({ cardId, cardCode, colorCode }) =>
    colorCode ? [{ cardId, cardCode, colorCode }] : [],
  );
}

export function DeckBuilderScreen({
  cards,
  deck,
  loadError = false,
  user,
}: {
  cards: CardListItem[];
  deck: DeckDetail;
  loadError?: boolean;
  user: AuthenticatedUser;
}) {
  const [name, setName] = useState(deck.name);
  const [draftEntries, setDraftEntries] = useState(() => getInitialEntries(deck));
  const [selectedCard, setSelectedCard] = useState<CardListItem | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const catalog = getCatalog(cards);
  const allColorCodes = [
    ...new Set(
      cards.flatMap((card) => (card.colorCode ? [card.colorCode] : [])),
    ),
  ];
  const activeColorCodes = getDraftColorCodes(draftEntries, catalog);
  const traitNames = getDeckTraitNames(cards, draftEntries);
  const totalCards = draftEntries.reduce((total, entry) => total + entry.quantity, 0);

  function handleQuantityChange(cardId: string, delta: -1 | 1) {
    setInteractionMessage(null);

    if (delta === 1) {
      const reason = getCardAddBlockReason(
        { cardId, quantity: 1 },
        draftEntries,
        catalog,
      );
      if (reason) {
        setInteractionMessage(BLOCK_REASON_MESSAGES[reason]);
        return;
      }
    }

    setDraftEntries((currentEntries) => {
      const currentQuantity =
        currentEntries.find((entry) => entry.cardId === cardId)?.quantity ?? 0;
      const nextQuantity = currentQuantity + delta;

      if (nextQuantity <= 0) {
        return currentEntries.filter((entry) => entry.cardId !== cardId);
      }

      const hasEntry = currentEntries.some((entry) => entry.cardId === cardId);
      if (!hasEntry) return [...currentEntries, { cardId, quantity: nextQuantity }];

      return currentEntries.map((entry) =>
        entry.cardId === cardId
          ? { ...entry, quantity: nextQuantity }
          : entry,
      );
    });
  }

  function handleSave() {
    setSaveError(null);
    startTransition(async () => {
      const result = await saveDeck(deck.id, {
        name,
        cards: draftEntries,
      });
      if (!result.ok) setSaveError(result.message);
    });
  }

  return (
    <div className="min-h-screen bg-app-canvas text-app-text">
      <Sidebar />

      <main className="min-w-0 md:ml-[232px]">
        <div className="min-h-screen w-full px-5 py-6 sm:px-7 md:px-[51px] md:pt-[46px]">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">
                Decks / Edit
              </p>
              <h1 className="mt-5 text-[30px] font-normal leading-none tracking-[-0.02em] text-app-text-strong">
                Edit deck
              </h1>
            </div>

            <AccountControls user={user} />
          </header>

          <div className="mt-8 grid gap-6 lg:grid-cols-[362px_minmax(0,1fr)] lg:gap-[38px]">
            <aside aria-label="Card search" className="min-w-0">
              <DeckBuilderCardSearch
                allColorCodes={allColorCodes}
                cards={cards}
                draftEntries={draftEntries}
                loadError={loadError}
                onQuantityChange={handleQuantityChange}
              />
            </aside>

            <section className="min-w-0 rounded-[10px] bg-app-surface-card px-5 pb-10 pt-6 sm:px-8 lg:min-h-[793px] lg:px-10 lg:pt-[22px]">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor="deck-name">
                    Deck name
                  </label>
                  <input
                    className="flex h-11 w-full max-w-[391px] rounded-[9px] border border-app-border bg-transparent px-4 text-[14px] text-app-text-panel outline-none placeholder:text-app-text-muted focus:border-app-accent focus:ring-1 focus:ring-app-accent"
                    id="deck-name"
                    onChange={(event) => setName(event.target.value)}
                    value={name}
                  />
                  <div className="mt-3 flex items-center gap-3">
                    <span className="flex gap-1.5">
                      {activeColorCodes.length > 0 ? (
                        activeColorCodes.map((colorCode) => (
                          <span
                            aria-label={colorCode}
                            className={`size-3 rounded-full ${getDeckColorClass(colorCode)}`}
                            key={colorCode}
                            title={colorCode}
                          />
                        ))
                      ) : (
                        <span className="font-mono text-[8px] text-app-text-dim">
                          Choose cards to set colors
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-app-amber">
                      {totalCards} / 50 cards
                    </span>
                  </div>
                  <DeckTraitBadges traitNames={traitNames} />
                </div>

                <button
                  aria-label={isPending ? "Saving changes" : "Save changes"}
                  className="flex size-11 shrink-0 items-center justify-center rounded-[8px] bg-app-accent text-app-canvas outline-none transition-colors hover:bg-app-accent-hover focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface-card disabled:cursor-wait disabled:opacity-60"
                  disabled={isPending}
                  onClick={handleSave}
                  title={isPending ? "Saving changes" : "Save changes"}
                  type="button"
                >
                  <AppIcon name="save" size={16} />
                </button>
              </div>

              {interactionMessage || saveError ? (
                <p
                  aria-live="polite"
                  className="mt-4 rounded-[7px] border border-app-danger-border bg-app-danger-surface px-3 py-2 text-[11px] leading-4 text-app-danger-text"
                >
                  {saveError ?? interactionMessage}
                </p>
              ) : null}

              {draftEntries.length === 0 ? (
                <div className="mt-7 flex min-h-[261px] flex-col items-center justify-center rounded-[10px] border border-app-border px-10 py-10 text-center lg:-mx-[15px] lg:mr-[30px]">
                  <h2 className="text-[24px] font-normal leading-[1.2] tracking-[-0.02em] text-app-text-strong">
                    Your deck is empty
                  </h2>
                  <p className="mt-4 text-[14px] leading-5 text-app-text-muted">
                    Add your first card to start building.
                  </p>
                </div>
              ) : (
                <div className="mt-7 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
                  {draftEntries.map((entry) => {
                    const card =
                      cards.find(
                        (candidate) =>
                          candidate.cardId === entry.cardId && candidate.isBase,
                      ) ?? cards.find((candidate) => candidate.cardId === entry.cardId);
                    if (!card) return null;
                    const canAddCard =
                      getCardAddBlockReason(
                        { cardId: card.cardId, quantity: 1 },
                        draftEntries,
                        catalog,
                      ) === null;
                    return (
                      <article
                        className="min-w-0"
                        data-card-code={card.cardCode}
                        key={entry.cardId}
                      >
                        <div className="relative">
                          <CardGridItem
                            card={card}
                            onClick={() => setSelectedCard(card)}
                          />
                          <button
                            aria-label={`Remove one ${card.name}`}
                            className="absolute bottom-2 left-2 z-10 flex size-11 items-center justify-center rounded-full border border-app-border-control bg-app-surface-card/95 text-app-text-panel outline-none transition-colors hover:border-app-accent hover:text-app-accent focus-visible:ring-2 focus-visible:ring-app-accent"
                            onClick={() => handleQuantityChange(card.cardId, -1)}
                            type="button"
                          >
                            <AppIcon name="minus" size={12} />
                          </button>
                          {canAddCard ? (
                            <button
                              aria-label={`Add one ${card.name}`}
                              className="absolute bottom-2 right-2 z-10 flex size-11 items-center justify-center rounded-full border border-app-border-control bg-app-surface-card/95 text-app-text-panel outline-none transition-colors hover:border-app-accent hover:text-app-accent focus-visible:ring-2 focus-visible:ring-app-accent"
                              onClick={() => handleQuantityChange(card.cardId, 1)}
                              title={`Add one ${card.name}`}
                              type="button"
                            >
                              <AppIcon name="plus" size={12} />
                            </button>
                          ) : null}
                          <span className="pointer-events-none absolute right-2 top-2 z-10 flex min-h-7 min-w-7 items-center justify-center rounded-full bg-app-surface-card/90 px-1.5 font-mono text-[10px] text-app-text-panel">
                            x{entry.quantity}
                          </span>
                        </div>
                        <p className="mt-3 font-mono text-[9px] text-app-text-dim">{card.cardCode}</p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      <CardDetailModal
        card={selectedCard}
        key={selectedCard?.id ?? "deck-builder-card-detail-closed"}
        onOpenChange={(open) => {
          if (!open) setSelectedCard(null);
        }}
        open={selectedCard !== null}
        variants={selectedCard ? getCardVariants(cards, selectedCard.cardCode) : []}
      />
    </div>
  );
}
