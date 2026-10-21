import type { GameState, GameView, GridCardView, PlayerId } from "./types";
import { cardValue } from "./values";

/**
 * Per-player projection — the anti-cheat boundary (plan §4.4).
 *
 * Opponent grids are exposed as a count only, the center pile as a count
 * only, and the discard pile as its top card. A card value reaches a client
 * only through a live `Reveal` for that exact card, or as the drawn card of
 * the active player.
 */
export function projectView(state: GameState, playerId: PlayerId, now: number): GameView {
  const me = state.players.find((player) => player.id === playerId);
  const active = state.players[state.turnIndex];
  const step = state.step;

  const isActivePlayer = active?.id === playerId;
  const liveReveals = state.reveals.filter(
    (reveal) => reveal.playerId === playerId && reveal.until > now,
  );

  const myGrid: GridCardView[] = (me?.grid ?? []).map((card, index) => {
    const reveal = liveReveals.find((entry) => entry.cardIndex === index);
    if (!reveal) {
      return { index, revealed: null, revealedUntil: null };
    }
    return {
      index,
      revealed: { rank: card.rank, suit: card.suit, value: cardValue(card) },
      revealedUntil: reveal.until,
    };
  });

  const discardTop = state.discardPile.length
    ? state.discardPile[state.discardPile.length - 1]
    : null;

  const drawnCard =
    step.kind === "awaitChoice" && isActivePlayer
      ? { rank: step.drawn.rank, suit: step.drawn.suit, value: cardValue(step.drawn) }
      : null;

  return {
    youId: playerId,
    phase: state.phase,
    stepKind: step.kind,
    turnPlayerId: state.phase === "over" ? null : (active?.id ?? null),
    deadlineAt: deadlineOf(step),
    drawPileCount: state.drawPile.length,
    discardTop: discardTop
      ? { rank: discardTop.rank, suit: discardTop.suit, value: cardValue(discardTop) }
      : null,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      seat: player.seat,
      isHost: player.isHost,
      connected: player.connected,
      cardCount: player.grid.length,
    })),
    myGrid,
    drawnCard,
    matchWindow:
      step.kind === "matchWindow"
        ? { rank: step.rank, deadlineAt: step.deadlineAt }
        : null,
    canBurn: step.kind === "matchWindow" && state.burnableBy.includes(playerId),
    canDraw:
      step.kind === "turnStart" && isActivePlayer && state.drawPile.length > 0,
    canDiscardDrawn: step.kind === "awaitChoice" && isActivePlayer,
    canSwapDrawn:
      step.kind === "awaitChoice" && isActivePlayer && (me?.grid.length ?? 0) > 0,
    canDutchCall:
      step.kind === "turnStart" &&
      isActivePlayer &&
      (me?.grid.length ?? 0) === 1 &&
      state.dutchCallerId === null,
    myPeekTokens: me?.peekTokens ?? 0,
    myQueenTokens: me?.queenTokens ?? 0,
    dutchCallerId: state.dutchCallerId,
    result: state.result,
  };
}

function deadlineOf(step: GameState["step"]): number | null {
  switch (step.kind) {
    case "setupPeek":
    case "awaitChoice":
    case "matchWindow":
    case "awaitPeek":
    case "awaitQueenSwap":
      return step.deadlineAt;
    default:
      return null;
  }
}
