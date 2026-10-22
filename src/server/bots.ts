import { io, type Socket } from "socket.io-client";
import type { Action, GameEvent, GameSettings, GameView } from "../game/types";
import type { LobbyView } from "./protocol";

/**
 * A headless bot that plays over a real socket.
 *
 * Used by `scripts/simulate.ts` and by the integration tests. The bot
 * only ever sees what a normal client would see: its own `GameView`.
 * It cannot cheat, because the server does not give it the truth.
 */

export interface BotOptions {
  name: string;
  url: string;
  /** Peek at a card when the game offers one (default: true). */
  peek?: boolean;
  /** Play the game automatically (default: true). */
  autoPlay?: boolean;
  /**
   * How long the bot waits for the board to settle before it acts
   * (default: 5ms). A view that is acted on immediately can be stale by
   * the time the action reaches the server.
   */
  debounceMs?: number;
}

export class Bot {
  readonly socket: Socket;
  readonly name: string;

  view: GameView | null = null;
  lobby: LobbyView | null = null;
  errors: {
    code: string;
    message: string;
    /** The action that was in flight when the server refused. */
    action?: Action | null;
    /** The step the bot believed it was in. */
    step?: string | null;
  }[] = [];
  events: GameEvent[] = [];
  /** Every raw payload this client received — used by the leak tests. */
  readonly raw: unknown[] = [];

  seatToken: string | null = null;
  code: string | null = null;

  private readonly peekEnabled: boolean;
  private readonly autoPlayEnabled: boolean;
  private readonly debounceMs: number;
  private readonly peeked = new Set<number>();
  private lastStepKind: string | null = null;
  /** Guards against sending the same non-peek action twice for one step. */
  private actedStepKey: string | null = null;
  /** Pending, debounced auto-play. */
  private pendingPlay: ReturnType<typeof setTimeout> | null = null;
  /** The last action sent — for diagnosing a refusal. */
  private lastAction: Action | null = null;
  /** The step the bot believed it was in when it sent that action. */
  private lastStepContext: string | null = null;

  constructor(options: BotOptions) {
    this.name = options.name;
    this.peekEnabled = options.peek ?? true;
    this.autoPlayEnabled = options.autoPlay ?? true;
    this.debounceMs = options.debounceMs ?? 5;
    this.socket = io(options.url, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });

