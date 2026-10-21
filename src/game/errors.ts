export type GameErrorCode =
  | "NOT_YOUR_TURN"
  | "WRONG_PHASE"
  | "INVALID_TARGET"
  | "OUT_OF_RANGE"
  | "NOT_ALLOWED"
  | "ALREADY_USED"
  | "GAME_OVER"
  | "PLAYER_NOT_FOUND"
  | "EMPTY_PILE"
  | "INVALID_ACTION";

export interface GameError {
  code: GameErrorCode;
  message: string;
}

export function gameError(code: GameErrorCode, message: string): GameError {
  return { code, message };
}
