import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_PRESETS,
  MAX_CARDS_PER_PLAYER,
  MAX_DECK_COUNT,
  MIN_CARDS_PER_PLAYER,
  PRESET_ORDER,
  isValidPlayerCount,
  settingsForPreset,
  validateCustomSettings,
  validateSettings,
} from "./difficulty";

describe("difficulty presets (PRD §5.2)", () => {
  it("matches the documented table", () => {
    expect(settingsForPreset("easy")).toEqual({
      cardsPerPlayer: 4,
      deckCount: 1,
      preset: "easy",
    });
    expect(settingsForPreset("normal")).toEqual({
      cardsPerPlayer: 6,
      deckCount: 1,
      preset: "normal",
    });
    expect(settingsForPreset("tricky")).toEqual({
      cardsPerPlayer: 8,
      deckCount: 2,
      preset: "tricky",
    });
    expect(settingsForPreset("hard")).toEqual({
      cardsPerPlayer: 10,
      deckCount: 2,
      preset: "hard",
    });
    expect(settingsForPreset("memorizer")).toEqual({
      cardsPerPlayer: 12,
      deckCount: 3,
      preset: "memorizer",
    });
  });

  it("exposes all five presets", () => {
    expect(PRESET_ORDER).toHaveLength(5);
    for (const preset of PRESET_ORDER) {
      expect(DIFFICULTY_PRESETS[preset].cardsPerPlayer).toBeGreaterThan(0);
    }
  });
});

describe("custom settings validation", () => {
  it("accepts a valid custom setup", () => {
    const result = validateCustomSettings(7, 2, 4);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings).toEqual({ cardsPerPlayer: 7, deckCount: 2, preset: "custom" });
    }
  });

  it("rejects more than 20 cards per player (grid is 4 rows by 5 columns)", () => {
    const result = validateCustomSettings(MAX_CARDS_PER_PLAYER + 1, 2, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field)).toContain("cardsPerPlayer");
    }
  });

  it("rejects zero or negative cards per player", () => {
    expect(validateCustomSettings(MIN_CARDS_PER_PLAYER - 1, 2, 3).ok).toBe(false);
  });

  it("accepts exactly 20 cards per player", () => {
    expect(validateCustomSettings(MAX_CARDS_PER_PLAYER, 3, 3).ok).toBe(true);
  });

  it("rejects more than 3 decks", () => {
    const result = validateCustomSettings(6, MAX_DECK_COUNT + 1, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field)).toContain("deckCount");
    }
  });

  it("rejects zero decks", () => {
    expect(validateCustomSettings(6, 0, 3).ok).toBe(false);
  });

  it("rejects a setup that leaves too few center pile cards", () => {
    // 52 - 20 * 3 = -8 cards left for 3 players.
    const result = validateCustomSettings(20, 1, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field)).toContain("pile");
    }
  });

  it("requires at least one center pile card per player", () => {
    // 52 - 16 * 3 = 4 cards left, but 3 players need 3 -> ok
    expect(validateCustomSettings(16, 1, 3).ok).toBe(true);
    // 52 - 17 * 3 = 1 card left, 3 players need 3 -> too few
    expect(validateCustomSettings(17, 1, 3).ok).toBe(false);
  });

  it("reports every problem at once", () => {
    const result = validateCustomSettings(50, 9, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(2);
    }
  });
});

describe("room size validation", () => {
  it("accepts 3 to 6 players", () => {
    expect(isValidPlayerCount(3)).toBe(true);
    expect(isValidPlayerCount(6)).toBe(true);
    expect(isValidPlayerCount(2)).toBe(false);
    expect(isValidPlayerCount(7)).toBe(false);
  });

  it("reports a bad player count through validateSettings", () => {
    const result = validateSettings(settingsForPreset("easy"), 2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].field).toBe("playerCount");
    }
  });

  it("validates preset settings against the room size", () => {
    expect(validateSettings(settingsForPreset("memorizer"), 6).ok).toBe(true);
  });
});
