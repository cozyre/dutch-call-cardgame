import type { DifficultyPreset, GameSettings } from "./types";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;

export const MIN_CARDS_PER_PLAYER = 1;
export const MAX_CARDS_PER_PLAYER = 20;
export const MIN_DECK_COUNT = 1;
export const MAX_DECK_COUNT = 3;

export interface PresetDefinition {
  cardsPerPlayer: number;
  deckCount: number;
  label: string;
}

export const DIFFICULTY_PRESETS: Record<DifficultyPreset, PresetDefinition> = {
  easy: { cardsPerPlayer: 4, deckCount: 1, label: "Easy" },
  normal: { cardsPerPlayer: 6, deckCount: 1, label: "Normal" },
  tricky: { cardsPerPlayer: 8, deckCount: 2, label: "Tricky" },
  hard: { cardsPerPlayer: 10, deckCount: 2, label: "Hard" },
  memorizer: { cardsPerPlayer: 12, deckCount: 3, label: "Memorizer" },
};

export const PRESET_ORDER: readonly DifficultyPreset[] = [
  "easy",
  "normal",
  "tricky",
  "hard",
  "memorizer",
];

export type SettingsErrorField = "cardsPerPlayer" | "deckCount" | "pile" | "playerCount";

export interface SettingsError {
  field: SettingsErrorField;
  code: "OUT_OF_RANGE" | "PILE_TOO_SMALL" | "INVALID_PLAYER_COUNT";
  message: string;
}

export type SettingsValidation =
  | { ok: true; settings: GameSettings }
  | { ok: false; errors: SettingsError[] };

export function settingsForPreset(preset: DifficultyPreset): GameSettings {
  const definition = DIFFICULTY_PRESETS[preset];
  return {
    cardsPerPlayer: definition.cardsPerPlayer,
    deckCount: definition.deckCount,
    preset,
  };
}

export function isValidPlayerCount(playerCount: number): boolean {
  return (
    Number.isInteger(playerCount) && playerCount >= MIN_PLAYERS && playerCount <= MAX_PLAYERS
  );
}

/**
 * Custom settings validation (plan §6.2 / PRD §10):
 *  - cardsPerPlayer in 1..20 (the grid is capped at 4 rows × 5 columns)
 *  - deckCount in 1..3
 *  - 52 * deckCount - cardsPerPlayer * playerCount >= playerCount
 *    (the center pile keeps at least one card per player for fair turns)
 */
export function validateCustomSettings(
  cardsPerPlayer: number,
  deckCount: number,
  playerCount: number,
): SettingsValidation {
  const errors: SettingsError[] = [];

  if (
    !Number.isInteger(cardsPerPlayer) ||
    cardsPerPlayer < MIN_CARDS_PER_PLAYER ||
    cardsPerPlayer > MAX_CARDS_PER_PLAYER
  ) {
    errors.push({
      field: "cardsPerPlayer",
      code: "OUT_OF_RANGE",
      message: `Cards per player must be between ${MIN_CARDS_PER_PLAYER} and ${MAX_CARDS_PER_PLAYER} (the grid is capped at 4 rows × 5 columns).`,
    });
  }

  if (
    !Number.isInteger(deckCount) ||
    deckCount < MIN_DECK_COUNT ||
    deckCount > MAX_DECK_COUNT
  ) {
    errors.push({
      field: "deckCount",
      code: "OUT_OF_RANGE",
      message: `Deck count must be between ${MIN_DECK_COUNT} and ${MAX_DECK_COUNT}.`,
    });
  }

  if (errors.length === 0) {
    const remaining = 52 * deckCount - cardsPerPlayer * playerCount;
    if (remaining < playerCount) {
      errors.push({
        field: "pile",
        code: "PILE_TOO_SMALL",
        message: `Not enough center-pile cards: ${remaining} would remain, but each of the ${playerCount} players needs at least one.`,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    settings: { cardsPerPlayer, deckCount, preset: "custom" },
  };
}

/** Validates any settings object (preset or custom) against the room size. */
export function validateSettings(
  settings: GameSettings,
  playerCount: number,
): SettingsValidation {
  if (!isValidPlayerCount(playerCount)) {
    return {
      ok: false,
      errors: [
        {
          field: "playerCount",
          code: "INVALID_PLAYER_COUNT",
          message: `A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players, got ${playerCount}.`,
        },
      ],
    };
  }
  return validateCustomSettings(settings.cardsPerPlayer, settings.deckCount, playerCount);
}
