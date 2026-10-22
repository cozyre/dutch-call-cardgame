import { describe, expect, it } from "vitest";
import { ActionSchema, ClientMessageSchema, GameSettingsSchema } from "./protocol";

describe("the client message schema", () => {
  it("accepts the room messages", () => {
    expect(
      ClientMessageSchema.safeParse({ type: "room:create", name: "Ada" }).success,
    ).toBe(true);
    expect(
      ClientMessageSchema.safeParse({ type: "room:join", code: "ABC123", name: "Ada" }).success,
    ).toBe(true);
    expect(
      ClientMessageSchema.safeParse({
        type: "room:resume",
        code: "ABC123",
        seatToken: "v1.p_1.abc.sig",
      }).success,
    ).toBe(true);
    expect(
      ClientMessageSchema.safeParse({
        type: "room:settings",
        settings: { cardsPerPlayer: 6, deckCount: 1, preset: "normal" },
      }).success,
    ).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "ping" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "room:leave" }).success).toBe(true);
  });

  it("rejects unknown messages and malformed payloads", () => {
    expect(ClientMessageSchema.safeParse({ type: "room:destroy" }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ type: "room:create" }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ type: "room:create", name: "" }).success).toBe(false);
    expect(
      ClientMessageSchema.safeParse({ type: "room:create", name: "x".repeat(25) }).success,
    ).toBe(false);
    expect(
      ClientMessageSchema.safeParse({ type: "room:join", code: "ABC123", name: "A" }).success,
    ).toBe(true);
  });

  it("rejects settings outside the allowed range", () => {
    expect(
      GameSettingsSchema.safeParse({ cardsPerPlayer: 21, deckCount: 1, preset: "custom" })
        .success,
    ).toBe(false);
    expect(
      GameSettingsSchema.safeParse({ cardsPerPlayer: 0, deckCount: 1, preset: "custom" }).success,
    ).toBe(false);
    expect(
      GameSettingsSchema.safeParse({ cardsPerPlayer: 6, deckCount: 4, preset: "custom" }).success,
    ).toBe(false);
    expect(
      GameSettingsSchema.safeParse({ cardsPerPlayer: 6, deckCount: 1, preset: "nonsense" }).success,
    ).toBe(false);
  });
});

describe("the action schema", () => {
  it("accepts every legal action", () => {
    const actions = [
      { type: "startGame" },
      { type: "peek", cardIndex: 0 },
      { type: "selectCard", cardIndex: 3 },
      { type: "draw" },
      { type: "discardDrawn" },
      { type: "swapDrawn", cardIndex: 2 },
      { type: "burn", cardIndex: 1 },
      { type: "dutchCall" },
      { type: "queenSwap", a: { playerId: "p_1", cardIndex: 0 }, b: { playerId: "p_2", cardIndex: 1 } },
      { type: "declineQueen" },
    ];
    for (const action of actions) {
      expect(ActionSchema.safeParse(action).success, JSON.stringify(action)).toBe(true);
    }
  });

  it("rejects an action that reports a card value", () => {
    // The anti-cheat rule: a client may name a grid slot, never a card.
    expect(
      ActionSchema.safeParse({ type: "burn", cardIndex: 0, rank: "7" }).success,
    ).toBe(false);
    expect(
      ActionSchema.safeParse({ type: "burn", cardIndex: 0, value: 7 }).success,
    ).toBe(false);
    expect(
      ActionSchema.safeParse({ type: "swapDrawn", cardIndex: 0, suit: "H" }).success,
    ).toBe(false);
    expect(
      ActionSchema.safeParse({
        type: "queenSwap",
        a: { playerId: "p_1", cardIndex: 0, rank: "A" },
        b: { playerId: "p_2", cardIndex: 1 },
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range indices", () => {
    expect(ActionSchema.safeParse({ type: "peek", cardIndex: -1 }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "peek", cardIndex: 1.5 }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "peek", cardIndex: 99 }).success).toBe(false);
  });

  it("rejects unknown action types", () => {
    expect(ActionSchema.safeParse({ type: "reveal", cardIndex: 0 }).success).toBe(false);
  });
});
