import type { CardSize } from "@/components/card/CardBack";
import { REVEAL_MS } from "@/game/engine";
import type {
  GameEvent,
  GameView,
  Rank,
  Suit,
  Target,
} from "@/game/types";

/**
 * Pure display helpers for the game board (plan §9).
 *
 * No rule logic lives here — the engine owns the rules. These functions turn
 * a `GameView` (and its events) into the strings and layout numbers the board
 * renders. They are all side-effect free so they can be unit-tested without
 * React.
 */

/* ------------------------------------------------------------------ */
/* timers                                                              */
/* ------------------------------------------------------------------ */

/**
 * Formats a remaining time as `m:ss`. Fractional seconds round **up** so a
 * running countdown never shows `0:00` before its deadline, and a negative
 * remainder clamps to zero — a countdown never reads a negative time.
 */
export function formatClock(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Seconds left on a deadline, rounded up, never negative. */
export function secondsLeft(deadlineAt: number, now: number): number {
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

/* ------------------------------------------------------------------ */
/* grid layout                                                         */
/* ------------------------------------------------------------------ */

export interface GridSpec {
  size: CardSize;
  columns: number;
}

/**
 * The general grid rule (AGENTS "Card grid"): at most 4 rows × 5 columns,
 * `columns = ceil(cards / rows)` for the smallest row count that keeps the
 * column count in range. Cards wrap before they shrink.
 */
export function gridColumns(cardCount: number, maxColumns = 5): number {
  if (cardCount <= 0) return 1;
  const rows = Math.max(1, Math.ceil(cardCount / maxColumns));
  return Math.ceil(cardCount / rows);
}

/**
 * The player's own grid on mobile (AGENTS): ≤ 6 cards use L in 3 columns
 * (design 4:61 shows 2 rows × 3); 7+ cards step down to M in 4–5 columns
 * (design 4:187 shows 7 cards as 4 + 3).
 */
export function mobileOwnGridSpec(cardCount: number): GridSpec {
  if (cardCount <= 6) return { size: "L", columns: 3 };
  return { size: "M", columns: clamp(gridColumns(cardCount), 4, 5) };
}

/**
 * The player's own grid on desktop (design 5:351): one row of L cards —
 * "your row" — wrapping into further rows only when the count outgrows the
 * rail. Cards never shrink to force a fit.
 */
export function desktopOwnGridSpec(cardCount: number): GridSpec {
  return { size: "L", columns: clamp(cardCount, 1, 6) };
}

/** Opponent grids always use S cards (AGENTS). */
export function opponentGridSpec(cardCount: number): GridSpec {
  const rows = Math.max(1, Math.ceil(cardCount / 3));
  return { size: "S", columns: Math.max(1, Math.ceil(cardCount / rows)) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* ------------------------------------------------------------------ */
/* card + copy helpers                                                 */
/* ------------------------------------------------------------------ */

const SUIT_NAMES: Record<Suit, string> = {
  S: "spades",
  H: "hearts",
  D: "diamonds",
  C: "clubs",
};

const RANK_LABELS: Record<Rank, string> = {
  A: "Ace",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  J: "Jack",
  Q: "Queen",
  K: "King",
};

/** "7", "Jack", "Queen" … — the spoken form used in sentence copy. */
export function rankLabel(rank: Rank): string {
  return RANK_LABELS[rank];
}

/** "9 of hearts" — used for the drawn-card sentence and results. */
export function cardName(rank: Rank, suit: Suit): string {
  return `${RANK_LABELS[rank]} of ${SUIT_NAMES[suit]}`;
}

/** "a 9" / "a Jack" — the article form used in event copy. */
export function rankArticle(rank: Rank): string {
  return `a ${RANK_LABELS[rank]}`;
}

/**
 * The reconnect grace window (plan §4.1 / server): 60 seconds, then the seat
 * is forfeited. Mirrors the server constant so the UI counts down accurately
 * from `players[].disconnectedAt`.
 */
export const RECONNECT_GRACE_MS = 60_000;

/**
 * The design re-hides a peeked card after ~3 s (client-side only). The
 * server's reveal window stays 8 s (plan A5) and a value is never rendered
 * past `revealedUntil` — this constant only shortens the display.
 */
export const PEEK_DISPLAY_MS = 3_000;

/**
 * Whether a peeked card's face should still be displayed: the first
 * `PEEK_DISPLAY_MS` of the server's `REVEAL_MS` reveal window, and never
 * after the window itself closes. A client that learned a value mid-window
 * (a late reconnect) simply shows it for the remainder of the short display
 * window.
 */
export function isRevealDisplayed(revealedUntil: number, now: number): boolean {
  const remaining = revealedUntil - now;
  return remaining > REVEAL_MS - PEEK_DISPLAY_MS;
}

/* ------------------------------------------------------------------ */
/* seat + headline copy                                                */
/* ------------------------------------------------------------------ */

/** The one-line status under an opponent's name in a Seat. */
export function seatStatus(
  view: GameView,
  player: GameView["players"][number],
  now: number,
): string {
  if (!player.connected && player.disconnectedAt !== null) {
    const elapsed = Math.max(0, now - player.disconnectedAt);
    return `Reconnecting ${formatClock(RECONNECT_GRACE_MS - elapsed)}`;
  }
  if (player.id === view.turnPlayerId && view.phase === "playing") {
    const deadline = view.deadlineAt;
    if (deadline !== null && deadline > now) {
      return `Their turn · ${formatClock(deadline - now)}`;
    }
    return "Their turn";
  }
  return `${player.cardCount} ${player.cardCount === 1 ? "card" : "cards"}`;
}

export function isMyTurn(view: GameView): boolean {
  return view.turnPlayerId !== null && view.turnPlayerId === view.youId;
}

/** The big headline in the header / turn panel. */
export function boardHeadline(view: GameView): string {
  if (view.phase === "over") return "Game over";
  const mine = isMyTurn(view);
  const turnPlayer = view.players.find((player) => player.id === view.turnPlayerId);
  switch (view.stepKind) {
    case "setupPeek":
      return mine ? "Peek at one of your cards" : "Peeking at their cards";
    case "turnStart":
    case "awaitChoice":
      if (mine) return "Your turn";
      if (view.stepKind === "awaitChoice" && turnPlayer) {
        return `${turnPlayer.name} is choosing`;
      }
      return turnPlayer ? `${turnPlayer.name}'s turn` : "Dealing…";
    case "matchWindow":
      return "Match window";
    case "awaitPeek":
      return view.myPeekTokens > 0 ? "Peek at one of your cards" : "Peek window";
    case "awaitQueenSwap": {
      if (view.queenResolverId === view.youId) return "Swap two cards";
      const resolver = view.players.find(
        (player) => player.id === view.queenResolverId,
      );
      return resolver ? `${resolver.name} may swap two cards` : "Queen swap";
    }
    default:
      return "Game over";
  }
}

/* ------------------------------------------------------------------ */
/* queen-swap target validation                                        */
/* ------------------------------------------------------------------ */

export function isSameSlot(a: Target, b: Target): boolean {
  return a.playerId === b.playerId && a.cardIndex === b.cardIndex;
}

/**
 * Whether `target` may be picked as the second queen-swap card after
 * `picked`. Any two distinct slots across any grids — including two slots of
 * one grid (plan A9). Only picking the same slot twice is invalid.
 */
export function canPickQueenTarget(
  picked: Target | null,
  target: Target,
): boolean {
  if (!picked) return true;
  return !isSameSlot(picked, target);
}

/* ------------------------------------------------------------------ */
/* event copy                                                          */
/* ------------------------------------------------------------------ */

/**
 * One short sentence per event, for the toasts and the desktop "Latest"
 * feed. A wrong burn **never** names the burned card — the event carries
 * `rank: null` on purpose (plan gotcha 17) and this copy must not infer it.
 */
export function describeGameEvent(
  event: GameEvent,
  view: Pick<GameView, "players">,
): string | null {
  const nameOf = (playerId: string): string =>
    view.players.find((player) => player.id === playerId)?.name ?? "Someone";

  switch (event.type) {
    case "playerJoined":
      return `${event.name} joined the table`;
    case "playerLeft":
      return `${nameOf(event.playerId)} left the table`;
    case "gameStarted":
      return "The game has started";
    case "cardDrawn":
      return `${nameOf(event.playerId)} drew a card`;
    case "cardDiscarded":
      return `${nameOf(event.playerId)} discarded ${rankArticle(event.rank)}`;
    case "burned":
      // A correct burn names the rank (the card is face-up on the discard
      // pile, so it is public). A wrong burn must stay unnamed — the card
      // went back face down and nobody may learn its value.
      if (event.correct && event.rank !== null) {
        return `${nameOf(event.playerId)} matched ${rankArticle(event.rank)} and discarded it`;
      }
      return `${nameOf(event.playerId)} burned the wrong card`;
    case "penaltyAdded":
      return `${nameOf(event.playerId)} drew a penalty card`;
    case "abilityGranted":
      return event.kind === "jack"
        ? `${nameOf(event.playerId)} may peek at a card`
        : `${nameOf(event.playerId)} gained a queen swap`;
    case "peeked":
      return `${nameOf(event.playerId)} peeked at a card`;
    case "queenSwapped":
      return `${nameOf(event.a.playerId)} swapped two cards`;
    case "dutchCalled":
      return `${nameOf(event.playerId)} called Dutch`;
    case "turnPassed":
      return null;
    case "gameOver":
      return "Game over";
    default:
      return null;
  }
}

/**
 * The sentence under the match banner. Same rule as above: a wrong burn is
 * described without the card's rank.
 */
export function matchBannerBody(
  view: GameView,
  discardedBy: string,
  discardedRank: Rank,
): string {
  const mine = isMyTurn(view);
  if (mine) {
    return `You discarded ${rankArticle(discardedRank)}. Tap a card of the same rank to burn it, or wait for the timer.`;
  }
  return `${discardedBy} discarded ${rankArticle(discardedRank)}. Everyone can tap a card they think is ${rankArticle(discardedRank)} until the timer ends.`;
}

/** Feedback line for the viewer's own wrong burn — never names the card. */
export function wrongBurnCopy(): string {
  return "Wrong guess — penalty card added";
}
