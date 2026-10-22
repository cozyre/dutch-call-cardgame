import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PlayerId } from "../game/types";

/**
 * Seat tokens and connection ↔ seat binding (plan §7).
 *
 * A seat token is the only proof a returning player has of their seat.
 * It is random, signed with a server secret, and handed to the client once
 * (the client keeps it in `localStorage`). The server never trusts a
 * player id that arrives over the wire — it re-derives it from the token.
 */

const TOKEN_VERSION = "v1";

/** Issues and verifies signed, random seat tokens. */
export class SeatTokenService {
  private readonly secret: Buffer;

  constructor(secret?: string) {
    this.secret = Buffer.from(
      secret && secret.length > 0 ? secret : randomBytes(32).toString("hex"),
      "utf8",
    );
  }

  /** A fresh token for `playerId`. */
  issue(playerId: PlayerId): string {
    const nonce = randomBytes(16).toString("hex");
    const signature = this.sign(`${playerId}.${nonce}`);
    return `${TOKEN_VERSION}.${playerId}.${nonce}.${signature}`;
  }

  /** The player id encoded in the token, or `null` if it is not authentic. */
  verify(token: string): PlayerId | null {
    const parts = token.split(".");
    if (parts.length !== 4) return null;
    const [version, playerId, nonce, signature] = parts;
    if (version !== TOKEN_VERSION) return null;
    if (!playerId || !nonce || !signature) return null;
    const expected = this.sign(`${playerId}.${nonce}`);
    const given = Buffer.from(signature, "utf8");
    const wanted = Buffer.from(expected, "utf8");
    if (given.length !== wanted.length) return null;
    if (!timingSafeEqual(given, wanted)) return null;
    return playerId;
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("base64url");
  }
}

export interface SeatBinding {
  code: string;
  playerId: PlayerId;
}

/**
 * Maps live socket connections onto seats. One socket holds at most one
 * seat at a time; a seat may be re-bound to a new socket when a player
 * reconnects.
 */
export class SessionRegistry {
  private readonly bySocket = new Map<string, SeatBinding>();
  private readonly socketsBySeat = new Map<string, Set<string>>();

  bind(socketId: string, binding: SeatBinding): void {
    this.release(socketId);
    this.bySocket.set(socketId, binding);
    const key = seatKey(binding.code, binding.playerId);
    const sockets = this.socketsBySeat.get(key) ?? new Set<string>();
    sockets.add(socketId);
    this.socketsBySeat.set(key, sockets);
  }

  seatOf(socketId: string): SeatBinding | null {
    return this.bySocket.get(socketId) ?? null;
  }

  /** Every socket currently attached to a seat (a seat may have several). */
  socketsOf(code: string, playerId: PlayerId): string[] {
    const sockets = this.socketsBySeat.get(seatKey(code, playerId));
    return sockets ? [...sockets] : [];
  }

  /** Drops a socket binding. Returns the seat it held, if any. */
  release(socketId: string): SeatBinding | null {
    const binding = this.bySocket.get(socketId);
    if (!binding) return null;
    this.bySocket.delete(socketId);
    const key = seatKey(binding.code, binding.playerId);
    const sockets = this.socketsBySeat.get(key);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) this.socketsBySeat.delete(key);
    }
    return binding;
  }
}

function seatKey(code: string, playerId: PlayerId): string {
  return `${code}:${playerId}`;
}
