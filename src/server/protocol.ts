import { z } from "zod";
import type {
  Action,
  DifficultyPreset,
  GameEvent,
  GameSettings,
  GameView,
  Rank,
  Suit,
} from "../game/types";
import type { SettingsError } from "../game/difficulty";

/**
 * The wire protocol (plan §7).
 *
 * Everything a client sends is validated with zod before it reaches the
 * engine. Action objects are **strict**: an unknown key (for example a
 * self-reported `rank` or `value`) is rejected outright rather than
 * silently stripped, because a client that tries to report a card value
 * is a client that is trying to cheat.
 */

/* ------------------------------------------------------------------ */
/* shared value objects                                                */
/* ------------------------------------------------------------------ */

export const SuitSchema = z.enum(["S", "H", "D", "C"]);
export const RankSchema = z.enum([
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
]);
export const DifficultyPresetSchema = z.enum([
  "easy",
  "normal",
  "tricky",
  "hard",
  "memorizer",
]);

export const GameSettingsSchema = z.strictObject({
  cardsPerPlayer: z.number().int().min(1).max(20),
  deckCount: z.number().int().min(1).max(3),
  preset: z.union([DifficultyPresetSchema, z.literal("custom")]),
});

/** A grid slot. Deliberately free of any card identity. */
export const TargetSchema = z.strictObject({
  playerId: z.string().min(1).max(64),
  cardIndex: z.number().int().min(0).max(19),
});

/* ------------------------------------------------------------------ */
/* client -> server                                                     */
/* ------------------------------------------------------------------ */

/**
 * The only actions a client may send. Every variant carries grid indices
 * and nothing else — never a rank, a suit or a value.
 */
export const ActionSchema: z.ZodType<Action> = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("startGame") }),
  z.strictObject({ type: z.literal("peek"), cardIndex: z.number().int().min(0).max(19) }),
  z.strictObject({ type: z.literal("selectCard"), cardIndex: z.number().int().min(0).max(19) }),
  z.strictObject({ type: z.literal("draw") }),
  z.strictObject({ type: z.literal("discardDrawn") }),
  z.strictObject({ type: z.literal("swapDrawn"), cardIndex: z.number().int().min(0).max(19) }),
  z.strictObject({ type: z.literal("burn"), cardIndex: z.number().int().min(0).max(19) }),
  z.strictObject({ type: z.literal("dutchCall") }),
  z.strictObject({
    type: z.literal("queenSwap"),
    a: TargetSchema,
    b: TargetSchema,
  }),
  z.strictObject({ type: z.literal("declineQueen") }),
]);

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("room:create"),
    name: z.string().trim().min(1).max(24),
    settings: GameSettingsSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("room:join"),
    code: z.string().trim().min(1).max(12),
    name: z.string().trim().min(1).max(24),
  }),
  z.strictObject({
    type: z.literal("room:resume"),
    code: z.string().trim().min(1).max(12),
    seatToken: z.string().min(1).max(512),
  }),
  z.strictObject({
    type: z.literal("room:settings"),
    settings: GameSettingsSchema,
  }),
  z.strictObject({
    type: z.literal("room:leave"),
  }),
  z.strictObject({
    type: z.literal("game:action"),
    action: ActionSchema,
  }),
  z.strictObject({
    type: z.literal("ping"),
    payload: z.unknown().optional(),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/* ------------------------------------------------------------------ */
/* server -> client                                                     */
/* ------------------------------------------------------------------ */

export interface LobbyPlayerView {
  id: string;
  name: string;
  seat: number;
  isHost: boolean;
  connected: boolean;
}

export interface LobbyView {
  code: string;
  players: LobbyPlayerView[];
  settings: GameSettings;
  /** 3..6 — the PRD's lobby bounds. */
  minPlayers: number;
  maxPlayers: number;
  /** The host may press Start once the roster is in range. */
  canStart: boolean;
  /** The host may edit the settings while the game has not started. */
  canConfigure: boolean;
  hostId: string | null;
}

export interface RoomCreatedPayload {
  code: string;
  seatToken: string;
}

export interface RoomJoinedPayload {
  code: string;
  seatToken: string;
  /** The lobby projection; the game view arrives with `game:view`. */
  lobby: LobbyView;
}

export interface RoomStatePayload {
  lobby: LobbyView;
}

export interface GameViewPayload {
  view: GameView;
}

export interface GameEventPayload {
  event: GameEvent;
}

export interface GameErrorPayload {
  code: string;
  message: string;
}

export interface SettingsErrorPayload {
  errors: SettingsError[];
}

export interface ServerToClientEvents {
  "room:created": (payload: RoomCreatedPayload) => void;
  "room:joined": (payload: RoomJoinedPayload) => void;
  "room:state": (payload: RoomStatePayload) => void;
  "room:settings-error": (payload: SettingsErrorPayload) => void;
  "game:view": (payload: GameViewPayload) => void;
  "game:event": (payload: GameEventPayload) => void;
  "game:error": (payload: GameErrorPayload) => void;
  pong: (payload: unknown) => void;
  "server:hello": (payload: { port: number }) => void;
}

export interface ClientToServerEvents {
  "room:create": (payload: { name: string; settings?: GameSettings }) => void;
  "room:join": (payload: { code: string; name: string }) => void;
  "room:resume": (payload: { code: string; seatToken: string }) => void;
  "room:settings": (payload: { settings: GameSettings }) => void;
  "room:leave": (payload?: Record<string, never>) => void;
  "game:action": (payload: { action: Action }) => void;
  ping: (payload?: unknown) => void;
}

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

/** Narrowing helper for the pieces of a `Standing` that reach the wire. */
export interface StandingCardView {
  rank: Rank;
  suit: Suit;
  value: number;
}

export function isDifficultyPreset(value: string): value is DifficultyPreset {
  return DifficultyPresetSchema.safeParse(value).success;
}
