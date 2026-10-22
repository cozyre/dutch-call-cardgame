import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGameServer, type GameServer } from "./app";
import { Bot, delay } from "./bots";
import type { GameState, Rank, Suit } from "../game/types";
import type { Room } from "./rooms";

/**
 * End-to-end tests over a real socket.
 *
 * These are the Phase 2 exit criteria:
 *  - several headless clients complete a full game over sockets
 *  - no client ever observes another player's card values
 *  - an idle player is auto-moved by the server
 */

let server: GameServer;
let url: string;

beforeEach(async () => {
  // The sweeper is driven by hand so the tests do not have to wait 30
  // seconds for the server-enforced deadlines.
  server = createGameServer({ autoStart: false });
  const port = await server.listen(0);
  url = `http://localhost:${port}`;
});

afterEach(async () => {
  await server.close();
});

function roomOf(code: string): Room {
  const room = server.rooms.get(code);
  if (!room) throw new Error("no such room");
  return room;
}

/**
 * Shortens the deadline of the current step so the sweeper fires at once.
 * A step is only shortened once, otherwise the deadline would be pushed
 * forward forever and the game would never move.
 */
function shortenDeadline(room: Room, shortened: Set<number>): void {
  const state = room.state;
  if (!state) return;
  const step = state.step;
  if (!("deadlineAt" in step) || typeof step.deadlineAt !== "number") return;
  if (shortened.has(step.deadlineAt)) return;
  shortened.add(step.deadlineAt);
  const soon = Date.now() + 25;
  state.step = { ...step, deadlineAt: soon };
  shortened.add(soon);
}

/** Expires the deadline of the current step right now. */
function expireDeadline(room: Room): void {
  const state = room.state;
  if (!state) return;
  const step = state.step;
  if (!("deadlineAt" in step) || typeof step.deadlineAt !== "number") return;
  state.step = { ...step, deadlineAt: Date.now() - 1 };
}

/**
 * Runs the game forward. `skipPeek` leaves the setup peek alone so the
 * bots really do peek (which is what produces reveals).
 */
async function drive(
  until: () => boolean,
  options: { timeoutMs?: number; skipPeek?: boolean; onTick?: () => void } = {},
): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  const shortened = new Set<number>();
  while (!until()) {
    if (Date.now() > deadline) throw new Error("the game did not finish in time");
    const room = [...server.rooms.all()][0];
    if (room) {
      if (!(options.skipPeek && room.state?.step.kind === "setupPeek")) {
        shortenDeadline(room, shortened);
      }
      server.sweeper.tick(Date.now());
    }
    options.onTick?.();
    await delay(2);
  }
}

async function threeBots(autoPlay = true): Promise<Bot[]> {
  const bots = ["Ada", "Grace", "Alan"].map(
    (name) => new Bot({ name, url, autoPlay }),
  );
  await Promise.all(bots.map((bot) => bot.connect()));
  return bots;
}

async function seatThree(bots: Bot[]): Promise<string> {
  const code = await bots[0].createRoom();
  await bots[1].joinRoom(code);
  await bots[2].joinRoom(code);
  await bots[0].waitFor(() => bots[0].lobby?.players.length === 3);
  return code;
}

/* ------------------------------------------------------------------ */
/* helpers for the leak test                                           */
/* ------------------------------------------------------------------ */

/** Every `rank` + `suit` pair that appears anywhere in a payload. */
function collectCardIdentities(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectCardIdentities(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.rank === "string" && typeof record.suit === "string") {
      out.push(`${record.rank}${record.suit}`);
    }
    for (const entry of Object.values(record)) collectCardIdentities(entry, out);
  }
  return out;
}

function isGameOverPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  if (record.view && typeof record.view === "object") {
    const view = record.view as Record<string, unknown>;
    return view.phase === "over";
  }
  if (record.event && typeof record.event === "object") {
    const event = record.event as Record<string, unknown>;
    return event.type === "gameOver";
  }
  return false;
}

function pair(card: { rank: Rank; suit: Suit }): string {
  return `${card.rank}${card.suit}`;
}

function allowedPairs(state: GameState, playerId: string): Set<string> {
  const allowed = new Set<string>();
  // Everything on the discard pile is public.
  for (const card of state.discardPile) allowed.add(pair(card));
  // A player may know their own cards.
  const me = state.players.find((player) => player.id === playerId);
  for (const card of me?.grid ?? []) allowed.add(pair(card));
  // The drawn card is visible to the active player only.
  if (state.step.kind === "awaitChoice" && state.turnIndex < state.players.length) {
    const active = state.players[state.turnIndex];
    if (active && active.id === playerId) allowed.add(pair(state.step.drawn));
  }
  return allowed;
}

