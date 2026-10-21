import { describe, expect, it } from "vitest";
import { RANK_ORDER, SUIT_ORDER, cardValue, isRedSuit, rankKey, sameRank } from "./values";
import { card } from "./testkit";

describe("card values (PRD §6)", () => {
  it("scores every rank and suit combination", () => {
    for (const suit of SUIT_ORDER) {
      for (const rank of RANK_ORDER) {
        const value = cardValue(card(rank, suit));
        if (rank === "K") {
          expect(value).toBe(isRedSuit(suit) ? 13 : 0);
        } else if (rank === "J" || rank === "Q") {
          expect(value).toBe(10);
        } else if (rank === "A") {
          expect(value).toBe(1);
        } else {
          expect(value).toBe(Number.parseInt(rank, 10));
        }
      }
    }
  });

  it("scores a red king as 13 and a black king as 0", () => {
    expect(cardValue(card("K", "H"))).toBe(13);
    expect(cardValue(card("K", "D"))).toBe(13);
    expect(cardValue(card("K", "S"))).toBe(0);
    expect(cardValue(card("K", "C"))).toBe(0);
  });

  it("scores jack and queen as 10", () => {
    for (const suit of SUIT_ORDER) {
      expect(cardValue(card("J", suit))).toBe(10);
      expect(cardValue(card("Q", suit))).toBe(10);
    }
  });

  it("scores the ace as 1 and numbers as face value", () => {
    expect(cardValue(card("A", "S"))).toBe(1);
    expect(cardValue(card("2", "S"))).toBe(2);
    expect(cardValue(card("9", "S"))).toBe(9);
    expect(cardValue(card("10", "S"))).toBe(10);
  });

  it("matches by rank, not by score value", () => {
    expect(rankKey(card("J", "S"))).toBe("J");
    expect(rankKey(card("J", "H"))).toBe("J");
    expect(sameRank(card("J", "S"), card("J", "H"))).toBe(true);
    expect(sameRank(card("J", "S"), card("Q", "H"))).toBe(false);
    expect(sameRank(card("10", "S"), card("Q", "H"))).toBe(false);
  });
});
