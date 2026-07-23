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
