// Feature: beteseb-bingo-telegram, Property 20: No Duplicate Numbers in a Round
// Validates: Requirements 16.1

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { shuffle } from '../../lib/shuffle.js';

// The full bingo number range used by the NCE
const BINGO_NUMBERS = Array.from({ length: 75 }, (_, i) => i + 1);

describe('Property 20: No Duplicate Numbers in a Round', () => {
  it('shuffle([1..75]) always produces exactly 75 elements with no duplicates, all in 1–75', () => {
    fc.assert(
      fc.property(
        // Use a dummy arbitrary to drive multiple runs; shuffle is called fresh each run
        fc.constant(null),
        () => {
          const result = shuffle(BINGO_NUMBERS);

          // Must have exactly 75 elements
          expect(result).toHaveLength(75);

          // All values must be within 1–75
          for (const n of result) {
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(75);
          }

          // No duplicates
          const unique = new Set(result);
          expect(unique.size).toBe(75);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('shuffle does not mutate the original input array', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const original = [...BINGO_NUMBERS];
        shuffle(BINGO_NUMBERS);
        // Original must remain unchanged
        expect(BINGO_NUMBERS).toEqual(original);
      }),
      { numRuns: 100 },
    );
  });

  it('shuffle output contains every number in 1–75 exactly once (permutation invariant)', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const result = shuffle(BINGO_NUMBERS);
        const sorted = [...result].sort((a, b) => a - b);
        // Sorting the output should produce the same sequence as the sorted input
        expect(sorted).toEqual(BINGO_NUMBERS);
      }),
      { numRuns: 100 },
    );
  });
});
