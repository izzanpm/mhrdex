"use client";

import Link from "next/link";
import { useEffect, useReducer, useState } from "react";

import { SimulatorBoard } from "@/components/simulator-board";
import { SimulatorEventLog } from "@/components/simulator-event-log";
import { SimulatorHand } from "@/components/simulator-hand";
import { SimulatorStatus } from "@/components/simulator-status";
import { AccountControls } from "@/components/account-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/sidebar";
import { applyAction, getLegalActions, setupGame } from "@/lib/simulator/engine";
import { chooseBotAction } from "@/lib/simulator/bot";
import { cn } from "@/lib/utils";
import type { CardListItem } from "@/types/card";
import type { DeckDetail, DeckSummary } from "@/types/deck";
import type { AuthenticatedUser } from "@/types/user";
import type {
  BotView,
  GameAction,
  GameState,
  PlayerId,
  PendingChoice,
  SimulatorCardDefinition,
  SimulatorDeckEntry,
} from "@/lib/simulator/types";

export type SimulatorSetup =
  | { kind: "select-deck"; decks: readonly DeckSummary[] }
  | { kind: "error"; title: string; message: string }
  | {
      kind: "ready";
      deck: DeckDetail;
      playerEntries: readonly SimulatorDeckEntry[];
      botEntries: readonly SimulatorDeckEntry[];
      definitions: readonly SimulatorCardDefinition[];
      cards: readonly CardListItem[];
    };

export type SimulatorUiAction =
  | { type: "start"; seed: number; firstPlayer: PlayerId }
  | { type: "game"; action: GameAction }
  | { type: "bot-turn" };

export type SimulatorUiState = {
  setup: SimulatorSetup;
  game: GameState | null;
  error: string | null;
};

export function createSimulatorUiState(setup: SimulatorSetup): SimulatorUiState {
  return { setup, game: null, error: null };
}

export function getSimulatorGameStatus(game: GameState | null) {
  if (game === null) return null;
  if (game.winner === null) return "Game in progress";
  return `Winner: ${game.winner === "player" ? "Player" : "Bot"}`;
}

function pendingChoiceAction(
  choice: PendingChoice,
  playerId: PlayerId,
): GameAction | null {
  if (choice.playerId !== playerId) return null;
  if (choice.type !== "effect" && choice.type !== "target") return null;

  return {
    type: "choose-effect",
    playerId,
    choiceId: choice.choiceId,
    value: choice.options.slice(0, choice.min),
  };
}

export function getSimulatorLegalActions(
  game: GameState,
  playerId: PlayerId,
): readonly GameAction[] {
  const legalActions = getLegalActions(game, playerId);
  const pendingAction = game.pendingChoice
    ? pendingChoiceAction(game.pendingChoice, playerId)
    : null;
  return pendingAction === null ? legalActions : [pendingAction];
}

function publicPlayer(
  game: GameState,
  playerId: PlayerId,
): BotView["publicState"]["players"]["player"] {
  const player = game.players[playerId];
  return {
    deckCount: player.deck.length,
    handCount: player.hand.length,
    battle: { ...player.battle },
    base: [...player.base],
    timeline: [...player.timeline],
    retreat: [...player.retreat],
    void: [...player.void],
    rushPointDeckCount: player.rushPointDeck.length,
  };
}

export function buildBotView(game: GameState): BotView {
  return {
    rngState: game.rngState,
    ownHand: [...game.players.bot.hand],
    ownDeck: [...game.players.bot.deck],
    publicState: {
      phase: game.phase,
      actionWindow: game.actionWindow,
      activePlayer: game.activePlayer,
      priorityPlayer: game.priorityPlayer,
      players: {
        player: publicPlayer(game, "player"),
        bot: publicPlayer(game, "bot"),
      },
    },
    legalActions: getSimulatorLegalActions(game, "bot"),
  };
}

export function simulatorReducer(
  state: SimulatorUiState,
  action: SimulatorUiAction,
): SimulatorUiState {
  if (action.type === "start") {
    if (state.setup.kind !== "ready") return state;

    try {
      const game = setupGame({
        playerEntries: state.setup.playerEntries,
        botEntries: state.setup.botEntries,
        definitions: new Map(
          state.setup.definitions.map((definition) => [definition.cardId, definition]),
        ),
        seed: action.seed,
        firstPlayer: action.firstPlayer,
      });
      return { ...state, game, error: null };
    } catch (error) {
      return {
        ...state,
        error: error instanceof Error ? error.message : "The game could not start.",
      };
    }
  }

  if (state.game === null) return state;

  const nextAction =
    action.type === "bot-turn"
      ? chooseBotAction(buildBotView(state.game))
      : action.action;
  if (nextAction === null || nextAction === undefined) {
    return { ...state, error: "The bot has no legal action in this window." };
  }

  const result = applyAction(state.game, nextAction);
  if (!result.ok) return { ...state, error: result.error.message };
  return { ...state, game: result.state, error: null };
}

