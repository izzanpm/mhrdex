import { nextRandom } from "./engine";
import type { BotView, GameAction } from "./types";

export function chooseBotAction(view: BotView): GameAction | null {
  if (view.legalActions.length === 0) return null;

  const priorities: readonly ((action: GameAction) => boolean)[] = [
    (action) => isImmediateWin(action, view),
    isMandatoryResolution,
    isCall,
    isAttackOrMove,
    isSupportedEffect,
    isPass,
  ];

  for (const matches of priorities) {
    const candidates = view.legalActions.filter(matches);
    if (candidates.length > 0) return chooseTie(candidates, view);
  }

  return chooseTie(view.legalActions, view);
}

function isImmediateWin(action: GameAction, view: BotView): boolean {
  return action.type === "select-attack-target" &&
    action.targetId.startsWith("weakness:") &&
    view.publicState.players.bot.timeline.length >= 8 &&
    view.publicState.players.bot.rushPointDeckCount > 0;
}

function isMandatoryResolution(action: GameAction): boolean {
  return action.type === "submit-mulligan" ||
    action.type === "choose-effect" ||
    action.type === "select-attack-target" ||
    action.type === "rearrange-battle" ||
    action.type === "battle-confirmation";
}

function isCall(action: GameAction): boolean {
  return action.type === "call" || action.type === "counter-call";
}

function isAttackOrMove(action: GameAction): boolean {
  return action.type === "base-deploy" ||
    action.type === "battle-base-move" ||
    action.type === "declare-attack";
}

function isSupportedEffect(action: GameAction): boolean {
  return action.type === "activate-effect" || action.type === "counter-effect";
}

function isPass(action: GameAction): boolean {
  return action.type === "counter-pass" || action.type === "end-action-phase";
}

function chooseTie(
  actions: readonly GameAction[],
  view: BotView,
): GameAction {
  const ordered = [...actions].sort((left, right) =>
    serializeAction(left).localeCompare(serializeAction(right)),
  );
  const random = nextRandom(view.rngState);
  return ordered[Math.floor(random.value * ordered.length)]!;
}

function serializeAction(action: GameAction): string {
  return JSON.stringify(action) ?? "";
}