    this.socket.on("game:view", (payload: { view: GameView }) => {
      this.raw.push(payload);
      this.view = payload.view;
      this.afterView();
    });
    this.socket.on("room:state", (payload: { lobby: LobbyView }) => {
      this.raw.push(payload);
      this.lobby = payload.lobby;
    });
    this.socket.on("game:error", (payload: { code: string; message: string }) => {
      this.raw.push(payload);
      this.errors.push({ ...payload, action: this.lastAction, step: this.lastStepContext });
    });
    this.socket.on("game:event", (payload: { event: GameEvent }) => {
      this.raw.push(payload);
      this.events.push(payload.event);
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (error: Error) => reject(error));
    });
  }

  createRoom(settings?: GameSettings): Promise<string> {
    return new Promise((resolve, reject) => {
      this.socket.once("room:created", (payload: { code: string; seatToken: string }) => {
        this.code = payload.code;
        this.seatToken = payload.seatToken;
        resolve(payload.code);
      });
      this.socket.once("game:error", (payload: { code: string; message: string }) => reject(
        new Error(`${payload.code}: ${payload.message}`),
      ));
      this.socket.emit("room:create", { name: this.name, settings });
    });
  }

  joinRoom(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.once("room:joined", (payload: { code: string; seatToken: string }) => {
        this.code = payload.code;
        this.seatToken = payload.seatToken;
        resolve();
      });
      this.socket.once("game:error", (payload: { code: string; message: string }) => reject(
        new Error(`${payload.code}: ${payload.message}`),
      ));
      this.socket.emit("room:join", { code, name: this.name });
    });
  }

  resume(code: string, seatToken: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.once("room:joined", () => resolve());
      this.socket.once("game:error", (payload: { code: string; message: string }) => reject(
        new Error(`${payload.code}: ${payload.message}`),
      ));
      this.socket.emit("room:resume", { code, seatToken });
    });
  }

  act(action: Action): void {
    this.lastAction = action;
    this.lastStepContext = this.view
      ? `${this.view.stepKind}|${this.view.turnPlayerId ?? "-"}`
      : null;
    this.socket.emit("game:action", { action });
  }

  /** Sends a raw payload — used by the tests to send malformed messages. */
  actRaw(payload: unknown): void {
    this.socket.emit("game:action", payload);
  }

  /** Leaves the table on purpose (not a connection drop). */
  leave(): void {
    this.socket.emit("room:leave", {});
  }

  close(): void {
    if (this.pendingPlay) {
      clearTimeout(this.pendingPlay);
      this.pendingPlay = null;
    }
    this.socket.close();
  }

  /** Waits until `predicate` holds. */
  async waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > deadline) {
        throw new Error(`bot "${this.name}" timed out waiting for a condition`);
      }
      await delay(5);
    }
  }

  async waitForView(
    predicate: (view: GameView) => boolean,
    timeoutMs = 5_000,
  ): Promise<GameView> {
    await this.waitFor(() => this.view !== null && predicate(this.view), timeoutMs);
    return this.view as GameView;
  }

  /* ---------------------------------------------------------------- */
  /* policy                                                            */
  /* ---------------------------------------------------------------- */

  private afterView(): void {
    const view = this.view;
    if (!view) return;
    if (view.stepKind !== this.lastStepKind) {
      this.peeked.clear();
      this.lastStepKind = view.stepKind;
    }
    if (!this.autoPlayEnabled) return;
    // Wait for the board to settle before acting: a view that is acted on
    // straight away can be stale by the time the action lands.
    if (this.pendingPlay) clearTimeout(this.pendingPlay);
    this.pendingPlay = setTimeout(() => {
      this.pendingPlay = null;
      const current = this.view;
      if (current) this.autoPlay(current);
    }, this.debounceMs);
  }

  private autoPlay(view: GameView): void {
    if (!this.autoPlayEnabled) return;
    const mine = view.turnPlayerId === view.youId;
    // The step key identifies the *step*, not the view: the deadline may
    // be moved by the server (a timeout, a harness), and that must not
    // make the bot act twice for one step.
    const stepKey = `${view.stepKind}|${view.turnPlayerId ?? "-"}|${view.matchWindow?.rank ?? "-"}`;
    switch (view.stepKind) {
      case "setupPeek":
      case "awaitPeek": {
        if (this.peekEnabled && view.myPeekTokens > 0) {
          const index = this.pickPeekIndex(view);
          if (index !== null) {
            this.peeked.add(index);
            this.act({ type: "peek", cardIndex: index });
          }
        }
        return;
      }
      case "turnStart": {
        if (mine && view.canDraw && this.actedStepKey !== stepKey) {
          this.actedStepKey = stepKey;
          this.act({ type: "draw" });
        }
        return;
      }
      case "awaitChoice": {
        if (mine && view.canDiscardDrawn && this.actedStepKey !== stepKey) {
          this.actedStepKey = stepKey;
          this.act({ type: "discardDrawn" });
        }
        return;
      }
      case "matchWindow": {
        // Burn a card that matches the window — but only one the bot has
        // actually seen. The bot reads its own grid, which the plan allows
        // for a test harness.
        if (!view.canBurn || !view.matchWindow || this.actedStepKey === stepKey) return;
        const target = view.matchWindow.rank;
        const match = view.myGrid.find(
          (card) => card.revealed && card.revealed.rank === target,
        );
        if (!match) return;
        this.actedStepKey = stepKey;
        this.act({ type: "burn", cardIndex: match.index });
        return;
      }
      case "awaitQueenSwap": {
        if (view.queenResolverId === view.youId && this.actedStepKey !== stepKey) {
          this.actedStepKey = stepKey;
          this.act({ type: "declineQueen" });
        }
        return;
      }
      default:
        return;
    }
  }

  /** Picks a grid slot this bot has not peeked at in the current batch. */
  private pickPeekIndex(view: GameView): number | null {
    for (const card of view.myGrid) {
      if (!this.peeked.has(card.index)) return card.index;
    }
    return null;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
