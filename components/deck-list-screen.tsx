"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { AccountControls } from "@/components/account-controls";
import { AppIcon } from "@/components/app-icon";
import { CardDetailModal, getCardVariants } from "@/components/card-detail-modal";
import { DeckTraitBadges } from "@/components/deck-trait-badges";
import {
  ColorDots,
  CreateDeckForm,
  DeckListPanel,
} from "@/components/deck-list-panel";
import { DeleteDeckButton } from "@/components/delete-deck-button";
import { Sidebar } from "@/components/sidebar";
import { getDeckTraitNames } from "@/lib/deck-list";
import type { CardListItem } from "@/types/card";
import type { DeckDetail, DeckSummary } from "@/types/deck";
import type { AuthenticatedUser } from "@/types/user";

function DeckCardTile({
  card,
  detailCard,
  onOpenDetails,
}: {
  card: DeckDetail["cards"][number];
  detailCard: CardListItem | null;
  onOpenDetails: (card: CardListItem) => void;
}) {
  const localImage =
    card.imageUrl?.startsWith("/") && !card.imageUrl.startsWith("//")
      ? card.imageUrl
      : null;

  return (
    <article className="min-w-0" data-card-code={card.cardCode}>
      <div className="relative aspect-[744/1040] overflow-hidden rounded-[8px] border border-app-border-image bg-app-image-surface">
        {localImage ? (
          <Image
            alt={card.name}
            className="object-cover"
            fill
            sizes="(min-width: 1024px) 14vw, 45vw"
            src={localImage}
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0">
            <span className="absolute bottom-0 left-0 w-[72%] origin-bottom-left -rotate-[36deg] border-t border-app-image-line" />
            <span className="absolute bottom-0 right-0 w-[72%] origin-bottom-right rotate-[36deg] border-t border-app-image-line" />
          </div>
        )}
        {detailCard ? (
          <button
            aria-label={`Open details for ${detailCard.name}, ${detailCard.cardCode}, ${detailCard.rarityCode}`}
            className="absolute inset-0 z-[1] rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-inset"
            onClick={() => onOpenDetails(detailCard)}
            type="button"
          />
        ) : null}
        <span className="pointer-events-none absolute right-2 top-2 z-[2] flex min-h-7 min-w-7 items-center justify-center rounded-full bg-app-surface-card/90 px-1.5 font-mono text-[10px] text-app-text-panel">
          x{card.quantity}
        </span>
      </div>
      <p className="mt-1 font-mono text-[9px] text-app-text-dim">{card.cardCode}</p>
    </article>
  );
}

function EmptyDecksState() {
  return (
    <section
      aria-label="Decks empty state"
      className="flex min-h-[calc(100dvh-90px)] items-center justify-center pb-[45px] pt-16 sm:pt-20 md:pt-0"
    >
      <div className="w-full max-w-[410px] rounded-[10px] bg-app-surface-card px-[39px] pb-[47px] pt-[59px]">
        <h2 className="text-[24px] font-normal leading-[1.2] tracking-[-0.02em] text-app-text-strong">
          No deck yet
        </h2>
        <p className="mt-6 text-[14px] leading-5 text-app-text-muted">
          Create your first deck to start building your collection.
        </p>
        <div className="mt-7">
          <CreateDeckForm />
        </div>
      </div>
    </section>
  );
}

