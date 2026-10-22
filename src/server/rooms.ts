import { randomBytes } from "node:crypto";
import type {
  GameSettings,
  GameState,
  PlayerId,
  PlayerState,
} from "../game/types";
import { applyAction, createLobbyState } from "../game/engine";
import {
  DIFFICULTY_PRESETS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  settingsForPreset,
  validateCustomSettings,
  validateSettings,
} from "../game/difficulty";
import { removePlayerFromState, syncConnections } from "../game/roster";
import type { LobbyPlayerView, LobbyView } from "./protocol";
import { SeatTokenService } from "./session";

/**
 * The room registry: who is in which room, who may start, and where the
 * authoritative game state lives.
 *
 * The manager owns *membership*. The engine owns *rules*. The manager
 * never mutates a card, never decides a legal move, and never projects a
 * view — it hands the state to `projectView` and lets the transport do the
 * per-player projection.
 */

/** Ambiguous characters (I, O, 0, 1) are excluded from room codes. */
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

export interface RoomPlayer {
  id: PlayerId;
  name: string;
  seat: number;
  isHost: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  seatToken: string;
}

export interface Room {
  code: string;
  players: RoomPlayer[];
  settings: GameSettings;
  /** `null` while the room is still in the lobby. */
  state: GameState | null;
  createdAt: number;
  /** Players whose seat was forfeited but whose game seat is not yet free. */
  pendingForfeits: PlayerId[];
}

export interface RoomFailure {
  code: string;
  message: string;
}

export type RoomResult<T> = { ok: true; value: T } | { ok: false; error: RoomFailure };

