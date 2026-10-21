import { describe, expect, it } from "vitest";
import { applyTimeout } from "./engine";
import type { Action, GameState, PlayerId } from "./types";
import {
  act,
  allIds,
  card,
  countCards,
  expectError,
  expectOk,
  makeFixture,
  makeState,
} from "./testkit";

const START = 1_000;

function startedGame(playerCount = 3, preset: "easy" | "normal" = "easy", seed = 42): GameState {
  const lobby = makeState({ playerCount, preset, seed });
  return expectOk(act(lobby, { type: "startGame" }, "p0", START));
}

function step(state: GameState, action: Action, actor: PlayerId, now = START + 1): GameState {
  return expectOk(act(state, action, actor, now));
}

function timeout(state: GameState, now: number): GameState {
  const result = applyTimeout(state, now);
  if (!result) throw new Error("expected the timeout to fire");
  return expectOk(result);
}

function gridOf(...cards: ReturnType<typeof card>[]) {
  return cards;
}

/* ------------------------------------------------------------------ */
/* startGame                                                           */
/* ------------------------------------------------------------------ */

describe("starting the game", () => {
  it("lets the host start and deals every player", () => {
    const state = startedGame(3, "easy");
    expect(state.phase).toBe("playing");
    expect(state.step.kind).toBe("setupPeek");
    for (const player of state.players) {
      expect(player.grid).toHaveLength(4);
      expect(player.peekTokens).toBe(1);
      expect(player.queenTokens).toBe(0);
    }
    expect(state.drawPile).toHaveLength(52 - 12);
    expect(state.discardPile).toHaveLength(0);
  });

  it("keeps the card count", () => {
    const state = startedGame(3);
    expect(countCards(state)).toBe(52);
    expect(new Set(allIds(state)).size).toBe(52);
  });

  it("refuses to start without the host", () => {
    const lobby = makeState({ playerCount: 3 });
    expect(expectError(act(lobby, { type: "startGame" }, "p1", START))).toBe("NOT_ALLOWED");
  });

  it("refuses to start with fewer than three players", () => {
    const lobby = makeState({ playerCount: 2 });
    expect(expectError(act(lobby, { type: "startGame" }, "p0", START))).toBe("NOT_ALLOWED");
  });

  it("refuses to start twice", () => {
    const state = startedGame(3);
    expect(expectError(act(state, { type: "startGame" }, "p0", START))).toBe("WRONG_PHASE");
  });
});

/* ------------------------------------------------------------------ */
/* setup peek                                                          */
/* ------------------------------------------------------------------ */

