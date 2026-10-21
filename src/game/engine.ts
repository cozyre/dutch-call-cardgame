import type {
  Action,
  ApplyResult,
  Card,
  Ctx,
  GameEvent,
  GameSettings,
  GameState,
  PlayerId,
  PlayerState,
  Rank,
  Reveal,
  Target,
} from "./types";
import { gameError } from "./errors";
import { buildDeck, deal } from "./deck";
import { shuffle } from "./rng";
import { standings } from "./scoring";
import {
  grantJackToAll,
  grantQueenTo,
  swapGridCards,
  validateQueenSwap,
} from "./abilities";

/** PRD §10 — server enforced timers (ms). */
export const DRAW_DECISION_MS = 30_000;
export const MATCH_WINDOW_MS = 30_000;
export const SETUP_PEEK_MS = 30_000;
export const ABILITY_WINDOW_MS = 30_000;
/** Plan A5 — a reveal is served for 8 seconds, then it is dropped for good. */
export const REVEAL_MS = 8_000;

/**
 * The engine is a pure reducer: no `Date.now()`, no `Math.random()`, no I/O.
 * Time arrives through `ctx.now`, randomness through `GameState.rngState`.
 */
export function createLobbyState(
  settings: GameSettings,
  players: PlayerState[],
  seed: number,
): GameState {
  return {
    phase: "lobby",
    step: { kind: "lobby" },
    settings,
    players: players.map((player, seat) => ({
      ...player,
      seat,
      grid: [],
      peekTokens: 0,
      queenTokens: 0,
      disconnectedAt: null,
    })),
    turnIndex: 0,
    drawPile: [],
    discardPile: [],
    dutchCallerId: null,
    burnableBy: [],
    reveals: [],
    rngSeed: seed,
    rngState: seed,
    startedAt: 0,
    result: null,
    batchPeeks: [],
  };
}

export function applyAction(
  state: GameState,
  action: Action,
  actor: PlayerId,
  ctx: Ctx,
): ApplyResult {
  const pruned = pruneExpiredReveals(state, ctx.now);
  switch (action.type) {
    case "startGame":
      return handleStartGame(pruned, actor, ctx);
    case "peek":
      return handlePeek(pruned, actor, action.cardIndex, ctx);
    case "selectCard":
      return handleSelectCard(pruned, actor, action.cardIndex);
    case "draw":
      return handleDraw(pruned, actor, ctx);
    case "discardDrawn":
      return handleDiscardDrawn(pruned, actor, ctx);
    case "swapDrawn":
      return handleSwapDrawn(pruned, actor, action.cardIndex, ctx);
    case "burn":
      return handleBurn(pruned, actor, action.cardIndex, ctx);
    case "dutchCall":
      return handleDutchCall(pruned, actor, ctx);
    case "queenSwap":
      return handleQueenSwap(pruned, actor, action.a, action.b, ctx);
    case "declineQueen":
      return handleDeclineQueen(pruned, actor, ctx);
    default:
      return { ok: false, error: gameError("INVALID_ACTION", "Unknown action.") };
  }
}

/**
 * Server enforced default handling (PRD §10 / plan §4.5).
 * Returns `null` when nothing timed out.
 */
