import type {
  Action,
  ApplyResult,
  Card,
  DifficultyPreset,
  GameSettings,
  GameState,
  PlayerId,
  PlayerState,
  Rank,
  Reveal,
  Step,
  Suit,
} from "./types";
import { applyAction, applyTimeout, createLobbyState } from "./engine";
import { settingsForPreset } from "./difficulty";
import { nextFloat, nextInt } from "./rng";

/**
 * Test helpers for the engine. Pure TypeScript, no test framework imports,
 * so it can be used from vitest specs and from the bench harness.
 */

export function makePlayers(count: number): PlayerState[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `Player ${index + 1}`,
    seat: index,
    isHost: index === 0,
    connected: true,
    grid: [],
    peekTokens: 0,
    queenTokens: 0,
    disconnectedAt: null,
  }));
}

export interface MakeStateOptions {
  playerCount?: number;
  preset?: DifficultyPreset;
  settings?: GameSettings;
  seed?: number;
}

export function makeState(options: MakeStateOptions = {}): GameState {
  const {
    playerCount = 3,
    preset = "easy",
    settings = settingsForPreset(preset),
    seed = 12345,
  } = options;
  return createLobbyState(settings, makePlayers(playerCount), seed);
}

export function card(rank: Rank, suit: Suit, deck = 0): Card {
  return { id: `d${deck}-${suit}-${rank}`, deck, suit, rank };
}

export function expectOk(result: ApplyResult): GameState {
  if (!result.ok) {
    throw new Error(
      `expected the action to succeed, got error ${result.error.code}: ${result.error.message}`,
    );
  }
  return result.state;
}

export function expectError(result: ApplyResult): string {
  if (result.ok) {
    throw new Error("expected the action to fail, but it succeeded");
  }
  return result.error.code;
}

export function act(
  state: GameState,
  action: Action,
  actor: PlayerId,
  now: number,
): ApplyResult {
  return applyAction(state, action, actor, { now });
}

/** Total number of cards held by players and piles (plus the in-flight draw). */
export function countCards(state: GameState): number {
  let total = 0;
  for (const player of state.players) total += player.grid.length;
  total += state.drawPile.length;
  total += state.discardPile.length;
  if (state.step.kind === "awaitChoice") total += 1;
  return total;
}
/** Every card id in the state, for uniqueness / conservation assertions. */
export function allIds(state: GameState): string[] {
  const ids: string[] = [];
  for (const player of state.players) {
    for (const entry of player.grid) ids.push(entry.id);
  }
  for (const entry of state.drawPile) ids.push(entry.id);
  for (const entry of state.discardPile) ids.push(entry.id);
  if (state.step.kind === "awaitChoice") ids.push(state.step.drawn.id);
  return ids;
}

export interface FixtureOptions {
  /** One grid per player, in seat order. */
  grids: Card[][];
  drawPile?: Card[];
  discardPile?: Card[];
  step?: Step;
  turnIndex?: number;
  peekTokens?: number[];
  queenTokens?: number[];
  dutchCallerId?: PlayerId | null;
  burnableBy?: PlayerId[];
  reveals?: Reveal[];
  phase?: GameState["phase"];
  settings?: GameSettings;
}

/**
 * Builds a ready-to-play state by hand so a rule can be exercised in
 * isolation (a grid holding a Jack, a player with one card left, ...).
 */
export function makeFixture(options: FixtureOptions): GameState {
  const {
    grids,
    drawPile = [],
    discardPile = [],
    step = { kind: "turnStart" },
    turnIndex = 0,
    peekTokens = [],
    queenTokens = [],
    dutchCallerId = null,
    burnableBy = [],
    reveals = [],
    phase = "playing",
    settings = settingsForPreset("easy"),
  } = options;

  const players: PlayerState[] = grids.map((grid, index) => ({
    id: `p${index}`,
    name: `Player ${index + 1}`,
    seat: index,
    isHost: index === 0,
    connected: true,
    grid,
    peekTokens: peekTokens[index] ?? 0,
    queenTokens: queenTokens[index] ?? 0,
    disconnectedAt: null,
  }));

  return {
    phase,
    step,
    settings,
    players,
    turnIndex,
    drawPile,
    discardPile,
    dutchCallerId,
    burnableBy,
    reveals,
    batchPeeks: [],
    rngSeed: 1,
    rngState: 1,
    startedAt: 0,
    result: null,
  };
}

/* ------------------------------------------------------------------ */
/* random game harness                                                 */
/* ------------------------------------------------------------------ */

/** Thin stateful wrapper around the seeded PRNG. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    const draw = nextFloat(this.state);
    this.state = draw.state;
    return draw.value;
  }

  int(maxExclusive: number): number {
    const draw = nextInt(this.state, maxExclusive);
    this.state = draw.state;
    return draw.value;
  }
}

export interface GameRun {
  state: GameState;
  steps: number;
  violations: string[];
}

export interface PlayOptions {
  seed: number;
  playerCount?: number;
  preset?: DifficultyPreset;
  maxSteps?: number;
}

/**
 * Plays a whole game with a random-but-legal policy.
 *
 * The policy cheats on purpose (it reads the truth to find a matching card)
 * so the harness can reach the rare branches: abilities, Dutch calls and
 * game over conditions.
 */