function DeckChoice({ deck }: { deck: DeckSummary }) {
  return (
    <Link
      className="flex min-h-11 min-w-0 items-center justify-between gap-4 rounded-[8px] border border-app-border-soft bg-app-surface-card px-4 py-3 text-left outline-none transition-colors hover:border-app-border-control hover:bg-app-surface-hover focus-visible:ring-2 focus-visible:ring-app-accent"
      href={`/simulator?deck=${deck.id}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-[12px] text-app-text-strong">{deck.name}</span>
        <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-app-text-dim">
          {deck.colorCodes.length > 0 ? deck.colorCodes.join(" / ") : "No colors"}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[10px] text-app-card-yellow">
        {deck.cardCount} cards
      </span>
    </Link>
  );
}

function SetupState({ setup }: { setup: Exclude<SimulatorSetup, { kind: "ready" }> }) {
  if (setup.kind === "error") {
    return (
      <Alert className="border-app-danger-border bg-app-danger-surface text-app-danger-text" variant="destructive">
        <AlertTitle>{setup.title}</AlertTitle>
        <AlertDescription className="mt-2 text-[11px] leading-5 text-app-danger-muted">
          {setup.message}
        </AlertDescription>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            className="inline-flex min-h-11 items-center rounded-[6px] bg-app-accent px-4 font-mono text-[9px] uppercase tracking-[0.08em] text-app-canvas outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
            href="/simulator"
          >
            Choose another deck
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-[6px] border border-app-border-control px-4 font-mono text-[9px] uppercase tracking-[0.08em] text-app-text-panel outline-none hover:border-app-accent focus-visible:ring-2 focus-visible:ring-app-accent"
            href="/decks"
          >
            Review decks
          </Link>
        </div>
      </Alert>
    );
  }

  return (
    <section aria-label="Choose simulator deck" className="min-w-0 rounded-[10px] border border-app-border-soft bg-app-surface p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">Setup</p>
          <h2 className="mt-3 text-[22px] leading-tight tracking-[-0.02em] text-app-text-strong">Choose a deck</h2>
          <p className="mt-2 max-w-xl text-[12px] leading-5 text-app-text-muted">
            Select an owned cloud deck. The simulator checks its cards before a game can start.
          </p>
        </div>
        <Link className="inline-flex min-h-11 items-center rounded-[4px] px-2 font-mono text-[9px] uppercase tracking-[0.08em] text-app-accent-hover underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent" href="/decks">
          Manage decks
        </Link>
      </div>
      {setup.decks.length > 0 ? (
        <div className="mt-6 grid min-w-0 gap-2">
          {setup.decks.map((deck) => <DeckChoice deck={deck} key={deck.id} />)}
        </div>
      ) : (
        <div className="mt-6 rounded-[8px] border border-dashed border-app-border-dashed bg-app-surface-card px-4 py-6">
          <h3 className="text-[14px] text-app-text-strong">No owned decks yet</h3>
          <p className="mt-2 text-[11px] leading-5 text-app-text-muted">Build a deck before starting a simulation.</p>
          <Link className="mt-5 inline-flex min-h-11 items-center rounded-[6px] bg-app-accent px-4 font-mono text-[9px] uppercase tracking-[0.08em] text-app-canvas outline-none focus-visible:ring-2 focus-visible:ring-app-accent" href="/decks/new">
            Build a deck
          </Link>
        </div>
      )}
    </section>
  );
}

function ReadyScreen({
  setup,
  state,
  dispatch,
}: {
  setup: Extract<SimulatorSetup, { kind: "ready" }>;
  state: SimulatorUiState;
  dispatch: React.Dispatch<SimulatorUiAction>;
}) {
  const [firstPlayer, setFirstPlayer] = useState<PlayerId>("player");
  const game = state.game;
  const gameStatus = getSimulatorGameStatus(game);
  const legalActions = game === null ? [] : getSimulatorLegalActions(game, "player");

  useEffect(() => {
    if (
      game === null ||
      game.winner !== null ||
      game.priorityPlayer !== "bot" ||
      state.error !== null
    ) {
      return;
    }

    const timeout = window.setTimeout(
      () => dispatch({ type: "bot-turn" }),
      160,
    );
    return () => window.clearTimeout(timeout);
  }, [dispatch, game, state.error]);

  function startGame() {
    dispatch({
      type: "start",
      seed: Date.now() >>> 0,
      firstPlayer,
    });
  }

  function dispatchGameAction(action: GameAction) {
    dispatch({ type: "game", action });
  }

  return (
    <>
      <section className="rounded-[10px] border border-app-border-soft bg-app-surface p-4 sm:p-6" data-simulator-layout>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">Deck setup</p>
            <h2 className="mt-3 truncate text-[22px] tracking-[-0.02em] text-app-text-strong">{setup.deck.name}</h2>
            <p className="mt-2 text-[12px] leading-5 text-app-text-muted">Ready to operate with {setup.deck.cardCount} cards and {setup.deck.colorCodes.join(" / ")} identity.</p>
          </div>
          {game === null ? (
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
              <div aria-label="First player" className="flex min-h-11 gap-1 rounded-[6px] border border-app-border-control p-1" role="group">
                {(["player", "bot"] as const).map((player) => (
                  <button
                    aria-pressed={firstPlayer === player}
                    className={cn(
                      "min-h-11 flex-1 rounded-[4px] px-3 font-mono text-[9px] uppercase tracking-[0.08em] outline-none focus-visible:ring-2 focus-visible:ring-app-accent sm:flex-none",
                      firstPlayer === player ? "bg-app-accent text-app-canvas" : "text-app-text-muted hover:text-app-text-panel",
                    )}
                    key={player}
                    onClick={() => setFirstPlayer(player)}
                    type="button"
                  >
                    {player === "player" ? "You start" : "Bot starts"}
                  </button>
                ))}
              </div>
              <Button className="min-h-11 bg-app-accent px-5 font-mono text-[9px] uppercase tracking-[0.08em] text-app-canvas hover:bg-app-accent-hover" onClick={startGame} type="button">
                Start simulation
              </Button>
            </div>
          ) : (
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-app-accent-hover">{gameStatus}</div>
          )}
        </div>
        {state.error ? (
          <Alert className="mt-5 border-app-danger-border bg-app-danger-surface text-app-danger-text" variant="destructive">
            <AlertTitle>Action not applied</AlertTitle>
            <AlertDescription className="mt-1 text-[11px] leading-5 text-app-danger-muted">{state.error}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      {game ? (
        <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <SimulatorBoard
              cards={setup.cards}
              game={game}
              legalActions={legalActions}
              onAction={dispatchGameAction}
            />
            <SimulatorHand
              cards={setup.cards}
              game={game}
              key={game.events.at(-1)?.sequence ?? 0}
              legalActions={legalActions}
              onAction={dispatchGameAction}
            />
          </div>
          <aside className="flex min-w-0 flex-col gap-4">
            <SimulatorStatus
              cards={setup.cards}
              game={game}
              key={`${game.pendingChoice?.type ?? "none"}-${game.pendingChoice && "choiceId" in game.pendingChoice ? game.pendingChoice.choiceId : game.events.at(-1)?.sequence ?? 0}`}
              legalActions={legalActions}
              onAction={dispatchGameAction}
            />
            <SimulatorEventLog events={game.events} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

export function SimulatorScreen({
  setup,
  user,
}: {
  setup: SimulatorSetup;
  user: AuthenticatedUser;
}) {
  const [state, dispatch] = useReducer(simulatorReducer, setup, createSimulatorUiState);

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-app-canvas text-app-text">
      <Sidebar pathname="/simulator" />
      <main className="min-w-0 md:ml-[232px]">
        <div className="min-w-0 px-4 py-5 sm:px-7 md:px-[51px] md:py-[46px]">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">Operate</p>
              <h1 className="mt-4 text-[30px] leading-none tracking-[-0.02em] text-app-text-strong">Solo simulator</h1>
            </div>
            <AccountControls user={user} />
          </header>

          <div className="mt-8 min-w-0">
            {setup.kind === "ready" ? (
              <ReadyScreen dispatch={dispatch} setup={setup} state={state} />
            ) : (
              <SetupState setup={setup} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
