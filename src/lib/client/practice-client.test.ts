import { describe, expect, it } from "vitest";
import type { Action } from "@/game/types";
import { LocalGameClient } from "./local-client";
import { getPracticeGameClient } from "./practice-client";

/**
 * Practice mode (the plan §13 exception) rides on the same in-process
 * client as the `?local=1` dev harness, but opened as a product entry:
 * it must open into the lobby (autoStart off) with the three bots seated,
 * deal on Start, and loop through the Phase 5 rematch contract.
 */

/** A scripted human seat that plays legal moves from its view only. */
function playUntilOver(client: LocalGameClient, bumpClock: () => void): void {
  let view = client.getCachedView();
  let swaps = 0;
  for (let step = 0; step < 2_000; step++) {
    if (!view) break;
    if (view.phase === "over") break;

    let action: Action | null = null;
    const mine = view.turnPlayerId === view.youId;
    switch (view.stepKind) {
      case "setupPeek":
      case "awaitPeek": {
        if (view.myPeekTokens > 0) {
          const slot = view.myGrid.find((entry) => entry.revealed === null);
          if (slot) action = { type: "peek", cardIndex: slot.index };
        }
        break;
      }
      case "turnStart": {
        if (mine && view.canDraw) action = { type: "draw" };
        break;
      }
      case "awaitChoice": {
        if (mine) {
          // Alternate swap and discard so both paths are exercised.
          if (view.canSwapDrawn && swaps % 2 === 0) {
            swaps += 1;
            action = { type: "swapDrawn", cardIndex: swaps % Math.max(1, view.myGrid.length) };
          } else if (view.canDiscardDrawn) {
            action = { type: "discardDrawn" };
          }
        }
        break;
      }
      case "matchWindow": {
        const windowRank = view.matchWindow?.rank ?? null;
        if (view.canBurn && windowRank !== null) {
          const target = view.myGrid.find(
            (entry) => entry.revealed?.rank === windowRank,
          );
          if (target) action = { type: "burn", cardIndex: target.index };
        }
        break;
      }
      case "awaitQueenSwap": {
        if (view.queenResolverId === view.youId) action = { type: "declineQueen" };
        break;
      }
      default:
        break;
    }

    if (action) {
      client.send(action);
    } else {
      // Nothing to do: let the server-side timeouts run.
      bumpClock();
      client.sweep();
    }
    const next = client.getCachedView();
    if (next === view) {
      // No progress (e.g. waiting for the deadline): force the sweeper.
      bumpClock();
      client.sweep();
    }
    view = client.getCachedView();
  }
}

describe("practice client", () => {
  it("is one tab-scoped client that opens in the lobby, not mid-game", () => {
    const client = getPracticeGameClient();
    expect(getPracticeGameClient()).toBe(client);

    void client.createRoom("Tester");
    const lobby = client.getCachedLobby();
    expect(lobby?.players.map((player) => player.name)).toEqual([
      "Tester",
      "Maya",
      "Jonas",
      "Priya",
    ]);
    // A fresh client never auto-deals: practice always shows the lobby
    // first so settings can be chosen.
    expect(client.getCachedView()?.phase).toBe("lobby");
    client.leaveRoom();
    expect(client.getCachedLobby()).toBeNull();
  });

  it("deals on Start and re-deals through the rematch contract", () => {
    let clock = 1_000_000;
    const client = new LocalGameClient({
      seed: 11,
      autoStart: false,
      now: () => clock,
    });
    client.connect();
    void client.createRoom("Tester");

    const lobby = client.getCachedLobby();
    expect(lobby?.players).toHaveLength(4);
    expect(lobby?.canStart).toBe(true);
    // You host the practice table — Start is yours.
    expect(lobby?.youId).toBe("you");
    expect(lobby?.hostId).toBe("you");

    client.send({ type: "startGame" });
    expect(client.getCachedView()?.phase).toBe("playing");

    playUntilOver(client, () => {
      clock += 31_000;
    });
    const over = client.getCachedView();
    expect(over?.phase).toBe("over");
    expect(over?.result).not.toBeNull();

    // Phase 5 contract: rematch reuses the seats and deals a fresh game.
    client.rematch();
    const again = client.getCachedView();
    expect(again?.phase).toBe("playing");
    expect(again?.players).toHaveLength(4);
    expect(again?.myGrid.length).toBeGreaterThan(0);

    // The loop keeps working: a second full game completes too.
    playUntilOver(client, () => {
      clock += 31_000;
    });
    expect(client.getCachedView()?.phase).toBe("over");
    client.disconnect();
  });
});