function fail(code: string, message: string): { ok: false; error: RoomFailure } {
  return { ok: false, error: { code, message } };
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly tokens: SeatTokenService;

  constructor(tokens: SeatTokenService) {
    this.tokens = tokens;
  }

  /* ---------------------------------------------------------------- */
  /* membership                                                        */
  /* ---------------------------------------------------------------- */

  createRoom(
    name: string,
    settings?: GameSettings,
    now: number = Date.now(),
  ): RoomResult<{ code: string; playerId: PlayerId; seatToken: string }> {
    const code = this.uniqueCode();
    const playerId = newPlayerId();
    const seatToken = this.tokens.issue(playerId);
    const resolved = this.canonicalSettings(settings ?? settingsForPreset("normal"));

    const room: Room = {
      code,
      players: [
        {
          id: playerId,
          name,
          seat: 0,
          isHost: true,
          connected: true,
          disconnectedAt: null,
          seatToken,
        },
      ],
      settings: resolved,
      state: null,
      createdAt: now,
      pendingForfeits: [],
    };
    this.rooms.set(code, room);
    return ok({ code, playerId, seatToken });
  }

  joinRoom(
    code: string,
    name: string,
  ): RoomResult<{ playerId: PlayerId; seatToken: string }> {
    const room = this.rooms.get(normaliseCode(code));
    if (!room) return fail("ROOM_NOT_FOUND", "That room does not exist.");
    if (room.state) return fail("ROOM_STARTED", "That game has already started.");
    if (room.players.length >= MAX_PLAYERS) {
      return fail("ROOM_FULL", `A room holds at most ${MAX_PLAYERS} players.`);
    }
    if (room.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      return fail("NAME_TAKEN", "That name is already taken in this room.");
    }

    const playerId = newPlayerId();
    const seatToken = this.tokens.issue(playerId);
    room.players.push({
      id: playerId,
      name,
      seat: room.players.length,
      isHost: false,
      connected: true,
      disconnectedAt: null,
      seatToken,
    });
    return ok({ playerId, seatToken });
  }

  /** Restores a seat from a seat token. The token is the only credential. */
  resumeSeat(code: string, seatToken: string): RoomResult<{ playerId: PlayerId }> {
    const room = this.rooms.get(normaliseCode(code));
    if (!room) return fail("ROOM_NOT_FOUND", "That room does not exist.");
    const playerId = this.tokens.verify(seatToken);
    if (!playerId) return fail("INVALID_SEAT_TOKEN", "That seat token is not valid.");
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) return fail("PLAYER_NOT_FOUND", "That seat no longer exists.");
    return ok({ playerId });
  }

  /* ---------------------------------------------------------------- */
  /* connection state                                                  */
  /* ---------------------------------------------------------------- */

  markConnected(code: string, playerId: PlayerId): void {
    const room = this.rooms.get(normaliseCode(code));
    const player = room?.players.find((entry) => entry.id === playerId);
    if (!room || !player) return;
    player.connected = true;
    player.disconnectedAt = null;
    this.syncIntoState(room);
  }

  markDisconnected(code: string, playerId: PlayerId, now: number): void {
    const room = this.rooms.get(normaliseCode(code));
    const player = room?.players.find((entry) => entry.id === playerId);
    if (!room || !player) return;
    player.connected = false;
    player.disconnectedAt = now;
    this.syncIntoState(room);
  }

  /** True once a disconnected player has burned through the grace period. */
  isGraceExpired(room: Room, player: RoomPlayer, now: number, graceMs: number): boolean {
    if (player.connected || player.disconnectedAt === null) return false;
    return now - player.disconnectedAt >= graceMs;
  }

  /**
   * Forfeits a seat: the player leaves the room. In a running game the
   * game seat is freed at the next safe step boundary.
   */
  forfeit(code: string, playerId: PlayerId): void {
    const room = this.rooms.get(normaliseCode(code));
    if (!room) return;
    const index = room.players.findIndex((entry) => entry.id === playerId);
    if (index === -1) return;

    room.players.splice(index, 1);
    room.players.forEach((player, seat) => {
      player.seat = seat;
    });
    // The seat order is preserved, so the first remaining player hosts.
    if (room.players.length > 0) {
      room.players[0].isHost = true;
    }
    if (room.state) {
      room.pendingForfeits.push(playerId);
      this.applyPendingForfeits(room);
    }
  }

  /**
   * Frees the game seats of forfeited players once the engine reaches a
   * step boundary. Safe to call after every state change.
   */
  applyPendingForfeits(room: Room): boolean {
    if (!room.state || room.pendingForfeits.length === 0) return false;
    let state = room.state;
    const remaining: PlayerId[] = [];
    for (const playerId of room.pendingForfeits) {
      state = removePlayerFromState(state, playerId);
      if (state.players.some((player) => player.id === playerId)) {
        // not a safe boundary yet — try again after the next step
        remaining.push(playerId);
      }
    }
    room.pendingForfeits = remaining;
    const changed = state !== room.state;
    room.state = state;
    return changed;
  }

  /* ---------------------------------------------------------------- */
  /* settings and start                                                */
  /* ---------------------------------------------------------------- */

  updateSettings(
    code: string,
    actorId: PlayerId,
    settings: GameSettings,
  ): RoomResult<GameSettings> {
    const room = this.rooms.get(normaliseCode(code));
    if (!room) return fail("ROOM_NOT_FOUND", "That room does not exist.");
    if (room.state) return fail("ROOM_STARTED", "That game has already started.");
    const actor = room.players.find((player) => player.id === actorId);
    if (!actor) return fail("PLAYER_NOT_FOUND", "You are not in this room.");
    if (!actor.isHost) return fail("NOT_ALLOWED", "Only the host can change the settings.");

    const canonical = this.canonicalSettings(settings);
    const validation = validateCustomSettings(
      canonical.cardsPerPlayer,
      canonical.deckCount,
      room.players.length,
    );
    if (!validation.ok) {
      return fail(
        "INVALID_SETTINGS",
        validation.errors.map((error) => error.message).join(" "),
      );
    }
    room.settings = canonical;
    return ok(canonical);
  }

  startGame(code: string, actorId: PlayerId, now: number): RoomResult<GameState> {
    const room = this.rooms.get(normaliseCode(code));
    if (!room) return fail("ROOM_NOT_FOUND", "That room does not exist.");
    if (room.state) return fail("ROOM_STARTED", "That game has already started.");
    const actor = room.players.find((player) => player.id === actorId);
    if (!actor) return fail("PLAYER_NOT_FOUND", "You are not in this room.");
    if (!actor.isHost) return fail("NOT_ALLOWED", "Only the host can start the game.");
    if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
      return fail(
        "NOT_ENOUGH_PLAYERS",
        `A game needs between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`,
      );
    }

    const validation = validateSettings(room.settings, room.players.length);
    if (!validation.ok) {
      return fail(
        "INVALID_SETTINGS",
        validation.errors.map((error) => error.message).join(" "),
      );
    }

    const players: PlayerState[] = room.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((player) => ({
        id: player.id,
        name: player.name,
        seat: player.seat,
        isHost: player.isHost,
        connected: player.connected,
        grid: [],
        peekTokens: 0,
        queenTokens: 0,
        disconnectedAt: player.disconnectedAt,
      }));

    const seed = randomSeed();
    const lobbyState = createLobbyState(room.settings, players, seed);

    const result = applyAction(lobbyState, { type: "startGame" }, actorId, { now });
    if (!result.ok) return fail(result.error.code, result.error.message);
    room.state = result.state;
    return ok(result.state);
  }

  /* ---------------------------------------------------------------- */
  /* projections                                                       */
  /* ---------------------------------------------------------------- */

  lobbyView(code: string, viewerId?: PlayerId): LobbyView | null {
    const room = this.rooms.get(normaliseCode(code));
    if (!room) return null;
    const players: LobbyPlayerView[] = room.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((player) => ({
        id: player.id,
        name: player.name,
        seat: player.seat,
        isHost: player.isHost,
        connected: player.connected,
      }));
    const host = room.players.find((player) => player.isHost);
    const viewer = viewerId ? room.players.find((player) => player.id === viewerId) : undefined;
    return {
      code: room.code,
      players,
      settings: room.settings,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      canStart: players.length >= MIN_PLAYERS && players.length <= MAX_PLAYERS,
      canConfigure: viewer ? viewer.isHost && !room.state : false,
      hostId: host ? host.id : null,
    };
  }

  get(code: string): Room | undefined {
    return this.rooms.get(normaliseCode(code));
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }

  /** The player id behind a socket, resolved through the room roster. */
  playerBySeatToken(code: string, seatToken: string): PlayerId | null {
    const result = this.resumeSeat(code, seatToken);
    return result.ok ? result.value.playerId : null;
  }

  /* ---------------------------------------------------------------- */
  /* internals                                                         */
  /* ---------------------------------------------------------------- */

  /** Mirrors connection flags from the roster onto the game state. */
  private syncIntoState(room: Room): void {
    if (!room.state) return;
    room.state = syncConnections(
      room.state,
      room.players.map((player) => ({
        id: player.id,
        connected: player.connected,
        disconnectedAt: player.disconnectedAt,
      })),
    );
  }

  /** Preset settings are canonicalised; custom settings keep their numbers. */
  private canonicalSettings(settings: GameSettings): GameSettings {
    if (settings.preset !== "custom") {
      return settingsForPreset(settings.preset);
    }
    return {
      cardsPerPlayer: settings.cardsPerPlayer,
      deckCount: settings.deckCount,
      preset: "custom",
    };
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 64; attempt++) {
      const bytes = randomBytes(ROOM_CODE_LENGTH);
      let code = "";
      for (let index = 0; index < ROOM_CODE_LENGTH; index++) {
        code += ROOM_CODE_ALPHABET[bytes[index] % ROOM_CODE_ALPHABET.length];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("could not allocate a free room code");
  }
}

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

function newPlayerId(): PlayerId {
  return `p_${randomBytes(9).toString("hex")}`;
}

function randomSeed(): number {
  const bytes = randomBytes(4);
  return bytes.readUInt32BE(0);
}

export { DIFFICULTY_PRESETS };