export function playRandomGame(options: PlayOptions): GameRun {
  const { seed, playerCount = 3, preset = "easy", maxSteps = 5_000 } = options;
  const rng = new Rng(seed);
  let state = makeState({ playerCount, preset, seed });
  const total = 52 * state.settings.deckCount;
  const violations: string[] = [];
  let now = 0;
  let steps = 0;

  while (state.phase !== "over" && steps < maxSteps) {
    steps += 1;

    const ids = allIds(state);
    if (state.phase !== "lobby") {
      if (ids.length !== total) {
        violations.push(`card count ${ids.length} != ${total} at step ${steps}`);
      }
      if (new Set(ids).size !== ids.length) {
        violations.push(`duplicate card id at step ${steps}`);
      }
    }

    const choice = nextAction(state, rng);
    if (choice) {
      const result = applyAction(state, choice.action, choice.actor, { now });
      if (!result.ok) {
        violations.push(
          `illegal action ${choice.action.type} rejected (${result.error.code}) at step ${steps}`,
        );
        break;
      }
      state = result.state;
      now += 1_000;
    } else {
      now += 31_000;
      const timedOut = applyTimeout(state, now);
      if (!timedOut) {
        violations.push(`stuck in step ${state.step.kind} at step ${steps}`);
        break;
      }
      if (!timedOut.ok) {
        violations.push(`timeout failed at step ${steps}`);
        break;
      }
      state = timedOut.state;
    }
  }

  if (state.phase !== "over") {
    violations.push(`game did not end within ${steps} steps`);
  }
  if (!state.result) {
    violations.push("game over without a result");
  }
  return { state, steps, violations };
}

function nextAction(
  state: GameState,
  rng: Rng,
): { action: Action; actor: PlayerId } | null {
  const step = state.step;
  switch (step.kind) {
    case "lobby": {
      const host = state.players.find((player) => player.isHost);
      return host ? { action: { type: "startGame" }, actor: host.id } : null;
    }
    case "setupPeek": {
      const player = state.players.find((entry) => entry.peekTokens > 0);
      if (!player) return null;
      return { action: { type: "peek", cardIndex: rng.int(player.grid.length) }, actor: player.id };
    }
    case "turnStart": {
      const active = state.players[state.turnIndex];
      if (!active) return null;
      if (
        active.grid.length === 1 &&
        state.dutchCallerId === null &&
        rng.next() < 0.4
      ) {
        return { action: { type: "dutchCall" }, actor: active.id };
      }
      return { action: { type: "draw" }, actor: active.id };
    }
    case "awaitChoice": {
      const active = state.players[state.turnIndex];
      if (!active) return null;
      if (active.grid.length > 0 && rng.next() < 0.5) {
        return {
          action: { type: "swapDrawn", cardIndex: rng.int(active.grid.length) },
          actor: active.id,
        };
      }
      return { action: { type: "discardDrawn" }, actor: active.id };
    }
    case "matchWindow": {
      for (const playerId of state.burnableBy) {
        const player = state.players.find((entry) => entry.id === playerId);
        if (!player) continue;
        const index = player.grid.findIndex((card) => card.rank === step.rank);
        if (index >= 0) {
          return { action: { type: "burn", cardIndex: index }, actor: playerId };
        }
      }
      return null;
    }
    case "awaitPeek": {
      const player = state.players.find((entry) => entry.peekTokens > 0);
      if (!player || player.grid.length === 0) return null;
      const used = state.batchPeeks
        .filter((entry) => entry.playerId === player.id)
        .map((entry) => entry.cardIndex);
      const options = player.grid
        .map((_, index) => index)
        .filter((index) => !used.includes(index));
      if (options.length === 0) return null;
      return {
        action: { type: "peek", cardIndex: options[rng.int(options.length)] },
        actor: player.id,
      };
    }
    case "awaitQueenSwap": {
      if (!step.resolverId) return null;
      const resolver = state.players.find((entry) => entry.id === step.resolverId);
      if (!resolver || resolver.grid.length === 0) return null;
      const other = state.players.find(
        (entry) => entry.id !== resolver.id && entry.grid.length > 0,
      );
      // Sometimes swap two cards of one grid, sometimes two grids.
      if (resolver.grid.length > 1 && rng.next() < 0.3) {
        const first = rng.int(resolver.grid.length);
        let second = rng.int(resolver.grid.length);
        if (second === first) second = (second + 1) % resolver.grid.length;
        return {
          action: {
            type: "queenSwap",
            a: { playerId: resolver.id, cardIndex: first },
            b: { playerId: resolver.id, cardIndex: second },
          },
          actor: resolver.id,
        };
      }
      if (other && rng.next() < 0.7) {
        return {
          action: {
            type: "queenSwap",
            a: { playerId: resolver.id, cardIndex: rng.int(resolver.grid.length) },
            b: { playerId: other.id, cardIndex: rng.int(other.grid.length) },
          },
          actor: resolver.id,
        };
      }
      return { action: { type: "declineQueen" }, actor: resolver.id };
    }
    case "gameOver":
      return null;
    default:
      return null;
  }
}
