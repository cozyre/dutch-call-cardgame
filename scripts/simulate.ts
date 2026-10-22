/**
 * Headless simulation over the real socket (plan §7).
 *
 * Starts the game server in-process, connects bot clients over TCP and
 * plays complete games. The point is not to play well — it is to prove
 * that the server survives real traffic: every game reaches `gameOver`,
 * no bot ever gets an error, and no client ever sees another player's
 * cards.
 *
 *   npm run sim            # 5 games of 3 players
 *   npm run sim -- 20 6    # 20 games of 6 players
 */

import { createGameServer } from "../src/server/app";
import { Bot, delay } from "../src/server/bots";
import type { GameState, Rank, Suit } from "../src/game/types";
import type { Room } from "../src/server/rooms";

const gameCount = Number(process.argv[2] ?? 5);
const playerCount = Number(process.argv[3] ?? 3);

/**
 * A refusal is not a failure. A client that acts on a view which has
 * already gone stale gets its action refused — that is the server doing
 * its job, and it is the behaviour the plan asks for ("no illegal action
 * ever succeeds"). These codes are therefore expected.
 */
const EXPECTED_REFUSALS = new Set([
  "WRONG_PHASE",
  "NOT_YOUR_TURN",
  "NOT_ALLOWED",
  "OUT_OF_RANGE",
  "ALREADY_USED",
  "EMPTY_PILE",
]);

interface GameResult {
  code: string;
  durationMs: number;
  winner: string | null;
  total: number | null;
  /** Refusals the server made, which are expected under a fast simulation. */
  refusals: number;
  /** Anything that is not a refusal — these fail the simulation. */
  errors: string[];
}

/**
 * Shortens the deadline of the current step so the simulation runs fast.
 * The step still lives for a moment, so a bot that is about to act gets
 * the chance to do so. A step is only shortened once — otherwise the
 * deadline would be pushed forward forever and the game would never move.
 */
function shortenDeadline(room: Room, shortened: Set<number>): void {
  const state = room.state;
  if (!state) return;
  const step = state.step;
  if (!("deadlineAt" in step) || typeof step.deadlineAt !== "number") return;
  if (shortened.has(step.deadlineAt)) return;
  shortened.add(step.deadlineAt);
  const soon = Date.now() + 25;
  state.step = { ...step, deadlineAt: soon };
  shortened.add(soon);
}

function pair(card: { rank: Rank; suit: Suit }): string {
  return `${card.rank}${card.suit}`;
}

/**
 * Collects every card identity that reaches a client and checks it against
 * what the client was allowed to know. A leak shows up as an identity that
 * is neither on the discard pile nor in the client's own grid.
 */
async function checkForLeaks(
  bots: Bot[],
  state: GameState,
): Promise<string[]> {
  const leaks: string[] = [];
  for (const bot of bots) {
    const allowed = new Set<string>();
    for (const card of state.discardPile) allowed.add(pair(card));
    const me = state.players.find((player) => player.name === bot.name);
    for (const card of me?.grid ?? []) allowed.add(pair(card));

    const seen = new Set<string>();
    for (const payload of bot.raw) {
      if (!payload || typeof payload !== "object") continue;
      const record = payload as Record<string, unknown>;
      const view = record.view as Record<string, unknown> | undefined;
      if (view?.phase === "over") continue;
      const event = record.event as Record<string, unknown> | undefined;
      if (event?.type === "gameOver") continue;
      collect(payload, seen);
    }

    for (const identity of seen) {
      if (!allowed.has(identity)) leaks.push(`${bot.name} saw ${identity}`);
    }
  }
  return leaks;
}

function collect(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out);
    return;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.rank === "string" && typeof record.suit === "string") {
      out.add(`${record.rank}${record.suit}`);
    }
    for (const entry of Object.values(record)) collect(entry, out);
  }
}

async function playGame(
  server: ReturnType<typeof createGameServer>,
  url: string,
  index: number,
): Promise<GameResult> {
  const names = Array.from({ length: playerCount }, (_, seat) => `Bot ${index}.${seat}`);
  const bots = names.map((name) => new Bot({ name, url }));
  const errors: string[] = [];
  let refusals = 0;
  const started = Date.now();

  await Promise.all(bots.map((bot) => bot.connect()));

  const code = await bots[0].createRoom();
  for (const bot of bots.slice(1)) await bot.joinRoom(code);
  await bots[0].waitFor(() => bots[0].lobby?.players.length === playerCount);

  bots[0].act({ type: "startGame" });
  await bots[0].waitFor(() => bots[0].view?.phase === "playing");

  const deadline = Date.now() + 60_000;
  const shortened = new Set<number>();
  while (bots[0].view?.phase !== "over") {
    if (Date.now() > deadline) {
      errors.push(`game ${code} did not finish`);
      break;
    }
    const room = server.rooms.get(code);
    if (room) {
      shortenDeadline(room, shortened);
      server.sweeper.tick(Date.now());
    }
    await delay(1);
  }

  const state = server.rooms.get(code)?.state;
  if (state) {
    const leaks = await checkForLeaks(bots, state);
    errors.push(...leaks);
  }

  for (const bot of bots) {
    for (const error of bot.errors) {
      if (EXPECTED_REFUSALS.has(error.code)) {
        refusals += 1;
        continue;
      }
      errors.push(
        `${bot.name}: ${error.code} (${JSON.stringify(error.action)} in ${error.step})`,
      );
    }
    bot.close();
  }

  const result = state?.result ?? null;
  return {
    code,
    durationMs: Date.now() - started,
    winner: result?.[0]?.name ?? null,
    total: result?.[0]?.total ?? null,
    refusals,
    errors,
  };
}

async function main(): Promise<void> {
  const server = createGameServer({ autoStart: false, secret: "simulation" });
  const port = await server.listen(0);
  const url = `http://localhost:${port}`;
  console.log(`simulation server on ${url}`);

  const results: GameResult[] = [];
  for (let index = 0; index < gameCount; index++) {
    const result = await playGame(server, url, index);
    results.push(result);
    const status = result.errors.length ? "FAIL" : "ok";
    console.log(
      `game ${index + 1}/${gameCount} ${status} — winner ${result.winner ?? "?"} ` +
        `with ${result.total ?? "?"} points in ${result.durationMs}ms ` +
        `(${result.refusals} stale actions refused)` +
        (result.errors.length ? ` — ${result.errors.slice(0, 3).join("; ")}` : ""),
    );
  }

  await server.close();

  const failures = results.filter((result) => result.errors.length);
  const duration = results.reduce((sum, result) => sum + result.durationMs, 0);
  console.log(
    `\n${results.length - failures.length}/${results.length} games clean, ` +
      `${Math.round(duration / results.length)}ms per game`,
  );
  if (failures.length) {
    console.error("simulation failed");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
