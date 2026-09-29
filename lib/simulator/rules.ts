import type {
  BattleSlot,
  BattleTarget,
  GameState,
  PlayerId,
  Zone,
} from "./types";

const BATTLE_SLOTS: readonly BattleSlot[] = [
  "front",
  "wingLeft",
  "wingRight",
  "back",
];

const AREA_LIMITS: Partial<Record<Zone, number>> = {
  deck: 50,
  hand: 9,
  front: 1,
  wingLeft: 1,
  wingRight: 1,
  back: 1,
  base: 6,
  timeline: 9,
  rushPointDeck: 9,
};

export function getAreaLimit(zone: Zone): number | null {
  return AREA_LIMITS[zone] ?? null;
}

export function getBattleDistance(from: BattleSlot, to: BattleSlot): number {
  return Math.abs(BATTLE_SLOTS.indexOf(from) - BATTLE_SLOTS.indexOf(to));
}

export function isBattleSlot(zone: Zone): zone is BattleSlot {
  return BATTLE_SLOTS.includes(zone as BattleSlot);
}

export function getOpponent(playerId: PlayerId): PlayerId {
  return playerId === "player" ? "bot" : "player";
}

export function isWinningTimeline(timeline: readonly string[]): boolean {
  return timeline.length >= 9;
}

export function hasUniqueFieldMemberships(
  state: Pick<GameState, "players">,
): boolean {
  const seen = new Set<string>();
  for (const playerId of ["player", "bot"] as const) {
    const player = state.players[playerId];
    for (const slot of BATTLE_SLOTS) {
      const instanceId = player.battle[slot];
      if (instanceId !== null) {
        if (seen.has(instanceId)) return false;
        seen.add(instanceId);
      }
    }
    for (const instanceId of player.base) {
      if (seen.has(instanceId)) return false;
      seen.add(instanceId);
    }
  }
  return true;
}

export function getLegalBattleTargets(
  state: Pick<GameState, "players" | "instances">,
  playerId: PlayerId,
  attackerId: string,
  range: number,
): readonly BattleTarget[] {
  if (!Number.isInteger(range) || range < 0) return [];
  const player = state.players[playerId];
  const attacker = state.instances[attackerId];
  const attackerSlot = BATTLE_SLOTS.find(
    (slot) => player.battle[slot] === attackerId,
  );
  if (
    attackerSlot === undefined ||
    attacker === undefined ||
    attacker.zone !== attackerSlot ||
    attacker.faceDown ||
    attacker.controllerId !== playerId ||
    !hasUniqueBattleMembership(player, attackerId, attackerSlot)
  ) {
    return [];
  }

  const opponentId = getOpponent(playerId);
  const opponent = state.players[opponentId];
  if (!hasUniqueFieldMemberships(state)) return [];

  const targets: BattleTarget[] = [];
  for (const slot of BATTLE_SLOTS) {
    if (getBattleDistance(attackerSlot, slot) > range) continue;
    const targetId = opponent.battle[slot];
    if (targetId === null) {
      targets.push(`weakness:${slot}`);
      continue;
    }
    const target = state.instances[targetId];
    if (
      target !== undefined &&
      target.zone === slot &&
      !target.faceDown &&
      target.controllerId === opponentId &&
      hasUniqueBattleMembership(opponent, targetId, slot)
    ) {
      targets.push(targetId);
    }
  }
  return targets;
}

function hasUniqueBattleMembership(
  player: GameState["players"][PlayerId],
  instanceId: string,
  slot: BattleSlot,
): boolean {
  const count = BATTLE_SLOTS.reduce(
    (total, candidate) =>
      total + (player.battle[candidate] === instanceId ? 1 : 0),
    0,
  );
  return count === 1 && player.battle[slot] === instanceId;
}
