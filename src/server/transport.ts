import type { Server, Socket } from "socket.io";
import type { Action, GameEvent } from "../game/types";
import { applyAction } from "../game/engine";
import { validateCustomSettings } from "../game/difficulty";
import { projectView } from "../game/view";
import { ActionSchema, ClientMessageSchema, type ClientMessage } from "./protocol";
import type { Room, RoomManager } from "./rooms";
import type { SessionRegistry } from "./session";

/**
 * The Socket.io adapter (plan §7).
 *
 * The one rule that matters here: **every client gets its own payload**.
 * `game:view` is emitted per socket with `projectView(state, thatPlayer)`;
 * there is no code path that sends one shared state to the room.
 */

export interface TransportContext {
  io: Server;
  rooms: RoomManager;
  sessions: SessionRegistry;
  /** The port the server listens on — sent with the `server:hello` greeting. */
  port?: () => number;
}

export function setupTransport(ctx: TransportContext): void {
  const { io, rooms, sessions } = ctx;

  io.on("connection", (socket: Socket) => {
    socket.emit("server:hello", { port: ctx.port?.() ?? 0 });

    socket.on("room:create", (raw: unknown) => {
      const message = parse(raw, "room:create");
      if (!message || message.type !== "room:create") {
        socket.emit("game:error", invalid("Invalid room:create message."));
        return;
      }
      const created = rooms.createRoom(message.name, message.settings);
      if (!created.ok) {
        socket.emit("game:error", created.error);
        return;
      }
      const { code, playerId, seatToken } = created.value;
      attach(socket, ctx, code, playerId);
      socket.emit("room:created", { code, seatToken });
      broadcastLobby(ctx, code);
    });

    socket.on("room:join", (raw: unknown) => {
      const message = parse(raw, "room:join");
      if (!message || message.type !== "room:join") {
        socket.emit("game:error", invalid("Invalid room:join message."));
        return;
      }
      const joined = rooms.joinRoom(message.code, message.name);
      if (!joined.ok) {
        socket.emit("game:error", joined.error);
        return;
      }
      const { playerId, seatToken } = joined.value;
      const room = rooms.get(message.code);
      if (!room) {
        socket.emit("game:error", invalid("That room does not exist."));
        return;
      }
      attach(socket, ctx, room.code, playerId);
      socket.emit("room:joined", {
        code: room.code,
        seatToken,
        lobby: rooms.lobbyView(room.code, playerId) ?? emptyLobby(room.code),
      });
      broadcastLobby(ctx, room.code);
    });

    socket.on("room:resume", (raw: unknown) => {
      const message = parse(raw, "room:resume");
      if (!message || message.type !== "room:resume") {
        socket.emit("game:error", invalid("Invalid room:resume message."));
        return;
      }
      const resumed = rooms.resumeSeat(message.code, message.seatToken);
      if (!resumed.ok) {
        socket.emit("game:error", resumed.error);
        return;
      }
      const { playerId } = resumed.value;
      const room = rooms.get(message.code);
      if (!room) {
        socket.emit("game:error", invalid("That room does not exist."));
        return;
      }
      rooms.markConnected(room.code, playerId);
      attach(socket, ctx, room.code, playerId);
      socket.emit("room:joined", {
        code: room.code,
        seatToken: message.seatToken,
        lobby: rooms.lobbyView(room.code, playerId) ?? emptyLobby(room.code),
      });
      if (room.state) {
        // A returning player gets their own projection, immediately.
        socket.emit("game:view", {
          view: projectView(room.state, playerId, Date.now()),
        });
      }
      broadcastLobby(ctx, room.code);
      broadcastViews(ctx, room.code);
    });

    socket.on("room:settings", (raw: unknown) => {
      const message = parse(raw, "room:settings");
      if (!message || message.type !== "room:settings") {
        socket.emit("game:error", invalid("Invalid room:settings message."));
        return;
      }
      const seat = sessions.seatOf(socket.id);
      if (!seat) {
        socket.emit("game:error", invalid("You are not in a room."));
        return;
      }
      const updated = rooms.updateSettings(seat.code, seat.playerId, message.settings);
      if (!updated.ok) {
        // Field-level errors let the host render inline validation (plan §8).
        if (updated.error.code === "INVALID_SETTINGS") {
          const room = rooms.get(seat.code);
          if (room) {
            const validation = validateCustomSettings(
              message.settings.cardsPerPlayer,
              message.settings.deckCount,
              room.players.length,
            );
            if (!validation.ok) {
              socket.emit("room:settings-error", { errors: validation.errors });
              return;
            }
          }
        }
        socket.emit("game:error", updated.error);
        return;
      }
      broadcastLobby(ctx, seat.code);
    });

    socket.on("room:leave", (raw: unknown) => {
      const message = parse(raw, "room:leave");
      if (!message || message.type !== "room:leave") {
        socket.emit("game:error", invalid("Invalid room:leave message."));
        return;
      }
      const seat = sessions.seatOf(socket.id);
      if (!seat) return;
      sessions.release(socket.id);
      socket.leave(seat.code);
      rooms.forfeit(seat.code, seat.playerId);
      broadcastLobby(ctx, seat.code);
      broadcastViews(ctx, seat.code);
    });

    socket.on("game:action", (raw: unknown) => {
      const message = parse(raw, "game:action");
      if (!message || message.type !== "game:action") {
        socket.emit("game:error", invalid("Invalid game:action message."));
        return;
      }
      const action = parseAction(message.action);
      if (!action) {
        socket.emit(
          "game:error",
          invalid("That action is not allowed. Actions carry grid indices only."),
        );
        return;
      }
      handleAction(ctx, socket, action);
    });

    socket.on("ping", (raw: unknown) => {
      socket.emit("pong", raw ?? null);
    });

    socket.on("disconnect", () => {
      const seat = sessions.release(socket.id);
      if (!seat) return;
      const room = rooms.get(seat.code);
      if (!room) return;
      // The seat survives for the reconnect grace period; the sweeper
      // forfeits it if the player does not come back.
      rooms.markDisconnected(room.code, seat.playerId, Date.now());
      broadcastLobby(ctx, room.code);
      broadcastViews(ctx, room.code);
    });
  });
}

