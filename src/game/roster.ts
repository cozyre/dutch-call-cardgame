import type { GameState, PlayerId } from "./types";
import { beginFirstTurn } from "./engine";

/**
 * Roster maintenance for the authoritative server.
 *
 * The engine owns the rules; this module owns *who is still in the game*.
 * Both are pure: no `Date.now()`, no `Math.random()`, no I/O.
 */

/** The server-side view of one seat: who it is and whether it is online. */
export interface RosterEntry {
  id: PlayerId;
  connected: boolean;
  disconnectedAt: number | null;
}

/**
 * Mirrors the connection state of the room roster onto the game state.
 * `connected` / `disconnectedAt` are display metadata; they never change
 * the rules, so this is a straight field copy.
 */
export function syncConnections(state: GameState, roster: readonly RosterEntry[]): GameState {
  const byId = new Map(roster.map((entry) => [entry.id, entry]));
  let changed = false;
  const players = state.players.map((player) => {
    const entry = byId.get(player.id);
    if (!entry) return player;
    if (
      player.connected === entry.connected &&
      player.disconnectedAt === entry.disconnectedAt
    ) {
      return player;
    }
    changed = true;
    return {
      ...player,
      connected: entry.connected,
      disconnectedAt: entry.disconnectedAt,
    };
  });
  return changed ? { ...state, players } : state;
}

/**
 * Removes a player (a forfeited seat) from the game state.
 *
 * Only safe at a step boundary: `turnStart` (nobody is mid-decision) and
 * `setupPeek`. At any other step the state is returned unchanged and the
 * caller retries once the current step resolves — removing a player from
 * the middle of a match window or a draw decision would strand the card in
 * flight.
 *
 * The removed player's cards leave the game entirely; they are not recycled.
 */
export function removePlayerFromState(state: GameState, playerId: PlayerId): GameState {
  if (state.phase === "over") return state;
  if (state.step.kind !== "turnStart" && state.step.kind !== "setupPeek") return state;

  const index = state.players.findIndex((player) => player.id === playerId);
  if (index === -1) return state;

  const remaining = state.players
    .filter((_, position) => position !== index)
    .map((player, seat) => ({ ...player, seat }));

  if (remaining.length === 0) {
    return {
      ...state,
      phase: "over",
      step: { kind: "gameOver" },
      players: [],
      burnableBy: [],
      reveals: [],
      batchPeeks: [],
    };
  }

  // The host seat moves to the first remaining player.
  if (state.players[index].isHost) {
    remaining[0] = { ...remaining[0], isHost: true };
  }

  let turnIndex = state.turnIndex;
  if (index < turnIndex) turnIndex -= 1;
  if (turnIndex >= remaining.length) turnIndex = 0;

  const next: GameState = {
    ...state,
    players: remaining,
    turnIndex,
    burnableBy: state.burnableBy.filter((id) => id !== playerId),
    batchPeeks: state.batchPeeks.filter((entry) => entry.playerId !== playerId),
    reveals: state.reveals.filter((reveal) => reveal.playerId !== playerId),
    dutchCallerId: state.dutchCallerId === playerId ? null : state.dutchCallerId,
  };

  // Nobody is left to peek: the setup phase is over.
  if (next.step.kind === "setupPeek" && !remaining.some((player) => player.peekTokens > 0)) {
    return beginFirstTurn(next);
  }

  return next;
}
