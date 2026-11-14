import { describe, expect, it } from "vitest";
import type { Action, GameEvent, GameView } from "@/game/types";
import { LocalGameClient } from "./local-client";

/**
 * The dev client must behave like the real transport: full games driven by
 * the pure engine, opponents acting only from their own projections, a view
 * that never leaks a card identity, and a rematch that re-deals a finished
 * game (plan §10).
 */

interface Clock {
  now: number;
}

/** A scripted human seat that plays legal moves from its view only. */
function planAction(view: GameView, swaps: { n: number }): Action | null {
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
        // alternate swap and discard so both paths are exercised
        if (view.canSwapDrawn && swaps.n % 2 === 0) {
          swaps.n += 1;
          action = { type: "swapDrawn", cardIndex: swaps.n % Math.max(1, view.myGrid.length) };
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
  return action;
}

/**
 * Drives a connected client's human seat until the game is over. The clock
 * holder is shared with the caller so it can keep playing after this
 * returns (the rematch tests do).
 */
function driveToOver(client: LocalGameClient, clock: Clock): GameView[] {
  const views: GameView[] = [];
  // resumeRoom broadcasts synchronously; seed the loop with the latest view.
  let view = client.getCachedView();
  const swaps = { n: 0 };

  for (let step = 0; step < 2_000; step++) {
    if (!view) break;
    if (view.phase === "over") break;
    views.push(view);

    const action = planAction(view, swaps);
    if (action) {
      client.send(action);
    } else {
      // Nothing to do: let the server-side timeouts run.
      clock.now += 31_000;
      client.sweep();
    }
    const next = client.getCachedView();
    if (next === view) {
      // No progress (e.g. waiting for the deadline): force the sweeper.
      clock.now += 31_000;
      client.sweep();
    }
    view = client.getCachedView();
  }

  const finalView = client.getCachedView();
  expect(finalView?.phase).toBe("over");
  return views;
}

function playFullGame(seed: number): {
  views: GameView[];
  events: GameEvent[];
} {
  const clock: Clock = { now: 1_000_000 };
  const client = new LocalGameClient({
    seed,
    autoStart: true,
    now: () => clock.now,
  });
  const views: GameView[] = [];
  const events: GameEvent[] = [];
  client.connect();
  client.onView((view) => views.push(view));
  client.onEvent((event) => events.push(event));

  void client.resumeRoom("DEV01", "local-dev-seat");
  // Every broadcast reaches the subscription, including the final over view.
  driveToOver(client, clock);

  client.disconnect();
  return { views, events };
}

describe("LocalGameClient", () => {
  it("plays several full games against the simulated opponents", () => {
    for (const seed of [11, 4242, 98765]) {
      const { views } = playFullGame(seed);
      expect(views.length).toBeGreaterThan(0);
      const final = views[views.length - 1];
      expect(final.phase).toBe("over");
      expect(final.result).not.toBeNull();
      expect(final.result?.map((standing) => standing.name)).toHaveLength(4);
    }
  });

  it("never leaks a card identity through any view", () => {
    for (const seed of [11, 4242, 98765]) {
      const { views } = playFullGame(seed);
      for (const view of views) {
        const serialized = JSON.stringify(view);
        // No card ids ever reach the client — not for the player's own
        // grid, not for opponents, not for piles. (Player ids are public
        // by design: turnPlayerId, queenResolverId, dutchCallerId.)
        expect(serialized).not.toContain("d0-");
        expect(serialized).not.toContain('"deck"');
        expect(serialized).not.toContain('"cardId"');
      }
    }
  });

  it("reports the approved Phase 4 view fields", () => {
    const now = 5_000_000;
    const client = new LocalGameClient({ seed: 7, now: () => now });
    client.connect();
    void client.resumeRoom("DEV02", "local-dev-seat");
    const view = client.getCachedView();
    expect(view).not.toBeNull();
    expect(view?.serverNow).toBe(5_000_000);
    expect(typeof view?.discardPileCount).toBe("number");
    for (const player of view?.players ?? []) {
      expect(player.disconnectedAt).toBeNull();
    }
    client.disconnect();
  });

  it("rejects out-of-range settings in the lobby with field errors", () => {
    const now = 5_000_000;
    const client = new LocalGameClient({ seed: 7, now: () => now, autoStart: false });
    client.connect();
    void client.createRoom("Tester", { cardsPerPlayer: 6, deckCount: 1, preset: "normal" });

    const seen: unknown[] = [];
    client.onSettingsError((errors) => seen.push(errors));
    client.updateSettings({ cardsPerPlayer: 21, deckCount: 1, preset: "custom" });
    expect(seen).toHaveLength(1);

    // A valid update passes and lands in the lobby projection.
    client.updateSettings({ cardsPerPlayer: 8, deckCount: 2, preset: "custom" });
    expect(client.getCachedLobby()?.settings).toEqual({
      cardsPerPlayer: 8,
      deckCount: 2,
      preset: "custom",
    });
    client.disconnect();
  });

  it("reports stale actions as errors instead of applying them", () => {
    const now = 5_000_000;
    const client = new LocalGameClient({ seed: 7, now: () => now, autoStart: false });
    client.connect();
    void client.createRoom("Tester");

    const errors: string[] = [];
    client.onError((error) => errors.push(error.code));
    // There is no game running: a game action must be refused.
    client.send({ type: "draw" });
    expect(errors).toContain("WRONG_PHASE");
    client.disconnect();
  });

  it("rematch re-deals a finished game with the same seats, settings and a fresh deal", () => {
    const clock: Clock = { now: 1_000_000 };
    const client = new LocalGameClient({
      seed: 555,
      autoStart: true,
      now: () => clock.now,
    });
    client.connect();
    const events: GameEvent[] = [];
    client.onEvent((event) => events.push(event));

    void client.resumeRoom("DEV05", "local-dev-seat");
    driveToOver(client, clock);
    expect(client.getCachedView()?.phase).toBe("over");

    // Snapshot the room the way the UI sees it: seats and settings must
    // survive the re-deal (plan §10: same players, new deal).
    const lobbyBefore = client.getCachedLobby();
    expect(lobbyBefore).not.toBeNull();
    const seatsBefore = lobbyBefore?.players.map(
      (player) => `${player.id}:${player.name}:${player.seat}:${player.isHost}`,
    );
    const settingsBefore = lobbyBefore?.settings;

    // The first public discard depends on the shuffle: if the rematch
    // reused the previous game's seed it would be identical.
    const firstDiscard = (list: GameEvent[]) =>
      list.find((event) => event.type === "cardDiscarded");
    const discardGame1 = firstDiscard(events);
    expect(discardGame1).toBeDefined();

    const eventsAfterGame1 = events.length;
    client.rematch();

    const view = client.getCachedView();
    expect(view?.phase).toBe("playing");
    expect(view?.result).toBeNull();
    // Card counts reset to the room's settings (6 cards per player here).
    for (const player of view?.players ?? []) {
      expect(player.cardCount).toBe(6);
    }

    // The fresh game announces itself and lands in the lobby projection.
    expect(events[eventsAfterGame1]).toMatchObject({ type: "gameStarted" });
    expect(client.getCachedLobby()?.players.map(
      (player) => `${player.id}:${player.name}:${player.seat}:${player.isHost}`,
    )).toEqual(seatsBefore);
    expect(client.getCachedLobby()?.settings).toEqual(settingsBefore);

    // Bot memory reset: each bot's first peek of a fresh game targets its
    // opening slot again. (A retained peeked set would push it to slot 1.)
    const botPeeks = events
      .slice(eventsAfterGame1 + 1)
      .filter((event) => event.type === "peeked" && event.playerId.startsWith("bot-"));
    expect(botPeeks.length).toBeGreaterThan(0);
    expect(botPeeks[0]).toMatchObject({ type: "peeked", cardIndex: 0 });

    // A fresh seed deals a different game: the first public discard of the
    // rematch differs from game 1's (deterministic for these seeds).
    driveToOver(client, clock);
    const discardGame2 = firstDiscard(events.slice(eventsAfterGame1 + 1));
    expect(discardGame2).toBeDefined();
    if (discardGame1?.type === "cardDiscarded" && discardGame2?.type === "cardDiscarded") {
      expect(
        `${discardGame2.rank}${discardGame2.suit}`,
      ).not.toBe(`${discardGame1.rank}${discardGame1.suit}`);
    }
    client.disconnect();
  });

  it("rematch is refused while the game is still in play", () => {
    const now = 5_000_000;
    const client = new LocalGameClient({ seed: 7, now: () => now });
    client.connect();
    void client.resumeRoom("DEV06", "local-dev-seat");
    const viewBefore = JSON.stringify(client.getCachedView());
    const lobbyBefore = JSON.stringify(client.getCachedLobby());

    const errors: { code: string; message: string }[] = [];
    client.onError((error) => errors.push(error));
    client.rematch();

    expect(errors).toEqual([
      { code: "WRONG_PHASE", message: "The current game is still in play." },
    ]);
    // Untouched: no re-deal, no new events, the board stays where it was.
    expect(JSON.stringify(client.getCachedView())).toBe(viewBefore);
    expect(JSON.stringify(client.getCachedLobby())).toBe(lobbyBefore);
    client.disconnect();
  });

  it("rematch is refused when there is no room at all", () => {
    const now = 5_000_000;
    const client = new LocalGameClient({ seed: 7, now: () => now, autoStart: false });
    client.connect();
    const errors: string[] = [];
    client.onError((error) => errors.push(error.code));
    client.rematch();
    expect(errors).toEqual(["WRONG_PHASE"]);
    client.disconnect();
  });
});
