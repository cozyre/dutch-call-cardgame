import { LocalGameClient } from "./local-client";

/**
 * Practice mode (the plan §13 exception): the dev harness promoted to a
 * product entry. A tab-scoped in-process `LocalGameClient` that opens
 * straight into the lobby — you as host plus the three simulated opponents
 * (Maya/Jonas/Priya) — so the full game is playable offline.
 *
 * Boundaries:
 * - it never touches seat-token storage (a practice seat is not a network
 *   seat, so there is nothing to resume);
 * - the bots act only inside this tab — they can never join a real room.
 */

let singleton: LocalGameClient | null = null;

/** The tab's shared practice client. Created lazily, reused across views. */
export function getPracticeGameClient(): LocalGameClient {
  if (!singleton) singleton = new LocalGameClient({ autoStart: false });
  return singleton;
}
