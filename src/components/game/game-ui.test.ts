import { describe, expect, it } from "vitest";
import { projectView } from "@/game/view";
import {
  boardHeadline,
  canPickQueenTarget,
  cardName,
  describeGameEvent,
  desktopOwnGridSpec,
  formatClock,
  gridColumns,
  isRevealDisplayed,
  isSameSlot,
  matchBannerBody,
  mobileOwnGridSpec,
  opponentGridSpec,
  rankArticle,
  rankLabel,
  seatStatus,
  wrongBurnCopy,
} from "./game-ui";
import { card, makeFixture } from "@/game/testkit";

const START = 1_000;

function viewFor(setup: {
  step?: Parameters<typeof makeFixture>[0]["step"];
  grids?: Parameters<typeof makeFixture>[0]["grids"];
  burnableBy?: string[];
  disconnected?: boolean;
  turnIndex?: number;
}) {
  const state = makeFixture({
    grids: setup.grids ?? [[card("5", "S"), card("6", "H")], [card("7", "D"), card("8", "C")], [card("9", "S")]],
    step: setup.step ?? { kind: "turnStart" },
    turnIndex: setup.turnIndex ?? 0,
    burnableBy: setup.burnableBy ?? [],
  });
  if (setup.disconnected) {
    state.players[1].connected = false;
    state.players[1].disconnectedAt = START - 18_000;
  }
  return projectView(state, "p0", START);
}

describe("formatClock", () => {
  it("formats m:ss", () => {
    expect(formatClock(24_000)).toBe("0:24");
    expect(formatClock(60_000)).toBe("1:00");
    expect(formatClock(61_500)).toBe("1:02");
  });

  it("rounds up so a running countdown never shows 0:00 early", () => {
    expect(formatClock(1)).toBe("0:01");
    expect(formatClock(23_001)).toBe("0:24");
  });

  it("clamps to zero — never a negative clock", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-4_000)).toBe("0:00");
  });
});

describe("grid layout", () => {
  it("keeps columns within 4 rows × 5 columns", () => {
    for (let count = 1; count <= 20; count++) {
      const columns = gridColumns(count);
      const rows = Math.ceil(count / columns);
      expect(columns).toBeLessThanOrEqual(5);
      expect(rows).toBeLessThanOrEqual(4);
      expect(columns * rows).toBeGreaterThanOrEqual(count);
    }
  });

  it("mobile: ≤ 6 cards use L in 3 columns, 7+ use M in 4–5", () => {
    expect(mobileOwnGridSpec(6)).toEqual({ size: "L", columns: 3 });
    expect(mobileOwnGridSpec(7)).toEqual({ size: "M", columns: 4 });
    expect(mobileOwnGridSpec(9)).toEqual({ size: "M", columns: 5 });
    expect(mobileOwnGridSpec(12)).toEqual({ size: "M", columns: 4 });
    expect(mobileOwnGridSpec(20)).toEqual({ size: "M", columns: 5 });
  });

  it("desktop: the player's grid is a row of L cards", () => {
    expect(desktopOwnGridSpec(6)).toEqual({ size: "L", columns: 6 });
    expect(desktopOwnGridSpec(1)).toEqual({ size: "L", columns: 1 });
    expect(desktopOwnGridSpec(12)).toEqual({ size: "L", columns: 6 });
  });

  it("opponents use S cards", () => {
    expect(opponentGridSpec(6)).toEqual({ size: "S", columns: 3 });
    expect(opponentGridSpec(9)).toEqual({ size: "S", columns: 3 });
  });
});

describe("card names", () => {
  it("names cards the way the design copy does", () => {
    expect(cardName("9", "H")).toBe("9 of hearts");
    expect(cardName("K", "S")).toBe("King of spades");
    expect(rankLabel("J")).toBe("Jack");
    expect(rankArticle("7")).toBe("a 7");
    expect(rankArticle("A")).toBe("a Ace");
  });
});

describe("queen target validation", () => {
  const a = { playerId: "p0", cardIndex: 0 };

  it("accepts any two distinct slots, including two slots of one grid", () => {
    expect(canPickQueenTarget(null, a)).toBe(true);
    expect(canPickQueenTarget(a, { playerId: "p0", cardIndex: 1 })).toBe(true);
    expect(canPickQueenTarget(a, { playerId: "p1", cardIndex: 0 })).toBe(true);
  });

  it("rejects the same slot twice", () => {
    expect(canPickQueenTarget(a, a)).toBe(false);
    expect(isSameSlot(a, { playerId: "p0", cardIndex: 0 })).toBe(true);
    expect(isSameSlot(a, { playerId: "p1", cardIndex: 0 })).toBe(false);
  });
});

