import { describe, expect, it } from "vitest";
import { RoomManager } from "./rooms";
import { SeatTokenService } from "./session";
import { allCardIds } from "../game/engine";
import { settingsForPreset } from "../game/difficulty";

function manager(): RoomManager {
  return new RoomManager(new SeatTokenService("test-secret"));
}

function fill(room: RoomManager, code: string, names: string[]): string[] {
  const ids: string[] = [];
  for (const name of names) {
    const joined = room.joinRoom(code, name);
    if (!joined.ok) throw new Error(`join failed: ${joined.error.message}`);
    ids.push(joined.value.playerId);
  }
  return ids;
}

describe("creating a room", () => {
  it("gives the host a six character code without ambiguous characters", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(created.value.code).not.toMatch(/[IO01]/);
  });

  it("never hands out the same code twice", () => {
    const rooms = manager();
    const codes = new Set<string>();
    for (let index = 0; index < 50; index++) {
      const created = rooms.createRoom(`Player ${index}`);
      if (!created.ok) throw new Error("create failed");
      codes.add(created.value.code);
    }
    expect(codes.size).toBe(50);
  });

  it("seats the host first and marks them as the host", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const view = rooms.lobbyView(created.value.code, created.value.playerId);
    expect(view?.players).toHaveLength(1);
    expect(view?.players[0]).toMatchObject({ name: "Ada", seat: 0, isHost: true });
    expect(view?.canStart).toBe(false);
    expect(view?.canConfigure).toBe(true);
    expect(view?.youId).toBe(created.value.playerId);
  });

  it("does not attribute a viewer when the lobby is anonymous", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const view = rooms.lobbyView(created.value.code);
    expect(view?.youId).toBeNull();
  });

  it("uses the default settings when none are given", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    expect(rooms.get(created.value.code)?.settings).toEqual(settingsForPreset("normal"));
  });
});

describe("joining a room", () => {
  it("seats players in join order", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const ids = fill(rooms, created.value.code, ["Grace", "Alan"]);
    const view = rooms.lobbyView(created.value.code);
    expect(view?.players.map((player) => player.name)).toEqual(["Ada", "Grace", "Alan"]);
    expect(view?.players.map((player) => player.seat)).toEqual([0, 1, 2]);
    expect(view?.canStart).toBe(true);
    expect(ids).toHaveLength(2);
  });

  it("rejects a duplicate name", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const joined = rooms.joinRoom(created.value.code, "ada");
    expect(joined.ok).toBe(false);
    if (joined.ok) return;
    expect(joined.error.code).toBe("NAME_TAKEN");
  });

  it("rejects a seventh player", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    fill(rooms, created.value.code, ["B", "C", "D", "E", "F"]);
    const joined = rooms.joinRoom(created.value.code, "G");
    expect(joined.ok).toBe(false);
    if (joined.ok) return;
    expect(joined.error.code).toBe("ROOM_FULL");
  });

  it("rejects an unknown room", () => {
    const rooms = manager();
    const joined = rooms.joinRoom("ZZZZZZ", "Ada");
    expect(joined.ok).toBe(false);
    if (joined.ok) return;
    expect(joined.error.code).toBe("ROOM_NOT_FOUND");
  });
});

describe("resuming a seat", () => {
  it("accepts a valid seat token", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const resumed = rooms.resumeSeat(created.value.code, created.value.seatToken);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.value.playerId).toBe(created.value.playerId);
  });

  it("rejects a tampered seat token", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const tampered = `${created.value.seatToken.slice(0, -2)}xx`;
    const resumed = rooms.resumeSeat(created.value.code, tampered);
    expect(resumed.ok).toBe(false);
    if (resumed.ok) return;
    expect(resumed.error.code).toBe("INVALID_SEAT_TOKEN");
  });

  it("rejects a seat token from another room", () => {
    const rooms = manager();
    const first = rooms.createRoom("Ada");
    const second = rooms.createRoom("Grace");
    if (!first.ok || !second.ok) throw new Error("create failed");
    const resumed = rooms.resumeSeat(second.value.code, first.value.seatToken);
    expect(resumed.ok).toBe(false);
  });
});