/* ------------------------------------------------------------------ */
/* tests                                                               */
/* ------------------------------------------------------------------ */

describe("a full game over sockets", () => {
  it("lets three clients play from the lobby to the final standings", async () => {
    const bots = await threeBots();
    const code = await seatThree(bots);

    bots[0].act({ type: "startGame" });
    await bots[0].waitFor(() => bots[0].view?.phase === "playing");

    await drive(() => bots[0].view?.phase === "over");

    for (const bot of bots) {
      expect(bot.view?.phase).toBe("over");
      expect(bot.view?.result).not.toBeNull();
      expect(bot.view?.result?.length).toBe(3);
    }

    const state = roomOf(code).state;
    expect(state?.phase).toBe("over");
    expect(state?.result?.[0].isWinner).toBe(true);
    // Every card is still accounted for.
    expect(state?.result?.reduce((sum, standing) => sum + standing.cardCount, 0)).toBe(
      state?.players.reduce((sum, player) => sum + player.grid.length, 0),
    );

    for (const bot of bots) bot.close();
  });

  it("never shows one player the cards of another", async () => {
    const bots = await threeBots();
    const code = await seatThree(bots);

    // Track what each client is allowed to know, as the game moves on.
    const allowed = new Map<string, Set<string>>();
    for (const bot of bots) allowed.set(bot.name, new Set());

    bots[0].act({ type: "startGame" });
    await bots[0].waitFor(() => bots[0].view?.phase === "playing");

    await drive(
      () => bots[0].view?.phase === "over",
      {
        timeoutMs: 20_000,
        skipPeek: true,
        onTick: () => {
          // Whatever a client was allowed to see at this moment stays
          // allowed for the rest of the game.
          const state = roomOf(code).state;
          if (!state) return;
          for (const bot of bots) {
            const id = bot.view?.youId;
            if (!id) continue;
            const mine = allowed.get(bot.name) as Set<string>;
            for (const identity of allowedPairs(state, id)) mine.add(identity);
          }
        },
      },
    );

    const room = roomOf(code);
    const state = room.state;
    expect(state).toBeTruthy();
    if (!state) return;

    for (const bot of bots) {
      const mine = allowed.get(bot.name) as Set<string>;
      // Everything that was public during the game, plus the bot's own cards.
      for (const card of state.discardPile) mine.add(pair(card));
      const player = state.players.find((entry) => entry.name === bot.name);
      for (const card of player?.grid ?? []) mine.add(pair(card));

      const seen = new Set<string>();
      for (const payload of bot.raw) {
        if (isGameOverPayload(payload)) continue;
        for (const identity of collectCardIdentities(payload)) seen.add(identity);
      }

      const leaked = [...seen].filter((identity) => !mine.has(identity));
      expect(leaked, `${bot.name} saw ${leaked.join(", ")}`).toEqual([]);
    }

    for (const bot of bots) bot.close();
  });

  it("shows the drawn card to the active player only", async () => {
    const bots = await threeBots(false);
    const code = await seatThree(bots);

    bots[0].act({ type: "startGame" });
    await bots[0].waitFor(() => bots[0].view?.phase === "playing");

    // Skip the setup peek.
    const room = roomOf(code);
    expireDeadline(room);
    server.sweeper.tick(Date.now());
    await bots[0].waitFor(() => bots[0].view?.stepKind === "turnStart");

    // The active player draws.
    bots[0].act({ type: "draw" });
    await bots[0].waitFor(() => bots[0].view?.drawnCard !== null);

    const active = bots.find((bot) => bot.view?.drawnCard !== null);
    expect(active).toBeTruthy();
    for (const bot of bots) {
      if (bot === active) continue;
      expect(bot.view?.drawnCard ?? null).toBeNull();
    }

    for (const bot of bots) bot.close();
  });
});

