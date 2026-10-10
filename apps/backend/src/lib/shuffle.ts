// Fisher-Yates shuffle utility
// Requirements: 16.1

/**
 * Returns a new array containing all elements of `input` in a pseudorandom
 * order using the Fisher-Yates (Knuth) algorithm.
 *
 * The original array is never mutated.
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input]; // copy — do not mutate input
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Swap arr[i] and arr[j]
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Deterministic seeded PRNG (mulberry32).
 * Returns a function that produces floats in [0, 1) from a 32-bit integer seed.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Derive a 32-bit integer seed from a UUID string.
 * Uses a simple djb2-style hash over the hex digits.
 */
function seedFromUuid(uuid: string): number {
  const hex = uuid.replace(/-/g, '');
  let h = 0x811c9dc5;
  for (let i = 0; i < hex.length; i++) {
    h ^= parseInt(hex[i]!, 16);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Seeded Fisher-Yates shuffle — produces the same permutation for the same
 * (input, seed) pair on any instance. Used for resume sequences so that a
 * restarting server always generates the identical remaining draw order.
 */
export function seededShuffle<T>(input: readonly T[], roundId: string): T[] {
  const rand = mulberry32(seedFromUuid(roundId));
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}