describe("settings", () => {
  it("lets the host change the settings", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const updated = rooms.updateSettings(created.value.code, created.value.playerId, {
      cardsPerPlayer: 8,
      deckCount: 2,
      preset: "custom",
    });
    expect(updated.ok).toBe(true);
    expect(rooms.get(created.value.code)?.settings).toEqual({
      cardsPerPlayer: 8,
      deckCount: 2,
      preset: "custom",
    });
  });

  it("refuses a non-host", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const [playerId] = fill(rooms, created.value.code, ["Grace"]);
    const updated = rooms.updateSettings(created.value.code, playerId, {
      cardsPerPlayer: 8,
      deckCount: 2,
      preset: "custom",
    });
    expect(updated.ok).toBe(false);
    if (updated.ok) return;
    expect(updated.error.code).toBe("NOT_ALLOWED");
  });

  it("rejects settings that leave the center pile empty", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    fill(rooms, created.value.code, ["Grace", "Alan"]);
    const updated = rooms.updateSettings(created.value.code, created.value.playerId, {
      cardsPerPlayer: 20,
      deckCount: 1,
      preset: "custom",
    });
    expect(updated.ok).toBe(false);
    if (updated.ok) return;
    expect(updated.error.code).toBe("INVALID_SETTINGS");
  });

  it("canonicalises a preset, whatever numbers the client sends", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    rooms.updateSettings(created.value.code, created.value.playerId, {
      cardsPerPlayer: 99,
      deckCount: 3,
      preset: "easy",
    });
    expect(rooms.get(created.value.code)?.settings).toEqual(settingsForPreset("easy"));
  });
});

describe("starting a game", () => {
  it("needs three players", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const started = rooms.startGame(created.value.code, created.value.playerId, 1000);
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.error.code).toBe("NOT_ENOUGH_PLAYERS");
  });

  it("is the host's privilege alone", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const [playerId] = fill(rooms, created.value.code, ["Grace", "Alan"]);
    const started = rooms.startGame(created.value.code, playerId, 1000);
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.error.code).toBe("NOT_ALLOWED");
  });

  it("deals every player and keeps every card in the game", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    fill(rooms, created.value.code, ["Grace", "Alan"]);
    const started = rooms.startGame(created.value.code, created.value.playerId, 1000);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const state = started.value;
    expect(state.phase).toBe("playing");
    expect(state.step.kind).toBe("setupPeek");
    for (const player of state.players) {
      expect(player.grid).toHaveLength(state.settings.cardsPerPlayer);
      expect(player.peekTokens).toBe(1);
    }
    const ids = allCardIds(state);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(52 * state.settings.deckCount);
  });

  it("cannot be started twice", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    fill(rooms, created.value.code, ["Grace", "Alan"]);
    rooms.startGame(created.value.code, created.value.playerId, 1000);
    const again = rooms.startGame(created.value.code, created.value.playerId, 2000);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("ROOM_STARTED");
  });
});

describe("forfeiting a seat", () => {
  it("removes the player from the lobby", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const [playerId] = fill(rooms, created.value.code, ["Grace"]);
    rooms.forfeit(created.value.code, playerId);
    const view = rooms.lobbyView(created.value.code);
    expect(view?.players.map((player) => player.name)).toEqual(["Ada"]);
  });

  it("hands the host seat to the next player", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    fill(rooms, created.value.code, ["Grace", "Alan"]);
    rooms.forfeit(created.value.code, created.value.playerId);
    const view = rooms.lobbyView(created.value.code);
    expect(view?.players[0]).toMatchObject({ name: "Grace", isHost: true });
  });

  it("frees the game seat once the step allows it", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const [playerId] = fill(rooms, created.value.code, ["Grace", "Alan"]);
    const started = rooms.startGame(created.value.code, created.value.playerId, 1000);
    if (!started.ok) throw new Error("start failed");
    const room = rooms.get(created.value.code);
    if (!room || !room.state) throw new Error("no room");

    // The setup peek is a step boundary, so the seat frees right away.
    rooms.forfeit(created.value.code, playerId);
    expect(room.state.players.map((player) => player.name)).toEqual(["Ada", "Alan"]);
    expect(room.players).toHaveLength(2);
  });
});

describe("connection state", () => {
  it("mirrors the connection flags onto the game state", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const [playerId] = fill(rooms, created.value.code, ["Grace", "Alan"]);
    rooms.startGame(created.value.code, created.value.playerId, 1000);
    const room = rooms.get(created.value.code);
    if (!room || !room.state) throw new Error("no room");

    rooms.markDisconnected(created.value.code, playerId, 5000);
    const player = room.state.players.find((entry) => entry.id === playerId);
    expect(player?.connected).toBe(false);
    expect(player?.disconnectedAt).toBe(5000);

    rooms.markConnected(created.value.code, playerId);
    expect(room.state.players.find((entry) => entry.id === playerId)?.connected).toBe(true);
  });

  it("reports when the reconnect grace period has run out", () => {
    const rooms = manager();
    const created = rooms.createRoom("Ada");
    if (!created.ok) throw new Error("create failed");
    const [playerId] = fill(rooms, created.value.code, ["Grace"]);
    const room = rooms.get(created.value.code);
    if (!room) throw new Error("no room");
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) throw new Error("no player");

    rooms.markDisconnected(created.value.code, playerId, 1000);
    expect(rooms.isGraceExpired(room, player, 1000 + 59_000, 60_000)).toBe(false);
    expect(rooms.isGraceExpired(room, player, 1000 + 60_000, 60_000)).toBe(true);
  });
});
