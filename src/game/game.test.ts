import { describe, expect, it } from "vitest";
import { playRandomGame } from "./testkit";
import { projectView } from "./view";

describe("full games", () => {
  it("plays complete games without breaking a single rule", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const run = playRandomGame({ seed, playerCount: 3, preset: "easy" });
      expect(run.violations).toEqual([]);
      expect(run.state.phase).toBe("over");
      expect(run.state.result).not.toBeNull();
    }
  });

  it("plays games with more players and bigger grids", () => {
    for (let seed = 20; seed <= 26; seed++) {
      const run = playRandomGame({ seed, playerCount: 6, preset: "hard" });
      expect(run.violations).toEqual([]);
      expect(run.state.phase).toBe("over");
    }
  });

  it("keeps the card count through a whole game", () => {
    const run = playRandomGame({ seed: 99, playerCount: 4, preset: "tricky" });
    expect(run.violations).toEqual([]);
  });

  it("never leaks a card to the wrong player", () => {
    const run = playRandomGame({ seed: 7, playerCount: 3, preset: "easy" });
    const state = run.state;
    for (const player of state.players) {
      const view = projectView(state, player.id, Date.now());
      const serialized = JSON.stringify(view);
      for (const other of state.players) {
        if (other.id === player.id) continue;
        for (const card of other.grid) {
          expect(serialized).not.toContain(card.id);
        }
      }
    }
  });
});
