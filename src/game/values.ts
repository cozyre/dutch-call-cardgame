import type { Card, Rank, Suit } from "./types";

export const RANK_ORDER: readonly Rank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

export const SUIT_ORDER: readonly Suit[] = ["S", "H", "D", "C"];

export function isRedSuit(suit: Suit): boolean {
  return suit === "H" || suit === "D";
}

/**
 * PRD §6 card values:
 * red King = 13, black King = 0, Jack/Queen = 10, Ace = 1, numbers = face value.
 */
export function cardValue(card: Card): number {
  switch (card.rank) {
    case "A":
      return 1;
    case "J":
    case "Q":
      return 10;
    case "K":
      return isRedSuit(card.suit) ? 13 : 0;
    default:
      return Number.parseInt(card.rank, 10);
  }
}

/** Matching key. A Jack matches a Jack, never a Queen (plan §1, gotcha #8). */
export function rankKey(card: Card): Rank {
  return card.rank;
}

export function sameRank(a: Card, b: Card): boolean {
  return a.rank === b.rank;
}

export function isJack(card: Card): boolean {
  return card.rank === "J";
}

export function isQueen(card: Card): boolean {
  return card.rank === "Q";
}