export function applyTimeout(state: GameState, now: number): ApplyResult | null {
  const pruned = pruneExpiredReveals(state, now);
  const ctx: Ctx = { now };

  switch (pruned.step.kind) {
    case "setupPeek": {
      const deadline = pruned.step.deadlineAt;
      if (deadline === null || now < deadline) return null;
      return { ok: true, state: beginFirstTurn(pruned), events: [] };
    }
    case "awaitChoice": {
      if (now < pruned.step.deadlineAt) return null;
      const actor = activePlayer(pruned);
      if (!actor) return null;
      const selected = pruned.step.selectedIndex;
      if (selected !== null) {
        const swapped = handleSwapDrawn(pruned, actor.id, selected, ctx);
        if (swapped.ok) return swapped;
      }
      return handleDiscardDrawn(pruned, actor.id, ctx);
    }
    case "matchWindow": {
      if (now < pruned.step.deadlineAt) return null;
  const closed = closeMatchWindow(pruned, pruned.step.kind === "matchWindow" ? pruned.step.deadlineAt : now);
  return { ok: true, state: closed.state, events: closed.events };
    }
    case "awaitPeek": {
      const deadline = pruned.step.deadlineAt;
      if (deadline === null || now < deadline) return null;
  const after = afterPeekPhase(pruned, now);
  return { ok: true, state: after.state, events: after.events };
    }
    case "awaitQueenSwap": {
      const deadline = pruned.step.deadlineAt;
      if (deadline === null || now < deadline) return null;
      const players = pruned.players.map((player) => ({ ...player, queenTokens: 0 }));
      const advanced = advanceTurn({ ...pruned, players });
      return { ok: true, state: advanced.state, events: advanced.events };
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* handlers                                                            */
/* ------------------------------------------------------------------ */

function handleStartGame(state: GameState, actor: PlayerId, ctx: Ctx): ApplyResult {
  if (state.phase !== "lobby" || state.step.kind !== "lobby") {
    return { ok: false, error: gameError("WRONG_PHASE", "The game has already started.") };
  }
  const host = state.players.find((player) => player.id === actor);
  if (!host) {
    return { ok: false, error: gameError("PLAYER_NOT_FOUND", "Unknown player.") };
  }
  if (!host.isHost) {
    return { ok: false, error: gameError("NOT_ALLOWED", "Only the host can start the game.") };
  }
  if (state.players.length < 3 || state.players.length > 6) {
    return {
      ok: false,
      error: gameError("NOT_ALLOWED", "A game needs between 3 and 6 players."),
    };
  }

  const { cardsPerPlayer, deckCount } = state.settings;
  const deck = buildDeck(deckCount);
  const shuffled = shuffle(deck, state.rngState);
  const { hands, drawPile } = deal(shuffled.items, state.players.length, cardsPerPlayer);

  const players = state.players.map((player, index) => ({
    ...player,
    grid: hands[index] ?? [],
    peekTokens: 1,
    queenTokens: 0,
  }));

  const next: GameState = {
    ...state,
    phase: "playing",
    step: { kind: "setupPeek", deadlineAt: ctx.now + SETUP_PEEK_MS },
    players,
    turnIndex: 0,
    drawPile,
    discardPile: [],
    dutchCallerId: null,
    burnableBy: [],
    reveals: [],
    rngState: shuffled.state,
    startedAt: ctx.now,
    result: null,
    batchPeeks: [],
  };

  return { ok: true, state: next, events: [{ type: "gameStarted" }] };
}

function handlePeek(
  state: GameState,
  actor: PlayerId,
  cardIndex: number,
  ctx: Ctx,
): ApplyResult {
  if (state.step.kind !== "setupPeek" && state.step.kind !== "awaitPeek") {
    return { ok: false, error: gameError("WRONG_PHASE", "There is no peek to make right now.") };
  }
  const player = state.players.find((entry) => entry.id === actor);
  if (!player) {
    return { ok: false, error: gameError("PLAYER_NOT_FOUND", "Unknown player.") };
  }
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.grid.length) {
    return { ok: false, error: gameError("OUT_OF_RANGE", "That card is not in your grid.") };
  }
  if (state.batchPeeks.some((entry) => entry.playerId === actor && entry.cardIndex === cardIndex)) {
    return {
      ok: false,
      error: gameError("ALREADY_USED", "You already peeked at that card in this batch."),
    };
  }
  if (player.peekTokens <= 0) {
    return { ok: false, error: gameError("NOT_ALLOWED", "You have no peek tokens left.") };
  }

  const players = updatePlayer(state.players, actor, (entry) => ({
    ...entry,
    peekTokens: entry.peekTokens - 1,
  }));
  const reveal: Reveal = { playerId: actor, cardIndex, until: ctx.now + REVEAL_MS };
  const next: GameState = {
    ...state,
    players,
    reveals: [...state.reveals, reveal],
    batchPeeks: [...state.batchPeeks, { playerId: actor, cardIndex }],
  };

  const events: GameEvent[] = [{ type: "peeked", playerId: actor, cardIndex }];

  if (state.step.kind === "setupPeek") {
    if (players.every((entry) => entry.peekTokens === 0)) {
      return { ok: true, state: beginFirstTurn(next), events };
    }
    return { ok: true, state: next, events };
  }

  if (players.every((entry) => entry.peekTokens === 0)) {
  const after = afterPeekPhase(next, ctx.now);
  return { ok: true, state: after.state, events: events.concat(after.events) };
  }
  return { ok: true, state: next, events };
}

function handleSelectCard(
  state: GameState,
  actor: PlayerId,
  cardIndex: number,
): ApplyResult {
  if (state.step.kind !== "awaitChoice") {
    return {
      ok: false,
      error: gameError("WRONG_PHASE", "You can only select a card after drawing."),
    };
  }
  const active = activePlayer(state);
  if (!active || active.id !== actor) {
    return { ok: false, error: gameError("NOT_YOUR_TURN", "It is not your turn.") };
  }
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= active.grid.length) {
    return { ok: false, error: gameError("OUT_OF_RANGE", "That card is not in your grid.") };
  }
  const step = state.step;
  return {
    ok: true,
    state: { ...state, step: { ...step, selectedIndex: cardIndex } },
    events: [],
  };
}

function handleDraw(state: GameState, actor: PlayerId, ctx: Ctx): ApplyResult {
  if (state.step.kind !== "turnStart") {
    return {
      ok: false,
      error: gameError("WRONG_PHASE", "You can only draw at the start of your turn."),
    };
  }
  const active = activePlayer(state);
  if (!active || active.id !== actor) {
    return { ok: false, error: gameError("NOT_YOUR_TURN", "It is not your turn.") };
  }
  if (state.drawPile.length === 0) {
    return { ok: false, error: gameError("EMPTY_PILE", "The center pile is empty.") };
  }
  const drawn = state.drawPile[0];
  const next: GameState = {
    ...state,
    drawPile: state.drawPile.slice(1),
    step: {
      kind: "awaitChoice",
      drawn,
      deadlineAt: ctx.now + DRAW_DECISION_MS,
      selectedIndex: null,
    },
  };
  return { ok: true, state: next, events: [{ type: "cardDrawn", playerId: actor }] };
}

function handleDiscardDrawn(state: GameState, actor: PlayerId, ctx: Ctx): ApplyResult {
  if (state.step.kind !== "awaitChoice") {
    return {
      ok: false,
      error: gameError("WRONG_PHASE", "There is no drawn card to discard."),
    };
  }
  const active = activePlayer(state);
  if (!active || active.id !== actor) {
    return { ok: false, error: gameError("NOT_YOUR_TURN", "It is not your turn.") };
  }
  const drawn = state.step.drawn;
  const events: GameEvent[] = [
    { type: "cardDiscarded", playerId: actor, rank: drawn.rank, suit: drawn.suit },
  ];
  const players = applyDiscardAbilities(state.players, actor, drawn, events);
  const next: GameState = openWindow(
    { ...state, players, discardPile: [...state.discardPile, drawn] },
    drawn.rank,
    ctx,
  );
  return { ok: true, state: next, events };
}

function handleSwapDrawn(
  state: GameState,
  actor: PlayerId,
  cardIndex: number,
  ctx: Ctx,
): ApplyResult {
  if (state.step.kind !== "awaitChoice") {
    return { ok: false, error: gameError("WRONG_PHASE", "There is no drawn card to swap.") };
  }
  const active = activePlayer(state);
  if (!active || active.id !== actor) {
    return { ok: false, error: gameError("NOT_YOUR_TURN", "It is not your turn.") };
  }
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= active.grid.length) {
    return { ok: false, error: gameError("OUT_OF_RANGE", "That card is not in your grid.") };
  }

  const drawn = state.step.drawn;
  const swappedOut = active.grid[cardIndex];
  const grid = active.grid.slice();
  grid[cardIndex] = drawn;

  const players = updatePlayer(state.players, actor, (entry) => ({ ...entry, grid }));
  const events: GameEvent[] = [
    { type: "cardDiscarded", playerId: actor, rank: swappedOut.rank, suit: swappedOut.suit },
  ];
  const withAbilities = applyDiscardAbilities(players, actor, swappedOut, events);
  const next: GameState = openWindow(
    { ...state, players: withAbilities, discardPile: [...state.discardPile, swappedOut] },
    swappedOut.rank,
    ctx,
  );
  return { ok: true, state: next, events };
}

