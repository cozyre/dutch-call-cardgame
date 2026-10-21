import { describe, expect, it } from "vitest";
import {
  grantJackToAll,
  grantQueenTo,
  swapGridCards,
  validateQueenSwap,
} from "./abilities";
import { card } from "./testkit";
import type { PlayerState } from "./types";

function players(overrides: Partial<Record<string, Partial<PlayerState>>> = {}): PlayerState[] {
  return [0, 1, 2].map((index) => ({
    id: `p${index}`,
    name: `Player ${index + 1}`,
    seat: index,
    isHost: index === 0,
    connected: true,
    grid: [],
    peekTokens: 0,
    queenTokens: 0,
    disconnectedAt: null,
    ...overrides[`p${index}`],
  }));
}

describe("granting the jack", () => {
  it("gives every player one peek token", () => {
    const result = grantJackToAll(players());
    for (const player of result.players) expect(player.peekTokens).toBe(1);
    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toEqual({ type: "abilityGranted", kind: "jack", playerId: "p0" });
  });

  it("accumulates with the tokens the player already has", () => {
    const result = grantJackToAll(players({ p1: { peekTokens: 2 } }));
    expect(result.players[1].peekTokens).toBe(3);
    expect(result.players[0].peekTokens).toBe(1);
  });
});

describe("granting the queen", () => {
  it("gives the discarding player one queen token", () => {
    const result = grantQueenTo(players(), "p1");
    expect(result.players[1].queenTokens).toBe(1);
    expect(result.players[0].queenTokens).toBe(0);
    expect(result.events).toEqual([
      { type: "abilityGranted", kind: "queen", playerId: "p1" },
    ]);
  });
});

describe("validating a queen swap", () => {
  const roster = players({
    p0: { grid: [card("2", "S")] },
    p1: { grid: [card("3", "H")] },
  });

  it("accepts two different players", () => {
    const result = validateQueenSwap(roster, { playerId: "p0", cardIndex: 0 }, { playerId: "p1", cardIndex: 0 });
    expect(result.ok).toBe(true);
  });

  it("accepts two cards of the same grid", () => {
    const roster = players({
      p0: { grid: [card("2", "S"), card("5", "C")] },
      p1: { grid: [card("3", "H")] },
    });
    const result = validateQueenSwap(
      roster,
      { playerId: "p0", cardIndex: 0 },
      { playerId: "p0", cardIndex: 1 },
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a card swapped with itself", () => {
    const result = validateQueenSwap(
      roster,
      { playerId: "p0", cardIndex: 0 },
      { playerId: "p0", cardIndex: 0 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TARGET");
  });

  it("refuses an unknown player", () => {
    const result = validateQueenSwap(roster, { playerId: "p0", cardIndex: 0 }, { playerId: "p9", cardIndex: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PLAYER_NOT_FOUND");
  });

  it("refuses an index outside the grid", () => {
    const result = validateQueenSwap(roster, { playerId: "p0", cardIndex: 5 }, { playerId: "p1", cardIndex: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("OUT_OF_RANGE");
  });
});

describe("swapping grid cards", () => {
  it("exchanges the two cards and keeps every slot in place", () => {
    const roster = players({
      p0: { grid: [card("2", "S"), card("3", "H")] },
      p1: { grid: [card("4", "D")] },
    });
    const swapped = swapGridCards(roster, { playerId: "p0", cardIndex: 1 }, { playerId: "p1", cardIndex: 0 });
    expect(swapped[0].grid.map((entry) => entry.id)).toEqual(["d0-S-2", "d0-D-4"]);
    expect(swapped[1].grid.map((entry) => entry.id)).toEqual(["d0-H-3"]);
    expect(swapped[2].grid).toHaveLength(0);
  });

  it("exchanges two cards of the same grid without losing either", () => {
    const roster = players({
      p0: { grid: [card("2", "S"), card("3", "H"), card("4", "D")] },
      p1: { grid: [card("5", "C")] },
    });
    const swapped = swapGridCards(
      roster,
      { playerId: "p0", cardIndex: 0 },
      { playerId: "p0", cardIndex: 2 },
    );
    expect(swapped[0].grid.map((entry) => entry.id)).toEqual(["d0-D-4", "d0-H-3", "d0-S-2"]);
    expect(swapped[1].grid.map((entry) => entry.id)).toEqual(["d0-C-5"]);
  });

  it("does not mutate the roster it was given", () => {
    const roster = players({
      p0: { grid: [card("2", "S")] },
      p1: { grid: [card("4", "D")] },
    });
    swapGridCards(roster, { playerId: "p0", cardIndex: 0 }, { playerId: "p1", cardIndex: 0 });
    expect(roster[0].grid[0].id).toBe("d0-S-2");
  });
});
