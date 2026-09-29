import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { CardListItem } from "@/types/card";
import type {
  GameAction,
  GameState,
  PendingChoice,
} from "@/lib/simulator/types";

function nameForInstance(game: GameState, cards: readonly CardListItem[], instanceId: string) {
  const instance = game.instances[instanceId];
  if (instance === undefined) return instanceId;
  if (instance.faceDown && instance.controllerId === "bot") return "Face-down card";
  return game.cardMetadata?.[instance.cardCode]?.name ?? cards.find((card) => card.cardCode === instance.cardCode)?.name ?? instance.cardCode;
}

function choiceTitle(type: "effect" | "target") {
  return type === "target" ? "Choose target" : "Choose option";
}

export function createPendingChoiceAction(
  choice: Extract<PendingChoice, { type: "effect" | "target" }>,
  value: readonly string[],
): GameAction {
  return {
    type: "choose-effect",
    playerId: choice.playerId,
    choiceId: choice.choiceId,
    value,
  };
}

export function SimulatorStatus({
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
  const [selectedChoice, setSelectedChoice] = useState<readonly string[]>([]);
  const pending = game.pendingChoice;
  const playerChoice = pending?.playerId === "player" && (pending.type === "effect" || pending.type === "target") ? pending : null;
  const choiceReady = playerChoice !== null && selectedChoice.length >= playerChoice.min && selectedChoice.length <= playerChoice.max;

  function toggleChoice(option: string) {
    setSelectedChoice((current) =>
      current.includes(option)
        ? current.filter((candidate) => candidate !== option)
        : [...current, option],
    );
  }

  function submitChoice() {
    if (playerChoice === null || !choiceReady) return;
    onAction(createPendingChoiceAction(playerChoice, selectedChoice));
    setSelectedChoice([]);
  }

  return (
    <section aria-label="Simulator status" className="min-w-0 rounded-[10px] border border-app-border-soft bg-app-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-app-text-dim">Status</p>
          <h2 className="mt-2 truncate text-[16px] text-app-text-strong">{game.winner ? `${game.winner === "player" ? "You" : "Bot"} win` : "Live game"}</h2>
        </div>
        <Badge className="rounded-[4px] font-mono text-[8px] uppercase tracking-[0.08em]" variant={game.winner ? "default" : "secondary"}>{game.winner ? "Game over" : game.phase}</Badge>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-[6px] bg-app-surface-input px-3 py-2"><dt className="font-mono text-[8px] uppercase text-app-text-dim">Turn</dt><dd className="mt-1 text-[13px] text-app-text-panel">{game.turnNumber}</dd></div>
        <div className="rounded-[6px] bg-app-surface-input px-3 py-2"><dt className="font-mono text-[8px] uppercase text-app-text-dim">Priority</dt><dd className="mt-1 truncate text-[13px] text-app-text-panel">{game.priorityPlayer === "player" ? "You" : "Bot"}</dd></div>
        <div className="rounded-[6px] bg-app-surface-input px-3 py-2"><dt className="font-mono text-[8px] uppercase text-app-text-dim">Your deck</dt><dd className="mt-1 text-[13px] text-app-text-panel">{game.players.player.deck.length}</dd></div>
        <div className="rounded-[6px] bg-app-surface-input px-3 py-2"><dt className="font-mono text-[8px] uppercase text-app-text-dim">Bot deck</dt><dd className="mt-1 text-[13px] text-app-text-panel">{game.players.bot.deck.length}</dd></div>
        <div className="rounded-[6px] bg-app-surface-input px-3 py-2"><dt className="font-mono text-[8px] uppercase text-app-text-dim">Your hand</dt><dd className="mt-1 text-[13px] text-app-text-panel">{game.players.player.hand.length}</dd></div>
        <div className="rounded-[6px] bg-app-surface-input px-3 py-2"><dt className="font-mono text-[8px] uppercase text-app-text-dim">Bot hand</dt><dd className="mt-1 text-[13px] text-app-text-panel">{game.players.bot.hand.length} hidden</dd></div>
      </dl>

      <Separator className="my-5 bg-app-border-divider" />

      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-dim">Timeline</p>
          <span className="font-mono text-[9px] text-app-card-yellow">{game.players.player.timeline.length} / 9</span>
        </div>
        <div className="mt-2 grid grid-cols-9 gap-1" aria-label="Your Timeline">
          {Array.from({ length: 9 }, (_, index) => (
            <span aria-hidden="true" className={`h-2 rounded-[2px] ${index < game.players.player.timeline.length ? "bg-app-card-yellow" : "bg-app-progress-track"}`} key={index} />
          ))}
        </div>
      </div>

      {playerChoice ? (
        <div className="mt-5 rounded-[7px] border border-app-accent bg-app-surface-active p-3" data-pending-choice={playerChoice.choiceId}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-app-accent-hover">Pending choice</p>
              <h3 className="mt-2 text-[13px] text-app-text-strong">{choiceTitle(playerChoice.type)}</h3>
            </div>
            <span className="font-mono text-[8px] text-app-text-dim">{playerChoice.choiceId}</span>
          </div>
          <div className="mt-3 grid min-w-0 gap-2">
            {playerChoice.options.map((option) => {
              const selected = selectedChoice.includes(option);
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "min-h-11 w-full min-w-0 max-w-full rounded-[5px] border px-3 text-left text-[10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-app-accent overflow-hidden break-words whitespace-normal",
                    selected
                      ? "border-app-accent bg-app-accent text-app-canvas"
                      : "border-app-border-control bg-app-surface-input text-app-text-panel hover:border-app-accent",
                  )}
                  data-choice-option={option}
                  key={option}
                  onClick={() => toggleChoice(option)}
                  type="button"
                >
                  <span className="min-w-0 max-w-full break-words whitespace-normal">
                    {nameForInstance(game, cards, option)}
                  </span>
                </button>
              );
            })}
          </div>
          <Button className="mt-3 min-h-11 w-full bg-app-accent font-mono text-[9px] uppercase tracking-[0.08em] text-app-canvas hover:bg-app-accent-hover" data-action-type="choose-effect" disabled={!choiceReady} onClick={submitChoice} type="button">
            Submit choice
          </Button>
        </div>
      ) : null}

      <p className="mt-5 font-mono text-[9px] uppercase tracking-[0.08em] text-app-text-muted" aria-live="polite">
        {legalActions.length > 0 ? `${legalActions.length} legal action${legalActions.length === 1 ? "" : "s"}` : "Waiting for the next window"}
      </p>
    </section>
  );
}
