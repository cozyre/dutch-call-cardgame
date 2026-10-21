import type { Card, GameState, Standing } from "./types";
import { cardValue } from "./values";

export function gridTotal(grid: readonly Card[]): number {
  let total = 0;
  for (const card of grid) {
    total += cardValue(card);
  }
  return total;
}

/**
 * Final standings (plan §6.5).
 *
 * Sorted by total ascending, then card count ascending, then seat ascending.
 * The lowest total wins; ties for the lowest total are co-winners. A player
 * who emptied their grid wins outright regardless of the totals.
 */
export function standings(state: GameState): Standing[] {
  const rows = state.players.map((player) => ({
    playerId: player.id,
    name: player.name,
    seat: player.seat,
    total: gridTotal(player.grid),
    cardCount: player.grid.length,
    grid: player.grid.map((card) => ({
      rank: card.rank,
      suit: card.suit,
      value: cardValue(card),
    })),
  }));

  if (rows.length === 0) return [];

  rows.sort(
    (a, b) => a.total - b.total || a.cardCount - b.cardCount || a.seat - b.seat,
  );

  const outright = rows.filter((row) => row.cardCount === 0);
  const winners = outright.length > 0 ? outright : rows.filter((row) => row.total === rows[0].total);
  const winnerIds = new Set(winners.map((winner) => winner.playerId));

  return rows.map((row) => ({
    playerId: row.playerId,
    name: row.name,
    total: row.total,
    cardCount: row.cardCount,
    grid: row.grid,
    isWinner: winnerIds.has(row.playerId),
    wonOutright: row.cardCount === 0,
  }));
}
