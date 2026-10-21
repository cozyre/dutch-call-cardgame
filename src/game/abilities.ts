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
 * A queen swap is blind and picks **any** two cards (PRD §5.4.4 / §6): the
 * resolver's own grid and another player's grid, two other players' grids, or
 * two cards of a single grid. One card each, positions preserved.
 */
export function validateQueenSwap(
  players: PlayerState[],
  a: Target,
  b: Target,
): { ok: true } | { ok: false; error: GameError } {
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
  if (a.playerId === b.playerId && a.cardIndex === b.cardIndex) {
    return {
      ok: false,
      error: gameError("INVALID_TARGET", "A card cannot be swapped with itself."),
    };
  }
  return { ok: true };
}

/**
 * Swaps two cards. Both cards stay face down.
 *
 * The two targets may live in the same grid (both slots are rewritten) or in
 * two different grids (one slot each).
 */
export function swapGridCards(players: PlayerState[], a: Target, b: Target): PlayerState[] {
  const playerA = findPlayer(players, a.playerId);
  const playerB = findPlayer(players, b.playerId);
  if (!playerA || !playerB) return players;
  const cardA = playerA.grid[a.cardIndex];
  const cardB = playerB.grid[b.cardIndex];

  if (a.playerId === b.playerId) {
    return players.map((player) => {
      if (player.id !== a.playerId) return player;
      const grid = player.grid.slice();
      grid[a.cardIndex] = cardB;
      grid[b.cardIndex] = cardA;
      return { ...player, grid };
    });
  }

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
