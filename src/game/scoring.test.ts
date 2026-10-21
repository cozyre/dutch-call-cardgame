import { describe, expect, it } from "vitest";
import { gridTotal, standings } from "./scoring";
import { card, makeFixture } from "./testkit";

describe("grid totals", () => {
  it("sums the card values", () => {
    expect(gridTotal([])).toBe(0);
    expect(gridTotal([card("A", "S")])).toBe(1);
    expect(gridTotal([card("K", "S"), card("K", "H")])).toBe(13);
    expect(gridTotal([card("J", "S"), card("Q", "D"), card("7", "C")])).toBe(27);
  });
});

describe("standings", () => {
  it("sorts by total, then card count, then seat", () => {
    const state = makeFixture({
      grids: [
        [card("9", "S")],
        [card("2", "H"), card("3", "D")],
        [card("5", "C"), card("6", "S"), card("2", "H")],
      ],
    });
    const table = standings(state);
    expect(table.map((row) => row.playerId)).toEqual(["p1", "p0", "p2"]);
    expect(table[0].total).toBe(5);
    expect(table[1].total).toBe(9);
    expect(table[2].total).toBe(13);
  });

  it("marks the lowest total as the winner", () => {
    const state = makeFixture({
      grids: [[card("9", "S")], [card("2", "H")], [card("5", "C")]],
    });
    const table = standings(state);
    expect(table.find((row) => row.playerId === "p1")?.isWinner).toBe(true);
    expect(table.find((row) => row.playerId === "p0")?.isWinner).toBe(false);
  });

  it("marks a tie for the lowest total as co-winners", () => {
    const state = makeFixture({
      grids: [[card("5", "C")], [card("5", "S")], [card("9", "H")]],
    });
    const table = standings(state);
    expect(table.filter((row) => row.isWinner).map((row) => row.playerId)).toEqual(["p0", "p1"]);
    expect(table.find((row) => row.playerId === "p2")?.isWinner).toBe(false);
  });

  it("lets a player who emptied their grid win outright", () => {
    const state = makeFixture({
      grids: [[], [card("2", "H")], [card("9", "H")]],
    });
    const table = standings(state);
    const winner = table.find((row) => row.playerId === "p0");
    expect(winner?.isWinner).toBe(true);
    expect(winner?.wonOutright).toBe(true);
    expect(table.find((row) => row.playerId === "p1")?.isWinner).toBe(false);
  });

  it("reveals every card of every grid", () => {
    const state = makeFixture({
      grids: [[card("K", "H"), card("J", "S")], [card("A", "C")]],
    });
    const table = standings(state);
    const row = table.find((entry) => entry.playerId === "p0");
    expect(row?.grid).toEqual([
      { rank: "K", suit: "H", value: 13 },
      { rank: "J", suit: "S", value: 10 },
    ]);
  });
});
