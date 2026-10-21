import type { GameEvent, PlayerId, PlayerState, Target } from "./types";
import type { GameError } from "./errors";
import { gameError } from "./errors";

/**
 * Ability mechanics (plan §6.4). Pure data transformations — the engine owns
 * the phase orchestration, this module only knows the rules.
 */

/** A discarded Jack grants one peek token to *every* player, including the discarder. */
export function grantJackToAll(players: PlayerState[]): {
  players: PlayerState[];
  events: GameEvent[];
} {
  const events: GameEvent[] = players.map((player) => ({
    type: "abilityGranted",
    kind: "jack",
    playerId: player.id,
  }));
  const next = players.map((player) => ({ ...player, peekTokens: player.peekTokens + 1 }));
  return { players: next, events };
}

/** A discarded Queen grants one queen token to the discarding player. */
export function grantQueenTo(
  players: PlayerState[],
  playerId: PlayerId,
): { players: PlayerState[]; events: GameEvent[] } {
  const events: GameEvent[] = [{ type: "abilityGranted", kind: "queen", playerId }];
  const next = players.map((player) =>
    player.id === playerId ? { ...player, queenTokens: player.queenTokens + 1 } : player,
  );
  return { players: next, events };
}

export function findPlayer(players: PlayerState[], playerId: PlayerId): PlayerState | undefined {
  return players.find((player) => player.id === playerId);
}

/**
 * A queen swap is blind and cross-player (plan A9): two *different* players'
 * grids, one card each, positions preserved.
 */
export function validateQueenSwap(
  players: PlayerState[],
  a: Target,
  b: Target,
): { ok: true } | { ok: false; error: GameError } {
  if (a.playerId === b.playerId) {
    return {
      ok: false,
      error: gameError(
        "INVALID_TARGET",
        "A queen swap must involve two different players.",
      ),
    };
  }
  const playerA = findPlayer(players, a.playerId);
  const playerB = findPlayer(players, b.playerId);
  if (!playerA || !playerB) {
    return { ok: false, error: gameError("PLAYER_NOT_FOUND", "Unknown player in swap.") };
  }
  if (!Number.isInteger(a.cardIndex) || a.cardIndex < 0 || a.cardIndex >= playerA.grid.length) {
    return { ok: false, error: gameError("OUT_OF_RANGE", "That card is not in the first grid.") };
  }
  if (!Number.isInteger(b.cardIndex) || b.cardIndex < 0 || b.cardIndex >= playerB.grid.length) {
    return { ok: false, error: gameError("OUT_OF_RANGE", "That card is not in the second grid.") };
  }
  return { ok: true };
}

/** Swaps two cards between two players' grids. Both cards stay face down. */
export function swapGridCards(players: PlayerState[], a: Target, b: Target): PlayerState[] {
  const playerA = findPlayer(players, a.playerId);
  const playerB = findPlayer(players, b.playerId);
  if (!playerA || !playerB) return players;
  const cardA = playerA.grid[a.cardIndex];
  const cardB = playerB.grid[b.cardIndex];
  return players.map((player) => {
    if (player.id === a.playerId) {
      const grid = player.grid.slice();
      grid[a.cardIndex] = cardB;
      return { ...player, grid };
    }
    if (player.id === b.playerId) {
      const grid = player.grid.slice();
      grid[b.cardIndex] = cardA;
      return { ...player, grid };
    }
    return player;
  });
}