function DeckDetailPanel({
  cards,
  deck,
  onCardSelect,
}: {
  cards: CardListItem[];
  deck: DeckDetail;
  onCardSelect: (card: CardListItem) => void;
}) {
  const progress = Math.min(100, (deck.cardCount / 50) * 100);
  const traitNames = getDeckTraitNames(cards, deck.cards);

  return (
    <section
      aria-label={`${deck.name} details`}
      className="min-w-0 rounded-[10px] bg-app-surface-card p-5 sm:p-7 lg:p-9"
    >
      <div className="flex flex-col gap-5 border-b border-app-border-soft sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-[25px] font-normal leading-none tracking-[-0.02em] text-app-text-strong">
            {deck.name}
          </h2>
          <div className="mt-5 flex items-center gap-3">
            <ColorDots colorCodes={deck.colorCodes} />
            <span className="text-[12px] text-app-text-muted">
              {deck.cardCount} / 50 cards
            </span>
          </div>
          <DeckTraitBadges traitNames={traitNames} />
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <DeleteDeckButton deckId={deck.id} />
          <Link
            aria-label="Edit deck"
            className="inline-flex size-11 items-center justify-center rounded-[8px] border border-app-border-control p-0 text-app-text-panel outline-none transition-colors hover:border-app-accent hover:text-app-accent focus-visible:ring-2 focus-visible:ring-app-accent"
            href={`/decks/${deck.id}/edit`}
            title="Edit deck"
          >
            <AppIcon name="pencil" size={15} />
          </Link>
        </div>
      </div>

      <div aria-label={`${deck.cardCount} of 50 cards`} className="mt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-app-progress-track">
          <div
            className="h-full rounded-full bg-app-accent transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {deck.cards.length === 0 ? (
        <div className="mt-8 rounded-[8px] border border-dashed border-app-border-dashed px-5 py-10 text-center">
          <p className="text-[13px] text-app-text-muted">This deck has no cards yet.</p>
          <Link
            className="mt-4 inline-flex min-h-11 items-center text-[11px] text-app-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
            href={`/decks/${deck.id}/edit`}
          >
            Add cards
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {deck.cards.map((card) => (
            <DeckCardTile
              card={card}
              detailCard={
                cards.find((catalogCard) => catalogCard.cardCode === card.cardCode) ??
                null
              }
              key={card.cardId}
              onOpenDetails={onCardSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function DeckListScreen({
  cards = [],
  user,
  decks,
  selectedDeck,
}: {
  cards?: CardListItem[];
  user: AuthenticatedUser;
  decks: DeckSummary[];
  selectedDeck: DeckDetail | null;
}) {
  const [selectedCard, setSelectedCard] = useState<CardListItem | null>(null);
  const variants = selectedCard
    ? getCardVariants(cards, selectedCard.cardCode)
    : [];

  return (
    <div className="min-h-screen bg-app-canvas text-app-text">
      <Sidebar />

      <main className="min-w-0 md:ml-[232px]">
        <div className="min-h-screen w-full px-5 py-6 sm:px-7 md:px-[51px] md:pt-[46px]">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">
                Decks
              </p>
              <h1 className="mt-5 text-[30px] font-normal leading-none tracking-[-0.02em] text-app-text-strong">
                Deck List
              </h1>
            </div>

            <div className="flex items-start gap-5">
              <AccountControls user={user} />
            </div>
          </header>

          {decks.length === 0 ? (
            <EmptyDecksState />
          ) : (
            <section
              aria-label="Deck list and selected deck"
              className="mt-9 grid min-w-0 gap-4 lg:grid-cols-[minmax(230px,0.34fr)_minmax(0,1fr)]"
            >
              <DeckListPanel
                decks={decks}
                selectedDeckId={selectedDeck?.id ?? null}
              />

              {selectedDeck ? (
                <DeckDetailPanel
                  cards={cards}
                  deck={selectedDeck}
                  onCardSelect={setSelectedCard}
                />
              ) : (
                <div className="rounded-[10px] bg-app-surface-card p-8 text-app-text-muted">
                  Select a deck to see its cards.
                </div>
              )}
            </section>
          )}
        </div>
      </main>
      <CardDetailModal
        card={selectedCard}
        key={selectedCard?.id ?? "deck-card-detail-closed"}
        onOpenChange={(open) => {
          if (!open) setSelectedCard(null);
        }}
        open={selectedCard !== null}
        variants={variants}
      />
    </div>
  );
}
