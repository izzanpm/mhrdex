import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardListItem } from "@/types/card";
import type {
  BattleSlot,
  CardInstance,
  GameAction,
  GameState,
} from "@/lib/simulator/types";

const BATTLE_SLOTS: readonly BattleSlot[] = ["front", "wingLeft", "wingRight", "back"];

function getCard(game: GameState, cards: readonly CardListItem[], instanceId: string) {
  const instance = game.instances[instanceId];
  if (instance === undefined) return null;
  const card = cards.find((candidate) => candidate.cardCode === instance.cardCode) ?? null;
  const metadata = game.cardMetadata?.[instance.cardCode];
  const hiddenFromViewer = instance.faceDown && instance.controllerId === "bot";
  return {
    card,
    instance,
    name: hiddenFromViewer ? "Face-down card" : metadata?.name ?? card?.name ?? instance.cardCode,
  };
}

function slotLabel(slot: BattleSlot) {
  switch (slot) {
    case "front":
      return "Front";
    case "wingLeft":
      return "Wing left";
    case "wingRight":
      return "Wing right";
    case "back":
      return "Back";
  }
}

function CardOnBoard({
  card,
  instance,
  name,
}: {
  card: CardListItem | null;
  instance: CardInstance;
  name: string;
}) {
  const hiddenFromViewer = instance.faceDown && instance.controllerId === "bot";
  const localImage =
    card?.imageUrl?.startsWith("/") && !card.imageUrl.startsWith("//")
      ? card.imageUrl
      : null;

  return (
    <div aria-label={hiddenFromViewer ? "Face-down card" : name} className="relative aspect-[744/1040] min-w-0 overflow-hidden rounded-[6px] border border-app-border-image bg-app-image-surface">
      {instance.faceDown ? (
        <div className="absolute inset-0 bg-app-surface-input" aria-hidden="true">
          <span className="absolute inset-x-2 top-1/2 border-t border-app-border-control" />
          <span className="absolute inset-y-2 left-1/2 border-l border-app-border-control" />
        </div>
      ) : localImage ? (
        <Image alt={name} className="object-cover" fill sizes="(min-width: 1280px) 12vw, 25vw" src={localImage} />
      ) : (
        <div aria-hidden="true" className="absolute inset-0">
          <span className="absolute bottom-0 left-0 w-[72%] origin-bottom-left -rotate-[36deg] border-t border-app-image-line" />
          <span className="absolute bottom-0 right-0 w-[72%] origin-bottom-right rotate-[36deg] border-t border-app-image-line" />
        </div>
      )}
      <span className="absolute inset-x-1 bottom-1 truncate bg-app-shadow/70 px-1 py-0.5 font-mono text-[7px] text-app-text-panel">
        {hiddenFromViewer ? "Face-down card" : instance.cardCode}
      </span>
    </div>
  );
}

function BoardZone({
  cards,
  game,
  instanceIds,
  label,
}: {
  cards: readonly CardListItem[];
  game: GameState;
  instanceIds: readonly string[];
  label: string;
}) {
  return (
    <div className="min-w-0 rounded-[7px] border border-app-border-soft bg-app-surface-input p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-dim">{label}</span>
        <span className="font-mono text-[8px] text-app-text-muted">{instanceIds.length}</span>
      </div>
      {instanceIds.length > 0 ? (
        <div className="grid grid-cols-3 gap-1">
          {instanceIds.map((instanceId) => {
            const resolved = getCard(game, cards, instanceId);
            return resolved ? <CardOnBoard {...resolved} key={instanceId} /> : null;
          })}
        </div>
      ) : (
        <div className="flex min-h-16 items-center justify-center rounded-[5px] border border-dashed border-app-border-dashed font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-dim">Empty</div>
      )}
    </div>
  );
}

function instanceLabel(game: GameState, cards: readonly CardListItem[], instanceId: string) {
  const resolved = getCard(game, cards, instanceId);
  return resolved?.name ?? instanceId;
}

