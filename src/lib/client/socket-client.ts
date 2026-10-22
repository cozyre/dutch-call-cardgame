import { io, type Socket } from "socket.io-client";
import type { SettingsError } from "@/game/difficulty";
import type { Action, GameEvent, GameSettings, GameView } from "@/game/types";
import { GAME_SERVER_URL } from "@/lib/env";
import type {
  ClientToServerEvents,
  LobbyView,
  ServerToClientEvents,
} from "@/server/protocol";
import type {
  ConnectionStatus,
  GameClient,
  GameError,
  RoomSession,
  Unsubscribe,
} from "./game-client";
import { saveSeatToken } from "./storage";

type Listener<T> = (value: T) => void;
type Expected = "room:created" | "room:joined";

interface Pending {
  expected: Expected;
  resolve: (session: RoomSession) => void;
  reject: (error: GameError) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The real transport (plan §9). One socket per browser tab, reused across
 * client-side navigations so creating a room and arriving in the lobby does
 * not drop the seat.
 *
 * Every inbound message here is a *projection* the server computed for this
 * player; the client never reconstructs state from events.
 */
export class SocketGameClient implements GameClient {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private readonly lobbyListeners = new Set<Listener<LobbyView>>();
  private readonly viewListeners = new Set<Listener<GameView>>();
  private readonly eventListeners = new Set<Listener<GameEvent>>();
  private readonly errorListeners = new Set<Listener<GameError>>();
  private readonly settingsErrorListeners = new Set<Listener<SettingsError[]>>();
  private readonly statusListeners = new Set<Listener<ConnectionStatus>>();

  private pending: Pending | null = null;
  private seat: RoomSession | null = null;
  private lastLobby: LobbyView | null = null;
  private lastView: GameView | null = null;
  private status: ConnectionStatus = "disconnected";

  constructor(url: string = GAME_SERVER_URL) {
    this.socket = io(url, {
      autoConnect: false,
      transports: ["websocket"],
    });
    this.wireSocket();
  }

  /* ---------------------------------------------------------------- */
  /* connection                                                        */
  /* ---------------------------------------------------------------- */

  connect(): void {
    this.setStatus(this.socket.connected ? "connected" : "connecting");
    if (!this.socket.connected) this.socket.connect();
  }

  disconnect(): void {
    this.socket.disconnect();
    this.setStatus("disconnected");
  }

