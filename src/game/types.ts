import type { GameError } from "./errors";

export type Suit = "S" | "H" | "D" | "C";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  id: string; // globally unique across decks: "d0-H-A"
  deck: number; // deck index, 0..deckCount-1
  suit: Suit;
  rank: Rank;
}

export type CardId = string;
export type PlayerId = string;

export type DifficultyPreset =
  | "easy"
  | "normal"
  | "tricky"
  | "hard"
  | "memorizer";

export interface GameSettings {
  cardsPerPlayer: number; // 1..20
  deckCount: number; // 1..3
  preset: DifficultyPreset | "custom";
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  seat: number; // 0-based join order = turn order
  isHost: boolean;
  connected: boolean;
  grid: Card[]; // TRUTH. Never leaves the server unprojected.
  peekTokens: number; // unused "reveal one of my own cards" grants
  queenTokens: number; // unused "cross-grid swap" grants
  disconnectedAt: number | null;
}

export type Step =
  | { kind: "lobby" }
  | { kind: "setupPeek"; deadlineAt: number | null }
  | { kind: "turnStart" }
  | { kind: "awaitChoice"; drawn: Card; deadlineAt: number; selectedIndex: number | null }
  | { kind: "matchWindow"; rank: Rank; deadlineAt: number }
  | { kind: "awaitPeek"; deadlineAt: number | null }
  | { kind: "awaitQueenSwap"; deadlineAt: number | null; resolverId: PlayerId | null }
  | { kind: "gameOver" };

export interface GameState {
  phase: "lobby" | "playing" | "over";
  step: Step;
  settings: GameSettings;
  players: PlayerState[];
  turnIndex: number; // index into players[] of the active player
  drawPile: Card[]; // center pile; index 0 = top
  discardPile: Card[]; // last element = top
  dutchCallerId: PlayerId | null;
  burnableBy: PlayerId[]; // players still allowed to burn in the open window
  reveals: Reveal[]; // time-limited card reveals (see §4.4)
  batchPeeks: BatchPeek[]; // cards peeked in the current ability batch
  rngSeed: number;
  rngState: number;
  startedAt: number;
  result: Standing[] | null;
}

export interface BatchPeek {
  playerId: PlayerId;
  cardIndex: number;
}

export interface Reveal {
  playerId: PlayerId;
  cardIndex: number;
  cardId: CardId; // the revealed card itself — a reveal dies if the slot changes
  until: number; // absolute ms; server stops serving the value after this
}

export interface Standing {
  playerId: PlayerId;
  name: string;
  total: number;
  cardCount: number;
  grid: { rank: Rank; suit: Suit; value: number }[];
  isWinner: boolean;
  wonOutright: boolean; // emptied their grid → instant win
}

export interface Target {
  playerId: PlayerId;
  cardIndex: number;
}

export type Action =
  | { type: "startGame" }
  | { type: "peek"; cardIndex: number }
  | { type: "selectCard"; cardIndex: number }
  | { type: "draw" }
  | { type: "discardDrawn" }
  | { type: "swapDrawn"; cardIndex: number }
  | { type: "burn"; cardIndex: number }
  | { type: "dutchCall" }
  | { type: "queenSwap"; a: Target; b: Target }
  | { type: "declineQueen" };

export type GameEvent =
  | { type: "playerJoined"; playerId: PlayerId; name: string }
  | { type: "playerLeft"; playerId: PlayerId }
  | { type: "gameStarted" }
  | { type: "cardDrawn"; playerId: PlayerId }
  | { type: "cardDiscarded"; playerId: PlayerId; rank: Rank; suit: Suit }
  | { type: "burned"; playerId: PlayerId; rank: Rank; correct: boolean }
  | { type: "penaltyAdded"; playerId: PlayerId }
  | { type: "abilityGranted"; kind: "jack" | "queen"; playerId: PlayerId }
  | { type: "peeked"; playerId: PlayerId; cardIndex: number }
  | { type: "queenSwapped"; a: Target; b: Target }
  | { type: "dutchCalled"; playerId: PlayerId }
  | { type: "turnPassed"; playerId: PlayerId }
  | { type: "gameOver"; standings: Standing[] };

export interface GridCardView {
  index: number;
  revealed: { rank: Rank; suit: Suit; value: number } | null;
  revealedUntil: number | null;
}

export interface GameView {
  youId: PlayerId;
  phase: GameState["phase"];
  stepKind: Step["kind"];
  turnPlayerId: PlayerId | null;
  deadlineAt: number | null;
  drawPileCount: number;
  discardTop: { rank: Rank; suit: Suit; value: number } | null;
  players: {
    id: PlayerId;
    name: string;
    seat: number;
    isHost: boolean;
    connected: boolean;
    cardCount: number;
  }[];
  myGrid: GridCardView[];
  drawnCard: { rank: Rank; suit: Suit; value: number } | null;
  matchWindow: { rank: Rank; deadlineAt: number } | null;
  canBurn: boolean;
  canDraw: boolean;
  canDiscardDrawn: boolean;
  canSwapDrawn: boolean;
  canDutchCall: boolean;
  myPeekTokens: number;
  myQueenTokens: number;
  dutchCallerId: PlayerId | null;
  result: Standing[] | null;
}

export interface Ctx {
  now: number;
}

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: GameError };
