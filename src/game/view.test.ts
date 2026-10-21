import { describe, expect, it } from "vitest";
import { projectView } from "./view";
import { applyTimeout } from "./engine";
import { card, makeFixture, makeState, act, expectOk } from "./testkit";

const START = 1_000;

function fixture() {
  return makeFixture({
    grids: [
      [card("5", "S"), card("6", "H")],
      [card("7", "D"), card("8", "C")],
      [card("9", "S")],
    ],
    drawPile: [card("10", "H"), card("J", "D"), card("Q", "C")],
    discardPile: [card("2", "S"), card("3", "H")],
    step: { kind: "turnStart" },
  });
}

describe("view projection (plan §4.4)", () => {
  it("exposes opponent grids as a count only", () => {
    const view = projectView(fixture(), "p0", START);
    expect(view.players.map((player) => player.cardCount)).toEqual([2, 2, 1]);
    expect(view.myGrid).toHaveLength(2);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("d0-D-7");
    expect(serialized).not.toContain("d0-C-8");
  });

  it("exposes the center pile as a count only", () => {
    const view = projectView(fixture(), "p0", START);
    expect(view.drawPileCount).toBe(3);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("d0-H-10");
    expect(serialized).not.toContain("d0-D-J");
  });

  it("exposes only the top card of the discard pile", () => {
    const view = projectView(fixture(), "p0", START);
    expect(view.discardTop).toEqual({ rank: "3", suit: "H", value: 3 });
    expect(JSON.stringify(view)).not.toContain("d0-S-2");
  });

  it("shows a reveal to its owner only", () => {
    const state = makeFixture({
      grids: [[card("5", "S")], [card("6", "H")]],
      reveals: [
        { playerId: "p0", cardIndex: 0, cardId: "d0-S-5", until: START + 8_000 },
        { playerId: "p1", cardIndex: 0, cardId: "d0-H-6", until: START + 8_000 },
      ],
    });
    const mine = projectView(state, "p0", START);
    expect(mine.myGrid[0].revealed).toEqual({ rank: "5", suit: "S", value: 5 });
    expect(mine.myGrid[0].revealedUntil).toBe(START + 8_000);

    const theirs = projectView(state, "p1", START);
    expect(theirs.myGrid[0].revealed).toEqual({ rank: "6", suit: "H", value: 6 });
    expect(projectView(state, "p2", START).myGrid).toHaveLength(0);
  });

  it("drops a reveal once it expired", () => {
    const state = makeFixture({
      grids: [[card("5", "S")], [card("6", "H")]],
      reveals: [{ playerId: "p0", cardIndex: 0, cardId: "d0-S-5", until: START + 8_000 }],
    });
    const view = projectView(state, "p0", START + 8_001);
    expect(view.myGrid[0].revealed).toBeNull();
    expect(view.myGrid[0].revealedUntil).toBeNull();
  });

  it("kills a reveal when a queen swap replaces the card in that slot", () => {
    const state = makeFixture({
      grids: [[card("5", "S")], [card("6", "H")]],
      reveals: [{ playerId: "p0", cardIndex: 0, cardId: "d0-S-5", until: START + 8_000 }],
    });
    const swapped = {
      ...state,
      players: state.players.map((player) =>
        player.id === "p0" ? { ...player, grid: [card("10", "D")] } : player,
      ),
    };
    const view = projectView(swapped, "p0", START + 1_000);
    expect(view.myGrid[0].revealed).toBeNull();
    expect(view.myGrid[0].revealedUntil).toBeNull();
  });

  it("shows the drawn card to the active player only", () => {
    const lobby = makeState({ playerCount: 3 });
    const started = expectOk(act(lobby, { type: "startGame" }, "p0", START));
    const ready = expectOk(applyTimeout(started, START + 31_000)!);
    const drawn = expectOk(act(ready, { type: "draw" }, "p0", START + 32_000));
    expect(drawn.step.kind).toBe("awaitChoice");

    const active = projectView(drawn, "p0", START + 32_000);
    expect(active.drawnCard).not.toBeNull();
    expect(active.drawnCard?.rank).toBe(
      drawn.step.kind === "awaitChoice" ? drawn.step.drawn.rank : null,
    );

    const other = projectView(drawn, "p1", START + 32_000);
    expect(other.drawnCard).toBeNull();
  });

  it("reports the current step and the deadline", () => {
    const view = projectView(fixture(), "p0", START);
    expect(view.stepKind).toBe("turnStart");
    expect(view.deadlineAt).toBeNull();
    expect(view.turnPlayerId).toBe("p0");
  });

  it("reports the match window to everybody", () => {
    const state = makeFixture({
      grids: [[card("5", "S")], [card("6", "H")]],
      step: { kind: "matchWindow", rank: "4", deadlineAt: START + 30_000 },
      burnableBy: ["p0", "p1"],
    });
    expect(projectView(state, "p0", START).matchWindow).toEqual({
      rank: "4",
      deadlineAt: START + 30_000,
    });
    expect(projectView(state, "p1", START).matchWindow).not.toBeNull();
    expect(projectView(state, "p0", START).canBurn).toBe(true);
  });

  it("computes the action flags", () => {
    const state = fixture();
    const view = projectView(state, "p0", START);
    expect(view.canDraw).toBe(true);
    expect(view.canDiscardDrawn).toBe(false);
    expect(view.canSwapDrawn).toBe(false);
    expect(view.canDutchCall).toBe(false);

    const waiting = projectView(state, "p1", START);
    expect(waiting.canDraw).toBe(false);
  });

  it("allows the dutch call with exactly one card left", () => {
    const state = makeFixture({
      grids: [[card("5", "S")], [card("6", "H")]],
      step: { kind: "turnStart" },
    });
    expect(projectView(state, "p0", START).canDutchCall).toBe(true);
    expect(projectView(state, "p1", START).canDutchCall).toBe(false);
  });

  it("reports the players of the room", () => {
    const view = projectView(fixture(), "p0", START);
    expect(view.players.map((player) => player.name)).toEqual([
      "Player 1",
      "Player 2",
      "Player 3",
    ]);
    expect(view.players[0].isHost).toBe(true);
    expect(view.youId).toBe("p0");
  });

  it("reports the result at the end of the game", () => {
    const state = makeFixture({
      grids: [[card("5", "S")], [card("6", "H")]],
      phase: "over",
      step: { kind: "gameOver" },
    });
    const view = projectView(state, "p0", START);
    expect(view.phase).toBe("over");
    expect(view.turnPlayerId).toBeNull();
  });
});
