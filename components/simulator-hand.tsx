import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardListItem } from "@/types/card";
import type { GameAction, GameState } from "@/lib/simulator/types";

function cardForInstance(game: GameState, cards: readonly CardListItem[], instanceId: string) {
  const instance = game.instances[instanceId];
  if (instance === undefined) return null;
  return {
    instance,
    card: cards.find((candidate) => candidate.cardCode === instance.cardCode) ?? null,
  };
}

export function mulliganActionLabel(name: string, selected: boolean) {
  return selected
    ? `Keep ${name} and remove it from mulligan selection`
    : `Select ${name} for mulligan`;
}

export function SimulatorHand({
  cards,
  game,
  legalActions,
  onAction,
}: {
  cards: readonly CardListItem[];
  game: GameState;
  legalActions: readonly GameAction[];
  onAction: (action: GameAction) => void;
}) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const mulliganOpen = game.pendingChoice?.type === "mulligan" && game.pendingChoice.playerId === "player";
  const mulliganAction = mulliganOpen
    ? legalActions.find(
        (action) =>
          action.type === "submit-mulligan" &&
          action.instanceIds.length === selected.length &&
          action.instanceIds.every((instanceId) => selected.includes(instanceId)),
      )
    : undefined;

  function toggleSelected(instanceId: string) {
    setSelected((current) =>
      current.includes(instanceId)
        ? current.filter((candidate) => candidate !== instanceId)
        : [...current, instanceId],
    );
  }

  return (
    <section aria-label="Your hand" className="mt-4 min-w-0 rounded-[10px] border border-app-border-soft bg-app-surface p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-app-text-dim">Hand</p>
          <h2 className="mt-2 text-[16px] text-app-text-strong">Your cards</h2>
        </div>
        <span className="font-mono text-[9px] text-app-text-muted">{game.players.player.hand.length} cards</span>
      </div>

      {mulliganOpen ? (
        <p className="mt-3 rounded-[6px] border border-app-accent/50 bg-app-surface-active px-3 py-2 text-[11px] leading-5 text-app-text-panel">
          Select any cards to mulligan, then submit your opening hand decision.
        </p>
      ) : null}

      <div className="mt-4 grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-6">
        {game.players.player.hand.map((instanceId) => {
          const resolved = cardForInstance(game, cards, instanceId);
          if (resolved === null) return null;
          const localImage =
            resolved.card?.imageUrl?.startsWith("/") && !resolved.card.imageUrl.startsWith("//")
              ? resolved.card.imageUrl
              : null;
          const name = resolved.card?.name ?? resolved.instance.cardCode;
          const selectedCard = selected.includes(instanceId);
          return (
            <button
              aria-label={mulliganActionLabel(name, selectedCard)}
              aria-pressed={selectedCard}
              className={cn(
                "relative min-w-0 rounded-[6px] border p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-app-accent",
                selectedCard ? "border-app-accent" : "border-app-border-image",
              )}
              disabled={!mulliganOpen}
              key={instanceId}
              onClick={() => toggleSelected(instanceId)}
              type="button"
            >
              <span className="relative block aspect-[744/1040] overflow-hidden rounded-[4px] bg-app-image-surface">
                {localImage ? <Image alt={name} className="object-cover" fill sizes="(min-width: 640px) 12vw, 28vw" src={localImage} /> : <span aria-hidden="true" className="absolute inset-0" />}
              </span>
              <span className="mt-1 block truncate font-mono text-[7px] text-app-text-dim">{resolved.instance.cardCode}</span>
            </button>
          );
        })}
      </div>

      {mulliganOpen ? (
        <Button
          className="mt-4 min-h-11 w-full bg-app-accent font-mono text-[9px] uppercase tracking-[0.08em] text-app-canvas hover:bg-app-accent-hover"
          disabled={mulliganAction === undefined}
          onClick={() => {
            if (mulliganAction !== undefined) onAction(mulliganAction);
          }}
          type="button"
        >
          Submit opening hand
        </Button>
      ) : null}
    </section>
  );
}