  onStatus(cb: Listener<ConnectionStatus>): Unsubscribe {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private wireSocket(): void {
    this.socket.on("connect", () => {
      this.setStatus("connected");
      // A reconnect needs a fresh seat binding: the server dropped the
      // socket↔seat binding when the connection was lost.
      if (this.seat) {
        this.socket.emit("room:resume", {
          code: this.seat.code,
          seatToken: this.seat.seatToken,
        });
      }
    });

    this.socket.on("disconnect", () => {
      this.setStatus("disconnected");
    });

    this.socket.on("connect_error", () => {
      this.setStatus("disconnected");
      this.rejectPending({
        code: "CONNECTION_FAILED",
        message: "Could not reach the game server. Is it running?",
      });
    });

    this.socket.on("room:created", ({ code, seatToken }) => {
      const session = this.rememberSeat(code, seatToken);
      this.settle("room:created", session);
    });

    this.socket.on("room:joined", ({ code, seatToken, lobby }) => {
      const session = this.rememberSeat(code, seatToken);
      this.setLobby(lobby);
      this.settle("room:joined", session);
    });

    this.socket.on("room:state", ({ lobby }) => {
      this.setLobby(lobby);
    });

    this.socket.on("game:view", ({ view }) => {
      this.lastView = view;
      for (const listener of this.viewListeners) listener(view);
    });

    this.socket.on("game:event", ({ event }) => {
      for (const listener of this.eventListeners) listener(event);
    });

    this.socket.on("room:settings-error", ({ errors }) => {
      for (const listener of this.settingsErrorListeners) listener(errors);
    });

    this.socket.on("game:error", (error) => {
      if (this.pending) {
        this.rejectPending(error);
        return;
      }
      for (const listener of this.errorListeners) listener(error);
    });
  }

  /* ---------------------------------------------------------------- */
  /* room membership                                                   */
  /* ---------------------------------------------------------------- */

  async createRoom(name: string, settings?: GameSettings): Promise<RoomSession> {
    await this.ensureConnected();
    return this.request("room:created", () => {
      this.socket.emit("room:create", { name, settings });
    });
  }

  async joinRoom(code: string, name: string): Promise<RoomSession> {
    await this.ensureConnected();
    return this.request("room:joined", () => {
      this.socket.emit("room:join", { code, name });
    });
  }

  async resumeRoom(code: string, seatToken: string): Promise<RoomSession> {
    await this.ensureConnected();
    return this.request("room:joined", () => {
      this.socket.emit("room:resume", { code, seatToken });
    });
  }

  updateSettings(settings: GameSettings): void {
    this.socket.emit("room:settings", { settings });
  }

  leaveRoom(): void {
    this.socket.emit("room:leave", {});
    this.seat = null;
    this.lastLobby = null;
    this.lastView = null;
  }

  send(action: Action): void {
    this.socket.emit("game:action", { action });
  }

  getSeat(): RoomSession | null {
    return this.seat;
  }

  getCachedLobby(): LobbyView | null {
    return this.lastLobby;
  }

  getCachedView(): GameView | null {
    return this.lastView;
  }

  /* ---------------------------------------------------------------- */
  /* subscriptions                                                     */
  /* ---------------------------------------------------------------- */

  onLobby(cb: Listener<LobbyView>): Unsubscribe {
    this.lobbyListeners.add(cb);
    if (this.lastLobby) cb(this.lastLobby);
    return () => this.lobbyListeners.delete(cb);
  }

  onView(cb: Listener<GameView>): Unsubscribe {
    this.viewListeners.add(cb);
    if (this.lastView) cb(this.lastView);
    return () => this.viewListeners.delete(cb);
  }

  onEvent(cb: Listener<GameEvent>): Unsubscribe {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  onError(cb: Listener<GameError>): Unsubscribe {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  onSettingsError(cb: Listener<SettingsError[]>): Unsubscribe {
    this.settingsErrorListeners.add(cb);
    return () => this.settingsErrorListeners.delete(cb);
  }

  /* ---------------------------------------------------------------- */
  /* internals                                                         */
  /* ---------------------------------------------------------------- */

  private setLobby(lobby: LobbyView): void {
    this.lastLobby = lobby;
    for (const listener of this.lobbyListeners) listener(lobby);
  }

  private rememberSeat(code: string, seatToken: string): RoomSession {
    const session = { code, seatToken };
    this.seat = session;
    saveSeatToken(code, seatToken);
    return session;
  }

  private request(expected: Expected, emit: () => void): Promise<RoomSession> {
    if (this.pending) {
      return Promise.reject<RoomSession>({
        code: "BUSY",
        message: "Another request is already in flight.",
      });
    }
    return new Promise<RoomSession>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rejectPending({
          code: "TIMEOUT",
          message: "The game server did not respond. Try again.",
        });
      }, REQUEST_TIMEOUT_MS);
      this.pending = { expected, resolve, reject, timer };
      emit();
    });
  }

  private settle(expected: Expected, session: RoomSession): void {
    if (!this.pending || this.pending.expected !== expected) return;
    const { resolve, timer } = this.pending;
    this.pending = null;
    clearTimeout(timer);
    resolve(session);
  }

  private rejectPending(error: GameError): void {
    if (!this.pending) return;
    const { reject, timer } = this.pending;
    this.pending = null;
    clearTimeout(timer);
    reject(error);
  }

  private ensureConnected(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    this.connect();
    return new Promise((resolve, reject) => {
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject({
          code: "CONNECTION_FAILED",
          message: "Could not reach the game server. Is it running?",
        });
      };
      const cleanup = () => {
        this.socket.off("connect", onConnect);
        this.socket.off("connect_error", onError);
      };
      this.socket.once("connect", onConnect);
      this.socket.once("connect_error", onError);
    });
  }
}

let singleton: SocketGameClient | null = null;

/** The tab's shared client. Safe to call from any client component. */
export function getGameClient(): SocketGameClient {
  if (!singleton) singleton = new SocketGameClient();
  return singleton;
}