function handleBurn(
  state: GameState,
  actor: PlayerId,
  cardIndex: number,
  ctx: Ctx,
): ApplyResult {
  if (state.step.kind !== "matchWindow") {
    return { ok: false, error: gameError("WRONG_PHASE", "There is no match window open.") };
  }
  if (!state.burnableBy.includes(actor)) {
    return {
      ok: false,
      error: gameError("NOT_ALLOWED", "You cannot discard a matching card right now."),
    };
  }
  const player = state.players.find((entry) => entry.id === actor);
  if (!player) {
    return { ok: false, error: gameError("PLAYER_NOT_FOUND", "Unknown player.") };
  }
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.grid.length) {
    return { ok: false, error: gameError("OUT_OF_RANGE", "That card is not in your grid.") };
  }

  const card = player.grid[cardIndex];
  const correct = card.rank === state.step.rank;

  if (correct) {
    const grid = player.grid.filter((_, index) => index !== cardIndex);
    let players = updatePlayer(state.players, actor, (entry) => ({ ...entry, grid }));
    const events: GameEvent[] = [
      { type: "burned", playerId: actor, rank: card.rank, correct: true },
    ];

    players = applyDiscardAbilities(players, actor, card, events);

    const next: GameState = {
      ...state,
      players,
      discardPile: [...state.discardPile, card],
    };

    if (grid.length === 0) {
      const over = endGame(next);
      if (!over.ok) return over;
      return { ok: true, state: over.state, events: events.concat(over.events) };
    }

    return { ok: true, state: next, events };
  }

  // Wrong burn: the card returns face down to its original slot and the
  // player takes one penalty card from the top of the center pile (plan A3).
  const events: GameEvent[] = [
    { type: "burned", playerId: actor, rank: card.rank, correct: false },
  ];
  let players = state.players;
  let drawPile = state.drawPile;

  if (drawPile.length > 0) {
    const penalty = drawPile[0];
    drawPile = drawPile.slice(1);
    players = updatePlayer(players, actor, (entry) => ({
      ...entry,
      grid: [...entry.grid, penalty],
    }));
    events.push({ type: "penaltyAdded", playerId: actor });
  }

  const next: GameState = {
    ...state,
    players,
    drawPile,
    burnableBy: state.burnableBy.filter((id) => id !== actor),
  };

  if (next.burnableBy.length === 0) {
    const closed = closeMatchWindow(next, ctx.now);
    return { ok: true, state: closed.state, events: events.concat(closed.events) };
  }
  return { ok: true, state: next, events };
}