function actionLabel(game: GameState, cards: readonly CardListItem[], action: GameAction) {
  switch (action.type) {
    case "base-deploy":
      return `Deploy ${instanceLabel(game, cards, action.instanceId)}`;
    case "call":
      return `Call ${instanceLabel(game, cards, action.instanceId)}`;
    case "battle-base-move":
      return `Move ${instanceLabel(game, cards, action.instanceId)} to ${action.destination}`;
    case "end-action-phase":
      return "End action phase";
    case "rearrange-battle":
      return "Confirm battle arrangement";
    case "declare-attack":
      return `Attack with ${instanceLabel(game, cards, action.attackerId)}`;
    case "select-attack-target":
      return action.targetId.startsWith("weakness:")
        ? `Attack ${action.targetId.replace("weakness:", "Weakness ")}`
        : `Target ${instanceLabel(game, cards, action.targetId)}`;
    case "battle-confirmation":
      return "Confirm battle result";
    case "counter-pass":
      return "Pass counter step";
    case "counter-call":
      return `Counter CALL ${instanceLabel(game, cards, action.instanceId)}`;
    case "counter-effect":
      return "Use counter effect";
    case "activate-effect":
      return "Use effect";
    case "submit-mulligan":
      return "Submit mulligan";
    case "choose-effect":
      return "Submit choice";
  }
}

export function SimulatorBoard({
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
  const publicActions = legalActions.filter(
    (action) => action.type !== "submit-mulligan" && action.type !== "choose-effect",
  );

  return (
    <section aria-label="Game board" className="min-w-0 rounded-[10px] border border-app-border-soft bg-app-surface p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-app-text-dim">Board</p>
          <h2 className="mt-2 text-[16px] text-app-text-strong">Field state</h2>
        </div>
        <Badge className="rounded-[4px] font-mono text-[8px] uppercase tracking-[0.08em]" variant="outline">{game.priorityPlayer === "player" ? "Your priority" : "Bot priority"}</Badge>
      </div>

      <div className="mt-4 grid min-w-0 gap-3" aria-label="Opponent field">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-dim">Opponent field</span>
          <span className="font-mono text-[8px] text-app-text-muted">Hand hidden</span>
        </div>
        <div className="grid min-w-0 grid-cols-4 gap-1.5">
          {BATTLE_SLOTS.map((slot) => {
            const instanceId = game.players.bot.battle[slot];
            const resolved = instanceId === null ? null : getCard(game, cards, instanceId);
            return (
              <div className="min-w-0" key={`bot-${slot}`}>
                <p className="mb-1 truncate font-mono text-[7px] uppercase tracking-[0.06em] text-app-text-dim">{slotLabel(slot)}</p>
                {resolved ? <CardOnBoard {...resolved} /> : <div className="flex aspect-[744/1040] items-center justify-center rounded-[6px] border border-dashed border-app-border-dashed font-mono text-[7px] text-app-text-dim">Open</div>}
              </div>
            );
          })}
        </div>
        <BoardZone cards={cards} game={game} instanceIds={game.players.bot.base} label="Base" />
      </div>

      <div className="my-4 h-px w-full bg-app-border-divider" />

      <div className="grid min-w-0 gap-3" aria-label="Your field">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-dim">Your field</span>
          <span className="font-mono text-[8px] text-app-text-muted">{game.players.player.timeline.length} Timeline</span>
        </div>
        <div className="grid min-w-0 grid-cols-4 gap-1.5">
          {BATTLE_SLOTS.map((slot) => {
            const instanceId = game.players.player.battle[slot];
            const resolved = instanceId === null ? null : getCard(game, cards, instanceId);
            return (
              <div className="min-w-0" key={`player-${slot}`}>
                <p className="mb-1 truncate font-mono text-[7px] uppercase tracking-[0.06em] text-app-text-dim">{slotLabel(slot)}</p>
                {resolved ? <CardOnBoard {...resolved} /> : <div className="flex aspect-[744/1040] items-center justify-center rounded-[6px] border border-dashed border-app-border-dashed font-mono text-[7px] text-app-text-dim">Open</div>}
              </div>
            );
          })}
        </div>
        <BoardZone cards={cards} game={game} instanceIds={game.players.player.base} label="Base" />
      </div>

      {publicActions.length > 0 ? (
        <div className="mt-5 border-t border-app-border-divider pt-4" aria-label="Available legal actions">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-dim">Available actions</p>
            <p className="font-mono text-[8px] text-app-text-muted">{publicActions.length} legal</p>
          </div>
          <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
            {publicActions.map((action, index) => (
              <Button
                className={cn("min-h-11 min-w-0 justify-start border-app-border-control bg-app-surface-input px-3 text-left text-[10px] font-normal text-app-text-panel whitespace-normal hover:border-app-accent hover:bg-app-surface-hover", index === 0 && "border-app-accent/70")}
                data-action-type={action.type}
                key={`${action.type}-${JSON.stringify(action)}`}
                onClick={() => onAction(action)}
                type="button"
                variant="outline"
              >
                {actionLabel(game, cards, action)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