describe("setup peek", () => {
  it("gives every player one private peek", () => {
    const state = startedGame(3);
    const after = step(state, { type: "peek", cardIndex: 0 }, "p0");
    expect(after.players[0].peekTokens).toBe(0);
    expect(after.reveals).toHaveLength(1);
    expect(after.reveals[0].playerId).toBe("p0");
    expect(after.reveals[0].until).toBeGreaterThan(START);
  });

  it("rejects a peek on a card that is not in the grid", () => {
    const state = startedGame(3);
    expect(expectError(act(state, { type: "peek", cardIndex: 9 }, "p0", START))).toBe(
      "OUT_OF_RANGE",
    );
  });

  it("rejects a second peek in the same batch", () => {
    const state = startedGame(3);
    const after = step(state, { type: "peek", cardIndex: 0 }, "p0");
    expect(expectError(act(after, { type: "peek", cardIndex: 0 }, "p0", START))).toBe(
      "ALREADY_USED",
    );
  });

  it("starts the first turn once everybody peeked", () => {
    let state = startedGame(3);
    state = step(state, { type: "peek", cardIndex: 0 }, "p0");
    state = step(state, { type: "peek", cardIndex: 1 }, "p1");
    expect(state.step.kind).toBe("setupPeek");
    state = step(state, { type: "peek", cardIndex: 2 }, "p2");
    expect(state.step.kind).toBe("turnStart");
    expect(state.turnIndex).toBe(0);
  });

  it("clears the unused peek tokens when the window expires", () => {
    const state = startedGame(3);
    const after = timeout(state, START + 31_000);
    expect(after.step.kind).toBe("turnStart");
    for (const player of after.players) expect(player.peekTokens).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* the turn                                                            */
/* ------------------------------------------------------------------ */

describe("drawing", () => {
  it("takes the top card of the center pile", () => {
    const state = makeFixture({
      grids: [gridOf(card("5", "S")), gridOf(card("6", "H")), gridOf(card("7", "D"))],
      drawPile: [card("8", "C"), card("9", "S")],
    });
    const after = step(state, { type: "draw" }, "p0");
    expect(after.step.kind).toBe("awaitChoice");
    if (after.step.kind !== "awaitChoice") throw new Error("unreachable");
    expect(after.step.drawn.id).toBe("d0-C-8");
    expect(after.drawPile.map((entry) => entry.id)).toEqual(["d0-S-9"]);
    expect(after.step.deadlineAt).toBe(START + 1 + 30_000);
  });

  it("rejects a draw from a player who is not up", () => {
    const state = makeFixture({
      grids: [gridOf(card("5", "S")), gridOf(card("6", "H")), gridOf(card("7", "D"))],
      drawPile: [card("8", "C")],
    });
    expect(expectError(act(state, { type: "draw" }, "p1", START))).toBe("NOT_YOUR_TURN");
  });

  it("rejects a draw outside the turn", () => {
    const state = makeFixture({
      grids: [gridOf(card("5", "S")), gridOf(card("6", "H")), gridOf(card("7", "D"))],
      step: { kind: "matchWindow", rank: "9", deadlineAt: START + 30_000 },
      burnableBy: ["p0", "p1", "p2"],
    });
    expect(expectError(act(state, { type: "draw" }, "p0", START))).toBe("WRONG_PHASE");
  });
});

describe("discarding the drawn card", () => {
  it("puts the card on the discard pile and opens a match window", () => {
    const state = makeFixture({
      grids: [gridOf(card("5", "S")), gridOf(card("6", "H")), gridOf(card("7", "D"))],
      drawPile: [card("9", "C")],
    });
    const drawn = step(state, { type: "draw" }, "p0");
    const after = step(drawn, { type: "discardDrawn" }, "p0");
    expect(after.discardPile.map((entry) => entry.id)).toEqual(["d0-C-9"]);
    expect(after.step.kind).toBe("matchWindow");
    if (after.step.kind !== "matchWindow") throw new Error("unreachable");
    expect(after.step.rank).toBe("9");
    expect(after.burnableBy).toEqual(["p0", "p1", "p2"]);
  });
});

describe("swapping the drawn card", () => {
  it("takes the grid slot and puts the old card face up on the discard pile", () => {
    const state = makeFixture({
      grids: [
        gridOf(card("2", "S"), card("3", "H")),
        gridOf(card("6", "H"), card("7", "D")),
        gridOf(card("7", "D"), card("8", "C")),
      ],
      drawPile: [card("9", "C")],
    });
    const drawn = step(state, { type: "draw" }, "p0");
    const after = step(drawn, { type: "swapDrawn", cardIndex: 1 }, "p0");

    expect(after.players[0].grid.map((entry) => entry.id)).toEqual(["d0-S-2", "d0-C-9"]);
    expect(after.players[0].grid).toHaveLength(2);
    expect(after.discardPile.map((entry) => entry.id)).toEqual(["d0-H-3"]);
    expect(after.step.kind).toBe("matchWindow");
    if (after.step.kind !== "matchWindow") throw new Error("unreachable");
    expect(after.step.rank).toBe("3");
  });

  it("rejects a swap with an index outside the grid", () => {
    const state = makeFixture({
      grids: [gridOf(card("2", "S")), gridOf(card("6", "H")), gridOf(card("7", "D"))],
      drawPile: [card("9", "C")],
    });
    const drawn = step(state, { type: "draw" }, "p0");
    expect(expectError(act(drawn, { type: "swapDrawn", cardIndex: 5 }, "p0", START))).toBe(
      "OUT_OF_RANGE",
    );
  });
});

describe("selecting a card", () => {
  it("remembers the selected grid card", () => {
    const state = makeFixture({
      grids: [gridOf(card("2", "S"), card("6", "H")), gridOf(card("7", "D"))],
      drawPile: [card("9", "C")],
    });
    const drawn = step(state, { type: "draw" }, "p0");
    const after = step(drawn, { type: "selectCard", cardIndex: 1 }, "p0");
    expect(after.step.kind).toBe("awaitChoice");
    if (after.step.kind !== "awaitChoice") throw new Error("unreachable");
    expect(after.step.selectedIndex).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* burning                                                             */
/* ------------------------------------------------------------------ */

describe("burning a matching card", () => {
  const windowState = (): GameState =>
    makeFixture({
      grids: [
        gridOf(card("7", "S"), card("2", "H")),
        gridOf(card("7", "D")),
        gridOf(card("3", "C")),
      ],
      drawPile: [card("9", "C"), card("4", "S")],
      discardPile: [card("7", "H")],
      step: { kind: "matchWindow", rank: "7", deadlineAt: START + 30_000 },
      burnableBy: ["p0", "p1", "p2"],
    });

  it("takes the card out of the grid and onto the discard pile", () => {
    const after = step(windowState(), { type: "burn", cardIndex: 0 }, "p0");
    expect(after.players[0].grid.map((entry) => entry.id)).toEqual(["d0-H-2"]);
    expect(after.discardPile.map((entry) => entry.id)).toEqual(["d0-H-7", "d0-S-7"]);
  });

  it("lets the active player burn as well", () => {
    const state = makeFixture({
      grids: [gridOf(card("7", "S")), gridOf(card("7", "D"))],
      discardPile: [card("7", "H")],
      step: { kind: "matchWindow", rank: "7", deadlineAt: START + 30_000 },
      burnableBy: ["p0", "p1"],
    });
    const after = step(state, { type: "burn", cardIndex: 0 }, "p0");
    expect(after.players[0].grid).toHaveLength(0);
  });

  it("keeps the player eligible to burn again", () => {
    const after = step(windowState(), { type: "burn", cardIndex: 0 }, "p0");
    expect(after.burnableBy).toContain("p0");
  });
});

describe("burning a card that does not match", () => {
  const windowState = (): GameState =>
    makeFixture({
      grids: [
        gridOf(card("2", "S"), card("4", "H")),
        gridOf(card("7", "D")),
        gridOf(card("3", "C")),
      ],
      drawPile: [card("9", "C"), card("4", "S")],
      discardPile: [card("7", "H")],
      step: { kind: "matchWindow", rank: "7", deadlineAt: START + 30_000 },
      burnableBy: ["p0", "p1", "p2"],
    });

  it("puts the card back face down in its own slot", () => {
    const after = step(windowState(), { type: "burn", cardIndex: 1 }, "p0");
    expect(after.players[0].grid[1].id).toBe("d0-H-4");
  });

  it("adds one penalty card from the center pile", () => {
    const after = step(windowState(), { type: "burn", cardIndex: 1 }, "p0");
    expect(after.players[0].grid).toHaveLength(3);
    expect(after.players[0].grid[2].id).toBe("d0-C-9");
    expect(after.drawPile.map((entry) => entry.id)).toEqual(["d0-S-4"]);
  });

  it("stops the player from burning again in that window", () => {
    const after = step(windowState(), { type: "burn", cardIndex: 1 }, "p0");
    expect(after.burnableBy).not.toContain("p0");
    expect(expectError(act(after, { type: "burn", cardIndex: 0 }, "p0", START))).toBe(
      "NOT_ALLOWED",
    );
  });

  it("keeps the cards", () => {
    const after = step(windowState(), { type: "burn", cardIndex: 1 }, "p0");
    expect(countCards(after)).toBe(countCards(windowState()));
  });

  it("rejects a burn outside a match window", () => {
    const state = makeFixture({
      grids: [gridOf(card("2", "S")), gridOf(card("7", "D"))],
      step: { kind: "turnStart" },
    });
    expect(expectError(act(state, { type: "burn", cardIndex: 0 }, "p0", START))).toBe(
      "WRONG_PHASE",
    );
  });
});

/* ------------------------------------------------------------------ */
/* abilities                                                           */
/* ------------------------------------------------------------------ */

describe("the jack", () => {
  it("gives every player a peek token when it is discarded", () => {
    const state = makeFixture({
      grids: [gridOf(card("2", "H")), gridOf(card("3", "C")), gridOf(card("4", "D"))],
      drawPile: [card("J", "S"), card("9", "C")],
    });
    const drawn = step(state, { type: "draw" }, "p0");
    const after = step(drawn, { type: "discardDrawn" }, "p0");
    for (const player of after.players) expect(player.peekTokens).toBe(1);
    expect(after.step.kind).toBe("matchWindow");
  });

  it("opens the peek phase when the window closes", () => {
    const state = makeFixture({
      grids: [gridOf(card("2", "H")), gridOf(card("3", "C")), gridOf(card("4", "D"))],
      drawPile: [card("J", "S"), card("9", "C")],
    });
    const drawn = step(state, { type: "draw" }, "p0");
    const discarded = step(drawn, { type: "discardDrawn" }, "p0");
    const after = timeout(discarded, START + 31_000);
    expect(after.step.kind).toBe("awaitPeek");
  });

  it("gives every player a peek token when it is burned", () => {
    const state = makeFixture({
      grids: [gridOf(card("J", "S")), gridOf(card("2", "H")), gridOf(card("3", "C"))],
      discardPile: [card("J", "H")],
      step: { kind: "matchWindow", rank: "J", deadlineAt: START + 30_000 },
      burnableBy: ["p0", "p1", "p2"],
    });
    const after = step(state, { type: "burn", cardIndex: 0 }, "p0");
    for (const player of after.players) expect(player.peekTokens).toBe(1);
  });

  it("grants one token per jack in a batch", () => {
    const state = makeFixture({
      grids: [
        gridOf(card("J", "S"), card("J", "H")),
        gridOf(card("J", "D")),
        gridOf(card("3", "C")),
      ],
      discardPile: [card("J", "C")],
      step: { kind: "matchWindow", rank: "J", deadlineAt: START + 30_000 },
      burnableBy: ["p0", "p1", "p2"],
    });
    let after = step(state, { type: "burn", cardIndex: 0 }, "p0");
    after = step(after, { type: "burn", cardIndex: 0 }, "p1");
    for (const player of after.players) expect(player.peekTokens).toBe(2);
  });

  it("uses the peek tokens in the peek phase", () => {
    const state = makeFixture({
      grids: [gridOf(card("J", "S"), card("2", "H")), gridOf(card("3", "C"))],
      discardPile: [card("J", "H")],
      step: { kind: "awaitPeek", deadlineAt: START + 30_000 },
      peekTokens: [2, 0],
    });
    const after = step(state, { type: "peek", cardIndex: 0 }, "p0");
    expect(after.players[0].peekTokens).toBe(1);
    expect(after.reveals).toHaveLength(1);
  });

  it("refuses to peek the same card twice in one batch", () => {
    const state = makeFixture({
      grids: [gridOf(card("J", "S"), card("2", "H")), gridOf(card("3", "C"))],
      discardPile: [card("J", "H")],
      step: { kind: "awaitPeek", deadlineAt: START + 30_000 },
      peekTokens: [2, 0],
    });
    const after = step(state, { type: "peek", cardIndex: 0 }, "p0");
    expect(expectError(act(after, { type: "peek", cardIndex: 0 }, "p0", START))).toBe(
      "ALREADY_USED",
    );
    const other = step(after, { type: "peek", cardIndex: 1 }, "p0");
    expect(other.players[0].peekTokens).toBe(0);
  });

  it("ends the peek phase when every token is spent", () => {
    const state = makeFixture({
      grids: [gridOf(card("J", "S"), card("2", "H")), gridOf(card("3", "C"))],
      drawPile: [card("9", "C")],
      discardPile: [card("J", "H")],
      step: { kind: "awaitPeek", deadlineAt: START + 30_000 },
      peekTokens: [1, 0],
    });
    const after = step(state, { type: "peek", cardIndex: 0 }, "p0");
    expect(after.step.kind).toBe("turnStart");
    expect(after.turnIndex).toBe(1);
  });

  it("expires unused peek tokens when the phase times out", () => {
    const state = makeFixture({
      grids: [gridOf(card("J", "S")), gridOf(card("3", "C"))],
      drawPile: [card("9", "C")],
      discardPile: [card("J", "H")],
      step: { kind: "awaitPeek", deadlineAt: START + 30_000 },
      peekTokens: [1, 0],
    });
    const after = timeout(state, START + 31_000);
    expect(after.step.kind).toBe("turnStart");
    expect(after.players[0].peekTokens).toBe(0);
  });
});

describe("the queen", () => {
  const queenState = (): GameState =>
    makeFixture({
      grids: [
        gridOf(card("Q", "S"), card("2", "H")),
        gridOf(card("3", "C"), card("4", "D")),
        gridOf(card("5", "S")),
      ],
      drawPile: [card("9", "C")],
      discardPile: [card("Q", "H")],
      step: { kind: "awaitQueenSwap", deadlineAt: START + 30_000, resolverId: "p0" },
      queenTokens: [1, 0, 0],
    });

  it("gives the discarding player a queen token", () => {
    const state = makeFixture({
      grids: [gridOf(card("2", "H")), gridOf(card("3", "C")), gridOf(card("4", "D"))],
      drawPile: [card("Q", "S"), card("9", "C")],
    });
    const drawn = step(state, { type: "draw" }, "p0");
    const after = step(drawn, { type: "discardDrawn" }, "p0");
    expect(after.players[0].queenTokens).toBe(1);
    expect(after.players[1].queenTokens).toBe(0);
  });

  it("swaps two cards between two players and keeps them face down", () => {
    const after = step(
      queenState(),
      { type: "queenSwap", a: { playerId: "p0", cardIndex: 0 }, b: { playerId: "p1", cardIndex: 1 } },
      "p0",
    );
    expect(after.players[0].grid[0].id).toBe("d0-D-4");
    expect(after.players[1].grid[1].id).toBe("d0-S-Q");
    expect(after.players[0].queenTokens).toBe(0);
    expect(after.reveals).toHaveLength(0);
  });

  it("refuses a swap inside one grid", () => {
    expect(
      expectError(
        act(
          queenState(),
          {
            type: "queenSwap",
            a: { playerId: "p0", cardIndex: 0 },
            b: { playerId: "p0", cardIndex: 1 },
          },
          "p0",
          START,
        ),
      ),
    ).toBe("INVALID_TARGET");
  });

  it("refuses a swap by a player without a token", () => {
    expect(
      expectError(
        act(
          queenState(),
          {
            type: "queenSwap",
            a: { playerId: "p0", cardIndex: 0 },
            b: { playerId: "p1", cardIndex: 1 },
          },
          "p1",
          START,
        ),
      ),
    ).toBe("NOT_YOUR_TURN");
  });

  it("lets the holder decline", () => {
    const after = step(queenState(), { type: "declineQueen" }, "p0");
    expect(after.players[0].queenTokens).toBe(0);
    expect(after.step.kind).toBe("turnStart");
    expect(after.turnIndex).toBe(1);
  });

  it("resolves one token at a time in seat order", () => {
    const state = makeFixture({
      grids: [gridOf(card("Q", "S")), gridOf(card("3", "C")), gridOf(card("5", "S"))],
      drawPile: [card("9", "C")],
      step: { kind: "awaitQueenSwap", deadlineAt: START + 30_000, resolverId: "p0" },
      queenTokens: [1, 1, 1],
    });
    const after = step(state, { type: "declineQueen" }, "p0");
    expect(after.step.kind).toBe("awaitQueenSwap");
    if (after.step.kind !== "awaitQueenSwap") throw new Error("unreachable");
    expect(after.step.resolverId).toBe("p1");
  });

  it("ends the phase when every token is used", () => {
    const state = makeFixture({
      grids: [gridOf(card("Q", "S")), gridOf(card("3", "C")), gridOf(card("5", "S"))],
      drawPile: [card("9", "C")],
      step: { kind: "awaitQueenSwap", deadlineAt: START + 30_000, resolverId: "p2" },
      queenTokens: [0, 0, 1],
      turnIndex: 2,
    });
    const after = step(state, { type: "declineQueen" }, "p2");
    expect(after.step.kind).toBe("turnStart");
    expect(after.turnIndex).toBe(0);
  });

  it("expires the remaining tokens when the phase times out", () => {
    const state = queenState();
    const after = timeout(state, START + 31_000);
    expect(after.step.kind).toBe("turnStart");
    expect(after.players[0].queenTokens).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* dutch call                                                          */
/* ------------------------------------------------------------------ */

describe("dutch call", () => {
  const oneCardState = (): GameState =>
    makeFixture({
      grids: [gridOf(card("5", "S")), gridOf(card("6", "H")), gridOf(card("7", "D"))],
      drawPile: [card("8", "C"), card("9", "S"), card("10", "H")],
    });

  it("is refused with more than one card left", () => {
    const state = makeFixture({
      grids: [gridOf(card("5", "S"), card("2", "H")), gridOf(card("6", "H")), gridOf(card("7", "D"))],
      drawPile: [card("8", "C")],
    });
    expect(expectError(act(state, { type: "dutchCall" }, "p0", START))).toBe("NOT_ALLOWED");
  });

  it("is refused when it is not the player's turn", () => {
    expect(expectError(act(oneCardState(), { type: "dutchCall" }, "p1", START))).toBe(
      "NOT_YOUR_TURN",
    );
  });

  it("passes the turn without drawing", () => {
    const after = step(oneCardState(), { type: "dutchCall" }, "p0");
    expect(after.dutchCallerId).toBe("p0");
    expect(after.turnIndex).toBe(1);
    expect(after.step.kind).toBe("turnStart");
    expect(after.drawPile).toHaveLength(3);
  });

  it("ends the game when the turn comes back to the caller", () => {
    let state = step(oneCardState(), { type: "dutchCall" }, "p0");
    state = step(state, { type: "draw" }, "p1");
    state = step(state, { type: "discardDrawn" }, "p1");
    state = timeout(state, START + 40_000);
    expect(state.turnIndex).toBe(2);
    state = step(state, { type: "draw" }, "p2");
    state = step(state, { type: "discardDrawn" }, "p2");
    state = timeout(state, START + 80_000);
    expect(state.phase).toBe("over");
    expect(state.step.kind).toBe("gameOver");
    expect(state.result).not.toBeNull();
  });

  it("cannot be stacked", () => {
    const state = step(oneCardState(), { type: "dutchCall" }, "p0");
    expect(expectError(act(state, { type: "dutchCall" }, "p1", START))).toBe("NOT_ALLOWED");
  });
});

/* ------------------------------------------------------------------ */
/* end conditions                                                      */
/* ------------------------------------------------------------------ */

describe("end of the game", () => {
  it("ends when a player empties their grid", () => {
    const state = makeFixture({
      grids: [gridOf(card("7", "S")), gridOf(card("2", "H")), gridOf(card("3", "C"))],
      discardPile: [card("7", "H")],
      step: { kind: "matchWindow", rank: "7", deadlineAt: START + 30_000 },
      burnableBy: ["p0", "p1", "p2"],
    });
    const after = step(state, { type: "burn", cardIndex: 0 }, "p0");
    expect(after.phase).toBe("over");
    expect(after.result?.[0].playerId).toBe("p0");
    expect(after.result?.[0].wonOutright).toBe(true);
    expect(after.result?.[0].isWinner).toBe(true);
  });

  it("finishes the final turn when the center pile runs out", () => {
    let state = makeFixture({
      grids: [gridOf(card("5", "S")), gridOf(card("6", "H")), gridOf(card("7", "D"))],
      drawPile: [card("8", "C")],
    });
    state = step(state, { type: "draw" }, "p0");
    expect(state.drawPile).toHaveLength(0);
    state = step(state, { type: "discardDrawn" }, "p0");
    expect(state.phase).toBe("playing");
    expect(state.step.kind).toBe("matchWindow");
    state = timeout(state, START + 40_000);
    expect(state.phase).toBe("over");
    expect(state.result).not.toBeNull();
  });

  it("tallies every grid at the end", () => {
    const state = makeFixture({
      grids: [gridOf(card("5", "S")), gridOf(card("K", "S")), gridOf(card("7", "D"))],
      drawPile: [card("8", "C")],
    });
    const drawn = step(state, { type: "draw" }, "p0");
    const discarded = step(drawn, { type: "discardDrawn" }, "p0");
    const over = timeout(discarded, START + 40_000);
    expect(over.result?.map((row) => row.playerId)).toEqual(["p1", "p0", "p2"]);
    expect(over.result?.find((row) => row.playerId === "p1")?.total).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* timeouts                                                            */
/* ------------------------------------------------------------------ */

describe("server enforced timeouts", () => {
  it("discards the drawn card when the choice window expires", () => {
    const state = makeFixture({
      grids: [gridOf(card("5", "S")), gridOf(card("6", "H")), gridOf(card("7", "D"))],
      drawPile: [card("9", "C")],
    });
    const drawn = step(state, { type: "draw" }, "p0");
    const after = timeout(drawn, START + 31_000);
    expect(after.discardPile.map((entry) => entry.id)).toEqual(["d0-C-9"]);
    expect(after.step.kind).toBe("matchWindow");
  });

  it("completes a pre-selected swap when the choice window expires", () => {
    const state = makeFixture({
      grids: [gridOf(card("2", "S"), card("3", "H")), gridOf(card("6", "H"))],
      drawPile: [card("9", "C")],
    });
    const drawn = step(state, { type: "draw" }, "p0");
    const selected = step(drawn, { type: "selectCard", cardIndex: 1 }, "p0");
    const after = timeout(selected, START + 31_000);
    expect(after.players[0].grid.map((entry) => entry.id)).toEqual(["d0-S-2", "d0-C-9"]);
    expect(after.discardPile.map((entry) => entry.id)).toEqual(["d0-H-3"]);
  });

  it("closes the match window when it expires", () => {
    const state = makeFixture({
      grids: [gridOf(card("5", "S")), gridOf(card("6", "H")), gridOf(card("7", "D"))],
      drawPile: [card("9", "C")],
      discardPile: [card("4", "C")],
      step: { kind: "matchWindow", rank: "4", deadlineAt: START + 30_000 },
      burnableBy: ["p0", "p1", "p2"],
    });
    const after = timeout(state, START + 31_000);
    expect(after.step.kind).toBe("turnStart");
    expect(after.turnIndex).toBe(1);
  });

  it("does nothing before the deadline", () => {
    const state = makeFixture({
      grids: [gridOf(card("5", "S")), gridOf(card("6", "H"))],
      drawPile: [card("9", "C")],
    });
    const drawn = step(state, { type: "draw" }, "p0");
    expect(applyTimeout(drawn, START + 1_000)).toBeNull();
  });
});