function handleDutchCall(state: GameState, actor: PlayerId, _ctx: Ctx): ApplyResult {
  if (state.step.kind !== "turnStart") {
    return {
      ok: false,
      error: gameError("WRONG_PHASE", "Dutch Call can only be declared at the start of your turn."),
    };
  }
  const active = activePlayer(state);
  if (!active || active.id !== actor) {
    return { ok: false, error: gameError("NOT_YOUR_TURN", "It is not your turn.") };
  }
  if (active.grid.length !== 1) {
    return {
      ok: false,
      error: gameError("NOT_ALLOWED", "Dutch Call needs exactly one card left in your grid."),
    };
  }
  if (state.dutchCallerId) {
    return { ok: false, error: gameError("NOT_ALLOWED", "A Dutch Call is already in play.") };
  }

  const next: GameState = { ...state, dutchCallerId: actor, burnableBy: [] };
  const advanced = advanceTurn(next);
  return {
    ok: true,
    state: advanced.state,
    events: ([{ type: "dutchCalled" as const, playerId: actor }] as GameEvent[]).concat(
      advanced.events,
    ),
  };
}

function handleQueenSwap(
  state: GameState,
  actor: PlayerId,
  a: Target,
  b: Target,
  ctx: Ctx,
): ApplyResult {
  if (state.step.kind !== "awaitQueenSwap") {
    return { ok: false, error: gameError("WRONG_PHASE", "There is no queen swap to make.") };
  }
  if (!state.step.resolverId) {
    return { ok: false, error: gameError("NOT_ALLOWED", "No queen swap is pending.") };
  }
  if (state.step.resolverId !== actor) {
    return {
      ok: false,
      error: gameError("NOT_YOUR_TURN", "It is not your turn to resolve a queen swap."),
    };
  }
  const player = state.players.find((entry) => entry.id === actor);
  if (!player || player.queenTokens <= 0) {
    return { ok: false, error: gameError("NOT_ALLOWED", "You have no queen tokens left.") };
  }

  const validation = validateQueenSwap(state.players, a, b);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const players = updatePlayer(state.players, actor, (entry) => ({
    ...entry,
    queenTokens: entry.queenTokens - 1,
  }));
  const swapped = swapGridCards(players, a, b);

  const next: GameState = { ...state, players: swapped };
  const after = afterQueenResolved(next, ctx.now);
  const events: GameEvent[] = [{ type: "queenSwapped", a, b }, ...after.events];
  return { ok: true, state: after.state, events };
}

