import { describe, expect, it } from "vitest";
import { nextFloat, nextInt, nextUint32, shuffle } from "./rng";

describe("seeded prng", () => {
  it("is deterministic for a given seed", () => {
    const a = nextUint32(42);
    const b = nextUint32(42);
    expect(a).toEqual(b);
  });

  it("produces different streams for different seeds", () => {
    expect(nextUint32(1).value).not.toBe(nextUint32(2).value);
  });

  it("keeps the state inside the 32 bit range", () => {
    let state = 7;
    for (let i = 0; i < 1000; i++) {
      const draw = nextUint32(state);
      state = draw.state;
      expect(draw.state).toBeGreaterThanOrEqual(-2147483648);
      expect(draw.state).toBeLessThanOrEqual(2147483647);
    }
  });

  it("returns integers inside [0, n)", () => {
    let state = 99;
    for (let i = 0; i < 5000; i++) {
      const draw = nextInt(state, 7);
      state = draw.state;
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThan(7);
      expect(Number.isInteger(draw.value)).toBe(true);
    }
  });

  it("rejects a non-positive range", () => {
    expect(() => nextInt(1, 0)).toThrow();
    expect(() => nextInt(1, -3)).toThrow();
    expect(() => nextInt(1, 1.5)).toThrow();
  });

  it("covers the whole range", () => {
    const seen = new Set<number>();
    let state = 5;
    for (let i = 0; i < 500; i++) {
      const draw = nextInt(state, 10);
      state = draw.state;
      seen.add(draw.value);
    }
    expect(seen.size).toBe(10);
  });

  it("returns floats in [0, 1)", () => {
    let state = 3;
    for (let i = 0; i < 1000; i++) {
      const draw = nextFloat(state);
      state = draw.state;
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThan(1);
    }
  });

  it("shuffles deterministically for a given seed", () => {
    const items = Array.from({ length: 20 }, (_, index) => index);
    const first = shuffle(items, 1234);
    const second = shuffle(items, 1234);
    expect(first.items).toEqual(second.items);
    expect(first.state).toBe(second.state);
  });

  it("keeps the multiset intact while shuffling", () => {
    const items = Array.from({ length: 52 }, (_, index) => index);
    const result = shuffle(items, 777);
    expect(result.items.slice().sort((a, b) => a - b)).toEqual(items);
  });

  it("actually reorders the deck", () => {
    const items = Array.from({ length: 52 }, (_, index) => index);
    const result = shuffle(items, 777);
    expect(result.items).not.toEqual(items);
  });

  it("does not mutate the input array", () => {
    const items = [1, 2, 3, 4, 5];
    const copy = items.slice();
    shuffle(items, 1);
    expect(items).toEqual(copy);
  });
});
