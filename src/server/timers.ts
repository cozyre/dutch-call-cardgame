import type { Server } from "socket.io";
import { applyTimeout, pruneExpiredReveals } from "../game/engine";
import type { RoomManager } from "./rooms";
import type { SessionRegistry } from "./session";
import { broadcastViews } from "./transport";

/**
 * The deadline sweeper (plan §7).
 *
 * One interval drives every server-enforced clock in the game:
 *  - the 30 s draw decision, match window, setup peek and ability windows
 *    (delegated to the engine's `applyTimeout`)
 *  - the 8 s reveal window (expired reveals are pruned and the view is
 *    re-projected, so a client never keeps a value past its deadline)
 *  - the 60 s reconnect grace (an unrecovered seat is forfeited)
 *
 * The sweeper is the only place where wall-clock time enters the game.
 */

export const DEFAULT_SWEEP_INTERVAL_MS = 500;
export const RECONNECT_GRACE_MS = 60_000;

export interface SweeperContext {
  io: Server;
  rooms: RoomManager;
  sessions: SessionRegistry;
}

export interface SweeperOptions {
  reconnectGraceMs?: number;
  intervalMs?: number;
}

export class DeadlineSweeper {
  private timer: NodeJS.Timeout | null = null;
  private readonly graceMs: number;
  private readonly intervalMs: number;

  constructor(
    private readonly ctx: SweeperContext,
    options: SweeperOptions = {},
  ) {
    this.graceMs = options.reconnectGraceMs ?? RECONNECT_GRACE_MS;
    this.intervalMs = options.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick(Date.now());
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One sweep. Returns `true` when the world changed (so a caller can
   * assert on it in tests).
   */
  tick(now: number): boolean {
    let changed = false;
    for (const room of this.ctx.rooms.all()) {
      changed = this.forfeitExpiredSeats(room, now) || changed;
      changed = this.sweepRoom(room, now) || changed;
    }
    return changed;
  }

  /** A disconnected seat that never came back is forfeited. */
  private forfeitExpiredSeats(room: ReturnType<RoomManager["get"]> & object, now: number): boolean {
    const expired = room.players.filter((player) =>
      this.ctx.rooms.isGraceExpired(room, player, now, this.graceMs),
    );
    if (expired.length === 0) return false;
    for (const player of expired) {
      this.ctx.rooms.forfeit(room.code, player.id);
    }
    return true;
  }

  /** Prunes expired reveals and applies the engine's timeout rules. */
  private sweepRoom(room: ReturnType<RoomManager["get"]> & object, now: number): boolean {
    if (!room.state) return false;
    let changed = false;

    const pruned = pruneExpiredReveals(room.state, now);
    if (pruned !== room.state) {
      room.state = pruned;
      changed = true;
    }

    const timeout = applyTimeout(room.state, now);
    if (timeout) {
      if (!timeout.ok) {
        // The engine refused the timeout: keep the state and try again.
        return changed;
      }
      room.state = timeout.state;
      changed = true;
      for (const event of timeout.events) {
        this.ctx.io.to(room.code).emit("game:event", { event });
      }
    }

    if (this.ctx.rooms.applyPendingForfeits(room)) {
      changed = true;
    }

    if (changed) {
      broadcastViews(this.ctx, room.code, now);
    }
    return changed;
  }
}
