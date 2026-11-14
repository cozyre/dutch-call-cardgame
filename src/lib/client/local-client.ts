import { applyAction, applyTimeout, createLobbyState, pruneExpiredReveals } from "@/game/engine";
import { validateCustomSettings } from "@/game/difficulty";
import { projectView } from "@/game/view";
import type {
  Action,
  GameEvent,
  GameSettings,
  GameState,
  GameView,
  PlayerId,
  PlayerState,
} from "@/game/types";
import type { SettingsError } from "@/game/difficulty";
import type { LobbyView } from "@/server/protocol";
import type {
  ConnectionStatus,
  GameClient,
  GameError,
  RoomSession,
  Unsubscribe,
} from "./game-client";

/**
 * The dev client (plan §9): an in-process `GameState` driven by the same
 * pure engine the server uses — `applyAction`, `applyTimeout`,
 * `projectView` — so the whole board is playable in one browser tab.
 *
 * Anti-cheat rules still apply here:
 * - the three simulated opponents act **only** on `projectView(state, bot)`
 *   — they never read the truth state, so a bot can only burn a card it has
 *   legitimately peeked at;
 * - the UI is served the viewer's projection, exactly like the server does.
 *
 * This is a development harness only — production always uses
 * `SocketGameClient`. Opt in per tab with `?local=1` in the room URL.
 */

const SWEEP_INTERVAL_MS = 250;
const DEFAULT_OPPONENTS = ["Maya", "Jonas", "Priya"];

interface BotMemory {
  id: PlayerId;
  name: string;
  /** Step kind this bot last saw, to reset per-batch peek tracking. */
  lastStepKind: string | null;
  /** Own-grid slots peeked in the current batch. */
  peeked: Set<number>;
  /** Guards against repeating a one-shot action for the same step. */
  actedStepKey: string | null;
}

type Listener<T> = (value: T) => void;

export interface LocalGameClientOptions {
  /** Seed for the shuffled deal. Defaults to a fresh seed per room. */
  seed?: number;
  /** Clock override for tests; defaults to the real clock. */
  now?: () => number;
  /** Opponent names (defaults to the design's trio). */
  opponents?: string[];
  /**
   * `resumeRoom` starts a fresh game immediately (the one-URL dev harness:
   * open `/room/DEV01?local=1` and you are at the table). Default true.
   */
  autoStart?: boolean;
  /** Whether the simulated opponents play automatically. Default true. */
  autoPlay?: boolean;
}

export class LocalGameClient implements GameClient {
  private readonly lobbyListeners = new Set<Listener<LobbyView>>();
  private readonly viewListeners = new Set<Listener<GameView>>();
  private readonly eventListeners = new Set<Listener<GameEvent>>();
  private readonly errorListeners = new Set<Listener<GameError>>();
  private readonly settingsErrorListeners = new Set<Listener<SettingsError[]>>();
  private readonly statusListeners = new Set<Listener<ConnectionStatus>>();

  private readonly bots: BotMemory[];
  private readonly autoStart: boolean;
  private readonly autoPlay: boolean;
  private readonly clock: () => number;
  private nextSeed: number;

  private state: GameState | null = null;
  private code: string | null = null;
  private seatToken: string | null = null;
  private youName = "You";
  private lastLobby: LobbyView | null = null;
  private lastView: GameView | null = null;
  private status: ConnectionStatus = "disconnected";
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(options: LocalGameClientOptions = {}) {
    this.clock = options.now ?? (() => Date.now());
    this.autoStart = options.autoStart ?? true;
    this.autoPlay = options.autoPlay ?? true;
    this.nextSeed = options.seed ?? (Date.now() & 0x7fffffff);
    const names = options.opponents ?? DEFAULT_OPPONENTS;
    this.bots = names.map((name, index) => ({
      id: `bot-${index}`,
      name,
      lastStepKind: null,
      peeked: new Set<number>(),
      actedStepKey: null,
    }));
  }

  /* ---------------------------------------------------------------- */
  /* connection                                                        */
  /* ---------------------------------------------------------------- */

  connect(): void {
    this.setStatus("connected");
    if (!this.sweeper) {
      this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    }
  }

