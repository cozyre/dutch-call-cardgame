import { describe, expect, it } from "vitest";
import { CARDS_PER_DECK, buildDeck, deal } from "./deck";
import { RANK_ORDER, SUIT_ORDER } from "./values";

describe("deck construction", () => {
  it("builds one standard 52 card deck", () => {
    expect(buildDeck(1)).toHaveLength(52);
  });

  it("builds 52 cards per deck for 1 to 3 decks", () => {
    for (let decks = 1; decks <= 3; decks++) {
      expect(buildDeck(decks)).toHaveLength(CARDS_PER_DECK * decks);
    }
  });

  it("uses unique ids across decks", () => {
    const deck = buildDeck(3);
    const ids = new Set(deck.map((entry) => entry.id));
    expect(ids.size).toBe(deck.length);
  });

  it("formats ids as d{deck}-{suit}-{rank}", () => {
    for (const entry of buildDeck(2)) {
      expect(entry.id).toBe(`d${entry.deck}-${entry.suit}-${entry.rank}`);
    }
  });

  it("contains no jokers and only known ranks", () => {
    for (const entry of buildDeck(3)) {
      expect(RANK_ORDER).toContain(entry.rank);
      expect(SUIT_ORDER).toContain(entry.suit);
    }
  });

  it("gives every deck the same 52 distinct cards", () => {
    const deck = buildDeck(2);
    const first = deck.filter((entry) => entry.deck === 0);
    const second = deck.filter((entry) => entry.deck === 1);
    expect(first).toHaveLength(52);
    expect(second).toHaveLength(52);
    const key = (entry: { suit: string; rank: string }) => `${entry.suit}-${entry.rank}`;
    expect(new Set(first.map(key)).size).toBe(52);
    expect(new Set(second.map(key)).size).toBe(52);
    expect(first.map(key).sort()).toEqual(second.map(key).sort());
  });

  it("rejects an invalid deck count", () => {
    expect(() => buildDeck(0)).toThrow();
    expect(() => buildDeck(-1)).toThrow();
    expect(() => buildDeck(1.5)).toThrow();
  });
});

describe("dealing", () => {
  it("gives every player the requested number of cards", () => {
    const { hands, drawPile } = deal(buildDeck(1), 3, 6);
    expect(hands).toHaveLength(3);
    for (const hand of hands) expect(hand).toHaveLength(6);
    expect(drawPile).toHaveLength(52 - 18);
  });

  it("deals every card exactly once", () => {
    const deck = buildDeck(2);
    const { hands, drawPile } = deal(deck, 6, 10);
    const dealt = hands.flat().concat(drawPile);
    expect(dealt).toHaveLength(deck.length);
    expect(new Set(dealt.map((entry) => entry.id)).size).toBe(deck.length);
  });

  it("keeps the center pile as the remaining cards", () => {
    const deck = buildDeck(1);
    const { hands, drawPile } = deal(deck, 4, 4);
    const dealtIds = new Set(hands.flat().map((entry) => entry.id));
    for (const entry of drawPile) {
      expect(dealtIds.has(entry.id)).toBe(false);
    }
  });

  it("refuses to deal more cards than the deck holds", () => {
    expect(() => deal(buildDeck(1), 6, 20)).toThrow();
  });
});
