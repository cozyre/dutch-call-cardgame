import type { Card } from "./types";
import { RANK_ORDER, SUIT_ORDER } from "./values";

export const CARDS_PER_DECK = 52;

export { RANK_ORDER, SUIT_ORDER };

/**
 * `deckCount` standard 52-card decks combined into one deck source.
 * Card ids are globally unique across decks: "d{deck}-{suit}-{rank}".
 */
export function buildDeck(deckCount: number): Card[] {
  if (!Number.isInteger(deckCount) || deckCount < 1) {
    throw new RangeError(`deckCount must be a positive integer, got ${deckCount}`);
  }
  const cards: Card[] = [];
  for (let deck = 0; deck < deckCount; deck++) {
    for (const suit of SUIT_ORDER) {
      for (const rank of RANK_ORDER) {
        cards.push({ id: `d${deck}-${suit}-${rank}`, deck, suit, rank });
      }
    }
  }
  return cards;
}

export interface DealResult {
  hands: Card[][];
  drawPile: Card[];
}

/**
 * Deal round-robin (physical style): each player receives one card at a time.
 * The remaining cards become the center pile, top card first.
 */
export function deal(
  deck: readonly Card[],
  playerCount: number,
  cardsPerPlayer: number,
): DealResult {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new RangeError(`playerCount must be a positive integer, got ${playerCount}`);
  }
  if (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer < 0) {
    throw new RangeError(
      `cardsPerPlayer must be a non-negative integer, got ${cardsPerPlayer}`,
    );
  }
  const needed = playerCount * cardsPerPlayer;
  if (deck.length < needed) {
    throw new RangeError(`deck of ${deck.length} cards cannot deal ${needed}`);
  }
  const hands: Card[][] = [];
  for (let i = 0; i < playerCount; i++) hands.push([]);
  for (let round = 0; round < cardsPerPlayer; round++) {
    for (let player = 0; player < playerCount; player++) {
      hands[player].push(deck[round * playerCount + player]);
    }
  }
  return { hands, drawPile: deck.slice(needed) };
}
