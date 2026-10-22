import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGameServer, type GameServer } from "../../server/app";
import type { GameView } from "../../game/types";
import { SocketGameClient } from "./socket-client";

/**
 * Exercises the browser transport against the real server: create, join,
 * settings, start, live views and resume. The Phase 3 exit path, minus the
 * rendering.
 */

let server: GameServer;
let url: string;
const clients: SocketGameClient[] = [];

beforeEach(async () => {
  server = createGameServer({ autoStart: false });
  const port = await server.listen(0);
  url = `http://localhost:${port}`;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await server.close();
});

function client(): SocketGameClient {
  const created = new SocketGameClient(url);
  clients.push(created);
  return created;
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for a condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("SocketGameClient", () => {
  it("creates, joins, configures and starts a room", async () => {
    const host = client();
    const created = await host.createRoom("Ada");
    expect(created.code).toHaveLength(6);
    await waitFor(() => host.getCachedLobby()?.players.length === 1);

    const guest = client();
    const joined = await guest.joinRoom(created.code, "Grace");
    expect(joined.code).toBe(created.code);
    await waitFor(() => host.getCachedLobby()?.players.length === 2);

    const third = client();
    await third.joinRoom(created.code, "Alan");
    await waitFor(() => host.getCachedLobby()?.players.length === 3);

    // Hosts configure, guests do not, and every viewer sees their own seat.
    expect(host.getCachedLobby()?.canConfigure).toBe(true);
    expect(guest.getCachedLobby()?.canConfigure).toBe(false);
    expect(host.getCachedLobby()?.canStart).toBe(true);
    expect(host.getCachedLobby()?.youId).toBe(host.getCachedLobby()?.hostId);
    expect(guest.getCachedLobby()?.youId).not.toBe(
      guest.getCachedLobby()?.hostId,
    );
    expect(guest.getCachedLobby()?.youId).not.toBeNull();

    host.updateSettings({ cardsPerPlayer: 8, deckCount: 2, preset: "tricky" });
    await waitFor(() => guest.getCachedLobby()?.settings.preset === "tricky");

    const hostViews: GameView[] = [];
    host.onView((view) => {
      hostViews.push(view);
    });
    host.send({ type: "startGame" });
    await waitFor(() => hostViews[0]?.phase === "playing");

    expect(hostViews[0]?.stepKind).toBe("setupPeek");
    expect(hostViews[0]?.myGrid.length).toBe(8);
    // The guest sees the same roster, but only their own grid slots.
    await waitFor(() => guest.getCachedView()?.phase === "playing");
    expect(guest.getCachedView()?.myGrid.length).toBe(8);
    expect(guest.getCachedView()?.players.length).toBe(3);
  });

  it("surfaces field-level settings errors for the host", async () => {
    const host = client();
    const created = await host.createRoom("Ada");
    await client().joinRoom(created.code, "Grace");
    await client().joinRoom(created.code, "Alan");
    await waitFor(() => host.getCachedLobby()?.players.length === 3);

    let errors: { field: string }[] = [];
    host.onSettingsError((next) => {
      errors = next;
    });
    host.updateSettings({ cardsPerPlayer: 20, deckCount: 1, preset: "custom" });
    await waitFor(() => errors.length > 0);
    expect(errors[0].field).toBe("pile");
  });

  it("resumes a seat after a dropped connection", async () => {
    const host = client();
    const created = await host.createRoom("Ada");
    await waitFor(() => host.getCachedLobby()?.players.length === 1);

    host.disconnect();
    await waitFor(() => host.getCachedLobby() !== null);

    const returning = client();
    const resumed = await returning.resumeRoom(created.code, created.seatToken);
    expect(resumed.code).toBe(created.code);
    await waitFor(() => returning.getCachedLobby()?.players.length === 1);
    expect(returning.getCachedLobby()?.players[0].connected).toBe(true);
  });
});