  disconnect(): void {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
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

  /* ---------------------------------------------------------------- */
  /* room membership                                                   */
  /* ---------------------------------------------------------------- */

  async createRoom(name: string, settings?: GameSettings): Promise<RoomSession> {
    this.youName = name.trim() || "You";
    this.openRoom(this.randomCode(), settings);
    return this.session();
  }

  async joinRoom(code: string, name: string): Promise<RoomSession> {
    this.youName = name.trim() || "You";
    this.openRoom(normaliseCode(code), undefined);
    return this.session();
  }

  /**
   * Dev harness entry: resuming an unknown code seats you with three
   * simulated opponents and (by default) deals a fresh game immediately.
   */
  async resumeRoom(code: string, _seatToken: string): Promise<RoomSession> {
    if (this.code === normaliseCode(code) && this.state) {
      this.broadcastLobby();
      this.broadcastView();
      return this.session();
    }
    if (this.autoStart) {
      this.startFreshGame(normaliseCode(code));
      return this.session();
    }
    this.youName = "You";
    this.openRoom(normaliseCode(code), undefined);
    return this.session();
  }

  updateSettings(settings: GameSettings): void {
    const state = this.state;
    if (!state || state.phase !== "lobby") {
      this.pushError({
        code: "WRONG_PHASE",
        message: "Settings can only change in the lobby.",
      });
      return;
    }
    const validation = validateCustomSettings(
      settings.cardsPerPlayer,
      settings.deckCount,
      state.players.length,
    );
    if (!validation.ok) {
      for (const listener of this.settingsErrorListeners) listener(validation.errors);
      return;
    }
    this.state = { ...state, settings };
    this.broadcastLobby();
  }

  leaveRoom(): void {
    this.state = null;
    this.code = null;
    this.seatToken = null;
    this.lastLobby = null;
    this.lastView = null;
  }

  /**
   * Host-only "Play again" (plan §10): re-deal the same room. In this
   * harness "you" is always the host (openRoom seats you as host), so the
   * real transport's host check never bites here — only the phase does.
   * The re-deal keeps every seat and the room's settings but takes a fresh
   * seed, exactly like the server's `room:rematch`.
   */
  rematch(): void {
    const state = this.state;
    if (!state || state.phase !== "over") {
      this.pushError({
        code: "WRONG_PHASE",
        message: "The current game is still in play.",
      });
      return;
    }
    this.startFreshGame(this.code ?? "", state.settings);
  }

  /* ---------------------------------------------------------------- */
  /* actions                                                           */
  /* ---------------------------------------------------------------- */

  send(action: Action): void {
    const state = this.state;
    if (!state) {
      this.pushError({ code: "NO_ROOM", message: "You are not in a room." });
      return;
    }
    const result = applyAction(state, action, "you", { now: this.clock() });
    if (!result.ok) {
      this.pushError({ code: result.error.code, message: result.error.message });
      return;
    }
    this.state = result.state;
    this.emitEvents(result.events);
    this.runBots();
    this.broadcastView();
    this.broadcastLobby();
  }

  getSeat(): RoomSession | null {
    return this.seatToken && this.code ? { code: this.code, seatToken: this.seatToken } : null;
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
  /* internals — state machine                                         */
  /* ---------------------------------------------------------------- */

  /** Fresh room with the player plus three simulated opponents. */
  private openRoom(code: string, settings: GameSettings | undefined): void {
    const players: PlayerState[] = [
      {
        id: "you",
        name: this.uniqueName(this.youName),
        seat: 0,
        isHost: true,
        connected: true,
        grid: [],
        peekTokens: 0,
        queenTokens: 0,
        disconnectedAt: null,
      },
      ...this.bots.map((bot, index) => ({
        id: bot.id,
        name: bot.name,
        seat: index + 1,
        isHost: false,
        connected: true,
        grid: [],
        peekTokens: 0,
        queenTokens: 0,
        disconnectedAt: null,
      })),
    ];
    this.state = createLobbyState(
      settings ?? { cardsPerPlayer: 6, deckCount: 1, preset: "normal" },
      players,
      this.takeSeed(),
    );
    this.code = code;
    this.seatToken = "local-dev-seat";
    this.resetBotMemory();
    this.broadcastLobby();
    this.broadcastView();
  }

  /**
   * Deals and starts immediately. Called by the `?local=1` one-URL harness
   * (default settings) and by `rematch` (the current room's settings —
   * plan §10: same seats, same settings, fresh deal).
   */
  private startFreshGame(code: string, settings?: GameSettings): void {
    this.openRoom(code, settings);
    const state = this.state;
    if (!state) return;
    const started = applyAction(state, { type: "startGame" }, "you", { now: this.clock() });
    if (!started.ok) return;
    this.state = started.state;
    this.emitEvents(started.events);
    this.runBots();
    this.broadcastView();
    this.broadcastLobby();
  }

  /**
   * Runs the simulated opponents until nobody can act. Every decision is
   * made against `projectView(state, botId, now)` — the bot never touches
   * the truth state.
   */
  private runBots(): void {
    let guard = 0;
    for (;;) {
      if (guard++ > 64) return; // never loop forever on a stuck step
      const acted = this.stepBots();
      if (!acted) return;
    }
  }

  private stepBots(): boolean {
    const state = this.state;
    if (!state || state.phase === "lobby") return false;
    for (const bot of this.bots) {
      const action = this.botAction(bot, projectView(state, bot.id, this.clock()));
      if (!action) continue;
      const result = applyAction(state, action, bot.id, { now: this.clock() });
      if (result.ok) {
        this.state = result.state;
        this.emitEvents(result.events);
        return true;
      }
      // A refusal is fine: the bot acted on a stale view. Reset its
      // one-shot guard so a later step can still be acted on.
      bot.actedStepKey = null;
    }
    return false;
  }

  private botAction(bot: BotMemory, view: GameView): Action | null {
    if (view.phase !== "playing") return null;
    if (view.stepKind !== bot.lastStepKind) {
      bot.lastStepKind = view.stepKind;
      bot.peeked.clear();
      bot.actedStepKey = null;
    }
    if (!this.autoPlay) return null;

    const stepKey = `${view.stepKind}|${view.turnPlayerId ?? "-"}|${view.matchWindow?.rank ?? "-"}`;
    const mine = view.turnPlayerId === view.youId;

    switch (view.stepKind) {
      case "setupPeek":
      case "awaitPeek": {
        if (view.myPeekTokens <= 0) return null;
        const slot = view.myGrid.find(
          (entry) => !bot.peeked.has(entry.index),
        );
        if (!slot) return null;
        bot.peeked.add(slot.index);
        return { type: "peek", cardIndex: slot.index };
      }
      case "turnStart": {
        if (!mine || bot.actedStepKey === stepKey) return null;
        // Dutch Call is offered before drawing, exactly 1 card left
        // (plan §12 A6): a bot that can call does, like a real player.
        if (view.canDutchCall) {
          bot.actedStepKey = stepKey;
          return { type: "dutchCall" };
        }
        if (!view.canDraw) return null;
        bot.actedStepKey = stepKey;
        return { type: "draw" };
      }
      case "awaitChoice": {
        if (!mine || !view.canDiscardDrawn || bot.actedStepKey === stepKey) return null;
        bot.actedStepKey = stepKey;
        return { type: "discardDrawn" };
      }
      case "matchWindow": {
        if (!view.canBurn || !view.matchWindow) return null;
        // Only a card this bot has actually peeked may be burned — the
        // projection is all the bot knows.
        const target = view.myGrid.find(
          (entry) =>
            entry.revealed !== null &&
            entry.revealed.rank === view.matchWindow?.rank,
        );
        if (!target || bot.actedStepKey === stepKey) return null;
        bot.actedStepKey = stepKey;
        return { type: "burn", cardIndex: target.index };
      }
      case "awaitQueenSwap": {
        if (view.queenResolverId !== view.youId || bot.actedStepKey === stepKey) return null;
        bot.actedStepKey = stepKey;
        return { type: "declineQueen" };
      }
      default:
        return null;
    }
  }

  private resetBotMemory(): void {
    for (const bot of this.bots) {
      bot.lastStepKind = null;
      bot.peeked.clear();
      bot.actedStepKey = null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* internals — timers                                                */
  /* ---------------------------------------------------------------- */

  /**
   * The in-process sweeper: executes server-side timeouts (the client never
   * decides game state) and refreshes the projection when a reveal expires.
   * Runs on an interval in dev; public so tests can drive the clock.
   */
  sweep(): void {
    const state = this.state;
    if (!state || state.phase !== "playing") return;
    const now = this.clock();

    const timedOut = applyTimeout(state, now);
    if (timedOut && timedOut.ok) {
      this.state = timedOut.state;
      this.emitEvents(timedOut.events);
      this.runBots();
      this.broadcastView();
      return;
    }

    const expired = state.reveals.some((reveal) => reveal.until <= now);
    if (expired) {
      this.state = pruneExpiredReveals(state, now);
      this.broadcastView();
    }
  }

  /* ---------------------------------------------------------------- */
  /* internals — projections                                           */
  /* ---------------------------------------------------------------- */

  private broadcastView(): void {
    const state = this.state;
    if (!state) return;
    this.lastView = projectView(state, "you", this.clock());
    for (const listener of this.viewListeners) listener(this.lastView);
  }

  private broadcastLobby(): void {
    const state = this.state;
    if (!state) return;
    const lobby: LobbyView = {
      code: this.code ?? "",
      players: state.players.map((player) => ({
        id: player.id,
        name: player.name,
        seat: player.seat,
        isHost: player.isHost,
        connected: player.connected,
      })),
      settings: state.settings,
      minPlayers: 3,
      maxPlayers: 6,
      canStart: state.players.length >= 3 && state.players.length <= 6,
      canConfigure: state.phase === "lobby",
      hostId: state.players.find((player) => player.isHost)?.id ?? null,
      youId: "you",
    };
    this.lastLobby = lobby;
    for (const listener of this.lobbyListeners) listener(lobby);
  }

  private emitEvents(events: GameEvent[]): void {
    for (const event of events) {
      for (const listener of this.eventListeners) listener(event);
    }
  }

  private pushError(error: GameError): void {
    for (const listener of this.errorListeners) listener(error);
  }

  private session(): RoomSession {
    return { code: this.code ?? "", seatToken: this.seatToken ?? "local-dev-seat" };
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.bots.map((bot) => bot.name));
    return taken.has(name) ? `${name} (you)` : name;
  }

  private randomCode(): string {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  private takeSeed(): number {
    const seed = this.nextSeed;
    this.nextSeed = (this.nextSeed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed;
  }
}

function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "LOCAL1";
}

let singleton: LocalGameClient | null = null;

/** The tab's shared dev client. Select it with `?local=1` in the room URL. */
export function getLocalGameClient(): LocalGameClient {
  if (!singleton) singleton = new LocalGameClient();
  return singleton;
}