describe("seat status copy", () => {
  it("counts cards", () => {
    const view = viewFor({});
    expect(seatStatus(view, view.players[1], START + 1_000)).toBe("2 cards");
  });

  it("counts a single card", () => {
    const view = viewFor({ grids: [[card("5", "S")], [card("6", "H")], [card("9", "S")]] });
    expect(seatStatus(view, view.players[2], START)).toBe("1 card");
  });

  it("shows the active player's countdown", () => {
    const state = makeFixture({
      grids: [[card("5", "S")], [card("6", "H")], [card("9", "S")]],
      step: { kind: "awaitChoice", drawn: card("7", "D"), deadlineAt: START + 24_000, selectedIndex: null },
    });
    const view = projectView(state, "p0", START);
    expect(seatStatus(view, view.players[0], START)).toBe("Their turn · 0:24");
  });

  it("shows the reconnect countdown against the 60 s grace window", () => {
    const view = viewFor({ disconnected: true });
    expect(seatStatus(view, view.players[1], START)).toBe("Reconnecting 0:42");
    expect(seatStatus(view, view.players[1], START + 18_000)).toBe("Reconnecting 0:24");
    // the countdown never goes negative
    expect(seatStatus(view, view.players[1], START + 999_000)).toBe("Reconnecting 0:00");
  });
});

describe("headline copy", () => {
  it("marks my turn", () => {
    expect(boardHeadline(viewFor({}))).toBe("Your turn");
  });

  it("names the choosing player", () => {
    const state = makeFixture({
      grids: [[card("5", "S")], [card("6", "H")], [card("9", "S")]],
      step: { kind: "awaitChoice", drawn: card("7", "D"), deadlineAt: START + 30_000, selectedIndex: null },
      turnIndex: 1,
    });
    expect(boardHeadline(projectView(state, "p0", START))).toBe("Player 2 is choosing");
  });

  it("labels the match window", () => {
    expect(boardHeadline(viewFor({ step: { kind: "matchWindow", rank: "4", deadlineAt: START + 30_000 } }))).toBe(
      "Match window",
    );
  });
});

describe("event copy", () => {
  const players = viewFor({}).players;

  it("names the rank of a correct burn", () => {
    expect(
      describeGameEvent({ type: "burned", playerId: "p1", rank: "5", correct: true }, { players }),
    ).toBe("Player 2 matched a 5 and discarded it");
  });

  it("never names the rank of a wrong burn", () => {
    const copy = describeGameEvent(
      { type: "burned", playerId: "p1", rank: null, correct: false },
      { players },
    );
    expect(copy).toBe("Player 2 burned the wrong card");
    expect(copy).not.toContain("5");
  });

  it("describes discards and draws", () => {
    expect(describeGameEvent({ type: "cardDiscarded", playerId: "p0", rank: "5", suit: "S" }, { players })).toBe(
      "Player 1 discarded a 5",
    );
    expect(describeGameEvent({ type: "cardDrawn", playerId: "p0" }, { players })).toBe("Player 1 drew a card");
    expect(describeGameEvent({ type: "dutchCalled", playerId: "p0" }, { players })).toBe("Player 1 called Dutch");
    expect(describeGameEvent({ type: "queenSwapped", a: { playerId: "p0", cardIndex: 0 }, b: { playerId: "p1", cardIndex: 0 } }, { players })).toBe(
      "Player 1 swapped two cards",
    );
  });

  it("returns null for silent events", () => {
    expect(describeGameEvent({ type: "turnPassed", playerId: "p0" }, { players })).toBeNull();
  });
});

describe("match banner copy", () => {
  it("addresses the active player", () => {
    const view = viewFor({ step: { kind: "matchWindow", rank: "7", deadlineAt: START + 30_000 }, burnableBy: ["p0", "p1"] });
    expect(matchBannerBody(view, "Player 1", "7")).toBe(
      "You discarded a 7. Tap a card of the same rank to burn it, or wait for the timer.",
    );
  });

  it("addresses everyone else", () => {
    const view = viewFor({ step: { kind: "matchWindow", rank: "7", deadlineAt: START + 30_000 }, burnableBy: ["p0", "p1"], turnIndex: 1 });
    expect(matchBannerBody(view, "Player 2", "7")).toBe(
      "Player 2 discarded a 7. Everyone can tap a card they think is a 7 until the timer ends.",
    );
  });
});

describe("wrong burn copy", () => {
  it("matches the design sentence and never includes a rank", () => {
    expect(wrongBurnCopy()).toBe("Wrong guess — penalty card added");
  });
});

describe("reveal display window", () => {
  const until = START + 8_000; // the server's REVEAL_MS window (plan A5)

  it("shows the face for roughly the first 3 s of the window", () => {
    expect(isRevealDisplayed(until, START)).toBe(true);
    expect(isRevealDisplayed(until, START + 2_999)).toBe(true);
    expect(isRevealDisplayed(until, START + 3_001)).toBe(false);
  });

  it("never displays the face past the server window", () => {
    expect(isRevealDisplayed(until, until - 1)).toBe(false);
    expect(isRevealDisplayed(until, until)).toBe(false);
    expect(isRevealDisplayed(until, until + 10_000)).toBe(false);
  });
});