describe("server enforcement", () => {
  it("auto-moves an idle player when the deadline passes", async () => {
    const bots = await threeBots(false);
    const code = await seatThree(bots);

    bots[0].act({ type: "startGame" });
    await bots[0].waitFor(() => bots[0].view?.phase === "playing");

    const room = roomOf(code);
    expireDeadline(room);
    server.sweeper.tick(Date.now());
    await bots[0].waitFor(() => bots[0].view?.stepKind === "turnStart");

    // The active player draws and then goes idle.
    bots[0].act({ type: "draw" });
    await bots[0].waitFor(() => bots[0].view?.stepKind === "awaitChoice");

    const state = roomOf(code).state;
    expect(state?.step.kind).toBe("awaitChoice");
    if (state?.step.kind !== "awaitChoice") return;
    // The server gives the player 30 seconds to decide.
    expect(state.step.deadlineAt - Date.now()).toBeGreaterThan(25_000);
    expect(state.step.deadlineAt - Date.now()).toBeLessThanOrEqual(30_000);

    // Nothing happens... until the deadline passes.
    const before = roomOf(code).state;
    expireDeadline(roomOf(code));
    server.sweeper.tick(Date.now());
    const after = roomOf(code).state;
    expect(after).not.toBe(before);
    expect(after?.step.kind).toBe("matchWindow");
    // The drawn card went to the discard pile, as the rules say.
    expect(after?.discardPile.length).toBe((before?.discardPile.length ?? 0) + 1);
    expect(code).toHaveLength(6);

    for (const bot of bots) bot.close();
  });

  it("rejects an action that reports a card value", async () => {
    const bots = await threeBots(false);
    const code = await seatThree(bots);

    bots[0].act({ type: "startGame" });
    await bots[0].waitFor(() => bots[0].view?.phase === "playing");
    const room = roomOf(code);
    expireDeadline(room);
    server.sweeper.tick(Date.now());
    await bots[0].waitFor(() => bots[0].view?.stepKind === "turnStart");

    const before = JSON.stringify(roomOf(code).state);

    bots[0].actRaw({ action: { type: "draw", rank: "7", value: 7 } });
    await bots[0].waitFor(() => bots[0].errors.length > 0);
    expect(bots[0].errors[0].code).toBe("INVALID_MESSAGE");
    expect(JSON.stringify(roomOf(code).state)).toBe(before);

    for (const bot of bots) bot.close();
  });

  it("returns field-level errors for impossible custom settings", async () => {
    const bots = await threeBots(false);
    const code = await seatThree(bots);

    bots[0].socket.emit("room:settings", {
      settings: { cardsPerPlayer: 20, deckCount: 1, preset: "custom" },
    });
    await bots[0].waitFor(() => bots[0].settingsErrors.length > 0);

    expect(bots[0].settingsErrors[0].field).toBe("pile");
    // The rejected settings never reach the room.
    expect(roomOf(code).settings.preset).toBe("normal");
    // Inline validation is not also reported as a generic game error.
    expect(bots[0].errors).toEqual([]);

    for (const bot of bots) bot.close();
  });

  it("rejects a move from a player whose turn it is not", async () => {
    const bots = await threeBots(false);
    const code = await seatThree(bots);

    bots[0].act({ type: "startGame" });
    await bots[0].waitFor(() => bots[0].view?.phase === "playing");
    expireDeadline(roomOf(code));
    server.sweeper.tick(Date.now());
    await bots[0].waitFor(() => bots[0].view?.stepKind === "turnStart");

    // Seat 1 tries to draw on seat 0's turn.
    bots[1].act({ type: "draw" });
    await bots[1].waitFor(() => bots[1].errors.length > 0);
    expect(bots[1].errors[0].code).toBe("NOT_YOUR_TURN");

    for (const bot of bots) bot.close();
  });
});

describe("reconnecting", () => {
  it("restores a seat from its seat token", async () => {
    const bots = await threeBots(false);
    const code = await seatThree(bots);
    const token = bots[1].seatToken;
    expect(token).toBeTruthy();

    bots[0].act({ type: "startGame" });
    await bots[0].waitFor(() => bots[0].view?.phase === "playing");

    // The player loses their connection and comes back.
    bots[1].close();
    await delay(50);
    expect(roomOf(code).players.find((player) => player.name === "Grace")?.connected).toBe(false);

    const returning = new Bot({ name: "Grace", url, autoPlay: false });
    await returning.connect();
    await returning.resume(code, token as string);
    await returning.waitFor(() => returning.view !== null);

    expect(returning.view?.phase).toBe("playing");
    expect(roomOf(code).players.find((player) => player.name === "Grace")?.connected).toBe(true);

    returning.close();
    for (const bot of bots) bot.close();
  });

  it("forfeits the seat of a player who leaves the table", async () => {
    const bots = await threeBots(false);
    const code = await seatThree(bots);

    bots[1].leave();
    await delay(50);

    expect(roomOf(code).players.map((player) => player.name)).toEqual(["Ada", "Alan"]);

    for (const bot of bots) bot.close();
  });

  it("forfeits a seat when the reconnect grace period runs out", async () => {
    const bots = await threeBots(false);
    const code = await seatThree(bots);

    bots[1].close();
    await delay(50);

    const room = roomOf(code);
    const grace = room.players.find((player) => player.name === "Grace");
    expect(grace?.connected).toBe(false);

    // Pretend the grace period has passed.
    if (grace && grace.disconnectedAt !== null) {
      grace.disconnectedAt = Date.now() - 61_000;
    }
    server.sweeper.tick(Date.now());

    expect(roomOf(code).players.map((player) => player.name)).toEqual(["Ada", "Alan"]);

    for (const bot of bots) bot.close();
  });
});