/* ------------------------------------------------------------------ */
/* actions                                                             */
/* ------------------------------------------------------------------ */

function handleAction(ctx: TransportContext, socket: Socket, action: Action): void {
  const { rooms, sessions } = ctx;
  const seat = sessions.seatOf(socket.id);
  if (!seat) {
    socket.emit("game:error", invalid("You are not in a room."));
    return;
  }
  const room = rooms.get(seat.code);
  if (!room) {
    socket.emit("game:error", invalid("That room does not exist."));
    return;
  }

  const now = Date.now();

  if (action.type === "startGame") {
    if (room.state) {
      socket.emit("game:error", {
        code: "ROOM_STARTED",
        message: "That game has already started.",
      });
      return;
    }
    const started = rooms.startGame(room.code, seat.playerId, now);
    if (!started.ok) {
      socket.emit("game:error", started.error);
      return;
    }
    broadcastViews(ctx, room.code);
    broadcastEvents(ctx, room.code, [{ type: "gameStarted" }]);
    return;
  }

  if (!room.state) {
    socket.emit("game:error", {
      code: "ROOM_NOT_STARTED",
      message: "The game has not started yet.",
    });
    return;
  }

  const result = applyAction(room.state, action, seat.playerId, { now });
  if (!result.ok) {
    socket.emit("game:error", {
      code: result.error.code,
      message: result.error.message,
    });
    return;
  }

  room.state = result.state;
  rooms.applyPendingForfeits(room);
  broadcastViews(ctx, room.code);
  broadcastEvents(ctx, room.code, result.events);
}

/* ------------------------------------------------------------------ */
/* broadcasting                                                         */
/* ------------------------------------------------------------------ */

/**
 * Sends every connected player their own projection of the same state.
 * This is the anti-cheat boundary — never replace it with a room-wide
 * emit of a single payload.
 */
export function broadcastViews(ctx: TransportContext, code: string, now: number = Date.now()): void {
  const room = ctx.rooms.get(code);
  if (!room || !room.state) return;
  for (const player of room.players) {
    const view = projectView(room.state, player.id, now);
    for (const socketId of ctx.sessions.socketsOf(room.code, player.id)) {
      ctx.io.to(socketId).emit("game:view", { view });
    }
  }
}

function broadcastLobby(ctx: TransportContext, code: string): void {
  const room = ctx.rooms.get(code);
  if (!room) return;
  for (const player of room.players) {
    const lobby = ctx.rooms.lobbyView(room.code, player.id);
    if (!lobby) continue;
    for (const socketId of ctx.sessions.socketsOf(room.code, player.id)) {
      ctx.io.to(socketId).emit("room:state", { lobby });
    }
  }
}

function broadcastEvents(ctx: TransportContext, code: string, events: GameEvent[]): void {
  if (events.length === 0) return;
  for (const event of events) {
    ctx.io.to(code).emit("game:event", { event });
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Binds a socket to a seat and puts it in the room's socket.io room. */
function attach(
  socket: Socket,
  ctx: TransportContext,
  code: string,
  playerId: string,
): void {
  const previous = ctx.sessions.seatOf(socket.id);
  if (previous && previous.code !== code) {
    socket.leave(previous.code);
  }
  ctx.sessions.bind(socket.id, { code, playerId });
  socket.join(code);
}

/**
 * Validates an inbound message. The socket.io event name carries the
 * message type, so it is added back before the schema runs (and it is
 * added *after* the payload spread, so a client cannot spoof the type).
 */
function parse(raw: unknown, type: ClientMessage["type"]): ClientMessage | null {
  const payload =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>), type }
      : { type };
  const result = ClientMessageSchema.safeParse(payload);
  return result.success ? result.data : null;
}

/**
 * Actions are validated separately so a malformed action can be rejected
 * with a specific message. The schema is strict: an action that carries a
 * card value (for example `{ type: "burn", cardIndex: 0, rank: "7" }`)
 * never reaches the engine.
 */
function parseAction(raw: unknown): Action | null {
  const result = ActionSchema.safeParse(raw);
  return result.success ? result.data : null;
}

function invalid(message: string): { code: string; message: string } {
  return { code: "INVALID_MESSAGE", message };
}

function emptyLobby(code: string) {
  return {
    code,
    players: [],
    settings: { cardsPerPlayer: 6, deckCount: 1, preset: "normal" as const },
    minPlayers: 3,
    maxPlayers: 6,
    canStart: false,
    canConfigure: false,
    hostId: null,
    youId: null,
  };
}

export type { Room };