function handleDeclineQueen(state: GameState, actor: PlayerId, ctx: Ctx): ApplyResult {
  if (state.step.kind !== "awaitQueenSwap") {
    return { ok: false, error: gameError("WRONG_PHASE", "There is no queen swap to decline.") };
  }
  if (!state.step.resolverId) {
    return { ok: false, error: gameError("NOT_ALLOWED", "No queen swap is pending.") };
  }
  if (state.step.resolverId !== actor) {
    return {
      ok: false,
      error: gameError("NOT_YOUR_TURN", "It is not your turn to resolve a queen swap."),
    };
  }
  const player = state.players.find((entry) => entry.id === actor);
  if (!player || player.queenTokens <= 0) {
    return { ok: false, error: gameError("NOT_ALLOWED", "You have no queen tokens left.") };
  }

  const players = updatePlayer(state.players, actor, (entry) => ({
    ...entry,
    queenTokens: entry.queenTokens - 1,
  }));
  const next: GameState = { ...state, players };
  const after = afterQueenResolved(next, ctx.now);
  return { ok: true, state: after.state, events: after.events };
}

/* ------------------------------------------------------------------ */
/* phase helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * A card that hits the discard pile face up resolves its ability: a Jack
 * gives every player a peek token, a Queen gives the discarder a queen
 * token (plan §6.4).
 */
function applyDiscardAbilities(
  players: PlayerState[],
  discarderId: PlayerId,
  card: Card,
  events: GameEvent[],
): PlayerState[] {
  if (card.rank === "J") {
    const granted = grantJackToAll(players);
    events.push(...granted.events);
    return granted.players;
  }
  if (card.rank === "Q") {
    const granted = grantQueenTo(players, discarderId);
    events.push(...granted.events);
    return granted.players;
  }
  return players;
}

function openMatchWindow(rank: Rank, ctx: Ctx): GameState["step"] {
  return {
    kind: "matchWindow",
    rank,
    deadlineAt: ctx.now + MATCH_WINDOW_MS,
  };
}

function beginFirstTurn(state: GameState): GameState {
  const players = state.players.map((player) => ({ ...player, peekTokens: 0 }));
  return {
    ...state,
    players,
    turnIndex: 0,
    step: { kind: "turnStart" },
    burnableBy: [],
  };
}

/**
 * A match window only ever opens for the active player's discard. Burns
 * inside a window never open a new one (plan A1).
 */
function openWindow(state: GameState, rank: Rank, ctx: Ctx): GameState {
  return {
    ...state,
    step: openMatchWindow(rank, ctx),
    burnableBy: state.players.map((player) => player.id),
    batchPeeks: [],
  };
}

/** Closes the match window and resolves the abilities it granted. */
function closeMatchWindow(state: GameState, now: number): {
  state: GameState;
  events: GameEvent[];
} {
  if (state.players.some((player) => player.peekTokens > 0)) {
    return {
      state: {
        ...state,
        step: { kind: "awaitPeek", deadlineAt: now + ABILITY_WINDOW_MS },
        burnableBy: [],
      },
      events: [],
    };
  }
  if (state.players.some((player) => player.queenTokens > 0)) {
    const resolverId = firstQueenResolver(state.players);
    return {
      state: {
        ...state,
        step: { kind: "awaitQueenSwap", deadlineAt: now + ABILITY_WINDOW_MS, resolverId },
        burnableBy: [],
      },
      events: [],
    };
  }
  return advanceTurn(state);
}

