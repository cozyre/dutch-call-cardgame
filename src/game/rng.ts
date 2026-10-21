/**
 * Seeded PRNG (mulberry32).
 *
 * The engine never calls `Math.random()`. The PRNG state lives in
 * `GameState.rngState` so a whole game can be replayed from its seed.
 */

const UINT32_RANGE = 0x1_0000_0000;

export interface RngDraw<T> {
  value: T;
  state: number;
}

export function nextUint32(state: number): RngDraw<number> {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: (t ^ (t >>> 14)) >>> 0, state: a };
}

/** Uniform float in [0, 1). */
export function nextFloat(state: number): RngDraw<number> {
  const draw = nextUint32(state);
  return { value: draw.value / UINT32_RANGE, state: draw.state };
}

/** Uniform integer in [0, maxExclusive). Rejection sampling avoids modulo bias. */
export function nextInt(state: number, maxExclusive: number): RngDraw<number> {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
  let current = state;
  for (;;) {
    const draw = nextUint32(current);
    current = draw.state;
    if (draw.value < limit) {
      return { value: draw.value % maxExclusive, state: current };
    }
  }
}

/** Fisher–Yates shuffle driven by the seeded PRNG. Returns a new array. */
export function shuffle<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  const out = items.slice();
  let current = state;
  for (let i = out.length - 1; i > 0; i--) {
    const draw = nextInt(current, i + 1);
    current = draw.state;
    const j = draw.value;
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return { items: out, state: current };
}
