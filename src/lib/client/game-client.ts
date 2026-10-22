import type { SettingsError } from "@/game/difficulty";
import type { Action, GameEvent, GameSettings, GameView } from "@/game/types";
import type { LobbyView } from "@/server/protocol";

/**
 * The client contract the UI codes against (plan §9).
 *
 * The same interface is implemented by the real Socket.io transport and,
 * later, by the in-process dev client. Components only render views and
 * dispatch actions — no game rules live in the UI.
 */

export interface GameError {
  code: string;
  message: string;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export type Unsubscribe = () => void;

export interface RoomSession {
  code: string;
  seatToken: string;
}

export interface GameClient {
  connect(): void;
  disconnect(): void;

  createRoom(name: string, settings?: GameSettings): Promise<RoomSession>;
  joinRoom(code: string, name: string): Promise<RoomSession>;
  resumeRoom(code: string, seatToken: string): Promise<RoomSession>;
  updateSettings(settings: GameSettings): void;
  leaveRoom(): void;

  send(action: Action): void;

  onLobby(cb: (lobby: LobbyView) => void): Unsubscribe;
  onView(cb: (view: GameView) => void): Unsubscribe;
  onEvent(cb: (event: GameEvent) => void): Unsubscribe;
  onError(cb: (error: GameError) => void): Unsubscribe;
  onSettingsError(cb: (errors: SettingsError[]) => void): Unsubscribe;
  onStatus(cb: (status: ConnectionStatus) => void): Unsubscribe;

  /** The most recent projections, for late subscribers after a navigation. */
  getCachedLobby(): LobbyView | null;
  getCachedView(): GameView | null;
  /** The seat this tab currently holds, if any. */
  getSeat(): RoomSession | null;
}