/** Ends the peek phase: leftover tokens expire, queens resolve next. */
function afterPeekPhase(state: GameState, now: number): {
  state: GameState;
  events: GameEvent[];
} {
  const players = state.players.map((player) => ({ ...player, peekTokens: 0 }));
  const cleaned: GameState = { ...state, players };
  if (players.some((player) => player.queenTokens > 0)) {
    const resolverId = firstQueenResolver(players);
    return {
      state: {
        ...cleaned,
        step: { kind: "awaitQueenSwap", deadlineAt: now + ABILITY_WINDOW_MS, resolverId },
      },
      events: [],
    };
  }
  return advanceTurn(cleaned);
}

/** Moves the queen swap to the next token holder, or ends the phase. */
function afterQueenResolved(state: GameState, now: number): {
  state: GameState;
  events: GameEvent[];
} {
  const step = state.step;
  if (step.kind !== "awaitQueenSwap") return { state, events: [] };

  const players = state.players;
  const currentIndex = players.findIndex((player) => player.id === step.resolverId);
  for (let offset = 1; offset <= players.length; offset++) {
    const index = (currentIndex + offset) % players.length;
    const candidate = players[index];
    if (candidate && candidate.queenTokens > 0) {
      return {
        state: { ...state, step: { ...step, resolverId: candidate.id } },
        events: [],
      };
    }
  }

  const cleared: GameState = {
    ...state,
    players: players.map((player) => ({ ...player, queenTokens: 0 })),
  };
  return advanceTurn(cleared);
}

function firstQueenResolver(players: PlayerState[]): PlayerId | null {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const candidate = ordered.find((player) => player.queenTokens > 0);
  return candidate ? candidate.id : null;
}

/**
 * Ends the turn. End conditions are checked in this order:
 *  1. somebody emptied their grid → they win outright
 *  2. the center pile ran out → the final turn is over (plan A11)
 *  3. the Dutch Call rotated back to the caller → game over (plan A8)
 */
function advanceTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.players.some((player) => player.grid.length === 0)) {
    const over = endGame(state);
    if (over.ok) return { state: over.state, events: over.events };
  }
  if (state.drawPile.length === 0) {
    const over = endGame(state);
    if (over.ok) return { state: over.state, events: over.events };
  }

  const previous = state.players[state.turnIndex];
  const nextIndex = (state.turnIndex + 1) % state.players.length;
  const next: GameState = {
    ...state,
    turnIndex: nextIndex,
    step: { kind: "turnStart" },
    burnableBy: [],
  };
  const events: GameEvent[] = previous ? [{ type: "turnPassed", playerId: previous.id }] : [];

  const upcoming = state.players[nextIndex];
  if (state.dutchCallerId && upcoming && upcoming.id === state.dutchCallerId) {
    const over = endGame(next);
    if (over.ok) return { state: over.state, events: events.concat(over.events) };
  }
  return { state: next, events };
}

function endGame(state: GameState): ApplyResult {
  const result = standings(state);
  const next: GameState = {
    ...state,
    phase: "over",
    step: { kind: "gameOver" },
    burnableBy: [],
    result,
  };
  return { ok: true, state: next, events: [{ type: "gameOver", standings: result }] };
}

/* ------------------------------------------------------------------ */
/* utilities                                                           */
/* ------------------------------------------------------------------ */

export function activePlayer(state: GameState): PlayerState | undefined {
  return state.players[state.turnIndex];
}

export function updatePlayer(
  players: PlayerState[],
  playerId: PlayerId,
  update: (player: PlayerState) => PlayerState,
): PlayerState[] {
  return players.map((player) => (player.id === playerId ? update(player) : player));
}

/** Expired reveals are dropped and are never served again. */
export function pruneExpiredReveals(state: GameState, now: number): GameState {
  const live = state.reveals.filter((reveal) => reveal.until > now);
  if (live.length === state.reveals.length) return state;
  return { ...state, reveals: live };
}

/** All card ids currently held anywhere in the state (grids + piles). */
export function allCardIds(state: GameState): string[] {
  const ids: string[] = [];
  for (const player of state.players) {
    for (const card of player.grid) ids.push(card.id);
  }
  for (const card of state.drawPile) ids.push(card.id);
  for (const card of state.discardPile) ids.push(card.id);
  if (state.step.kind === "awaitChoice") ids.push(state.step.drawn.id);
  return ids;
}
