// Feature: fidel-bingo-telegram, Property 12: Game History Ordering Invariant
// Feature: fidel-bingo-telegram, Property 13: Called Numbers Round-Trip Persistence
// Validates: Requirements 8.2, 8.3, 16.4

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { shuffle } from '../../lib/shuffle.js';

// ─── In-memory simulation ─────────────────────────────────────────────────────
//
// The NCE broadcasts numbers in sequence and persists each to the DB with a
// `sequence_index`. Property 13 asserts that reading back from the DB (ordered
// by sequence_index) reproduces the exact broadcast sequence.
//
// We model this entirely in-memory: the "DB" is a plain array, and the
// "broadcast" is the order in which the NCE calls numbers.

interface CalledNumberRecord {
  number: number;
  sequence_index: number;
}

/**
 * Simulates the NCE persisting a called number.
 * Returns the new record that would be inserted into the DB.
 */
function persistCalledNumber(
  number: number,
  sequenceIndex: number,
): CalledNumberRecord {
  return { number, sequence_index: sequenceIndex };
}

/**
 * Simulates reading called_numbers from DB ordered by sequence_index ASC —
 * mirrors `prisma.calledNumber.findMany({ orderBy: { sequence_index: 'asc' } })`.
 */
function readFromDb(records: CalledNumberRecord[]): CalledNumberRecord[] {
  return [...records].sort((a, b) => a.sequence_index - b.sequence_index);
}

// ─── Arbitrary: a partial or full round sequence ─────────────────────────────

/**
 * Generates an arbitrary prefix of a shuffled 1–75 sequence (1 to 75 numbers).
 * Represents the numbers broadcast and persisted so far in an active or completed round.
 */
const roundSequenceArb: fc.Arbitrary<number[]> = fc
  .integer({ min: 1, max: 75 })
  .chain((length) =>
    fc.constant(shuffle(Array.from({ length: 75 }, (_, i) => i + 1)).slice(0, length)),
  );

// ─── Property 12: Game History Ordering Invariant ────────────────────────────

/**
 * In-memory model of a RoundEntry joined with GameRound, as returned by the
 * history endpoint. The history endpoint sorts by `round.ended_at DESC`.
 */
interface HistoryEntryModel {
  roundId: string;
  endedAt: Date | null;
}

/**
 * Pure simulation of the history endpoint ordering logic:
 * entries are sorted by ended_at DESC (nulls last, treated as epoch).
 */
function sortHistoryEntries(entries: HistoryEntryModel[]): HistoryEntryModel[] {
  return [...entries].sort((a, b) => {
    const tsA = a.endedAt?.getTime() ?? 0;
    const tsB = b.endedAt?.getTime() ?? 0;
    return tsB - tsA; // descending
  });
}

describe('Property 12: Game History Ordering Invariant', () => {
  it('history entries are always sorted by ended_at descending (most recent first)', () => {
    // Arbitrary: array of entries with random ended_at timestamps
    const historyEntriesArb = fc.array(
      fc.record({
        roundId: fc.uuidV(4),
        // Generate timestamps as integers in a wide range (milliseconds since epoch)
        endedAtMs: fc.integer({ min: 0, max: 2_000_000_000_000 }),
      }),
      { minLength: 1, maxLength: 50 },
    );

    fc.assert(
      fc.property(historyEntriesArb, (rawEntries) => {
        const entries: HistoryEntryModel[] = rawEntries.map((e) => ({
          roundId: e.roundId,
          endedAt: new Date(e.endedAtMs),
        }));

        const sorted = sortHistoryEntries(entries);

        // Verify descending order: each entry's timestamp >= the next one's
        for (let i = 0; i < sorted.length - 1; i++) {
          const tsA = sorted[i]!.endedAt?.getTime() ?? 0;
          const tsB = sorted[i + 1]!.endedAt?.getTime() ?? 0;
          expect(tsA).toBeGreaterThanOrEqual(tsB);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('all original entries appear in the sorted result (no entries lost or duplicated)', () => {
    const historyEntriesArb = fc.array(
      fc.record({
        roundId: fc.uuidV(4),
        endedAtMs: fc.integer({ min: 0, max: 2_000_000_000_000 }),
      }),
      { minLength: 1, maxLength: 50 },
    );

    fc.assert(
      fc.property(historyEntriesArb, (rawEntries) => {
        const entries: HistoryEntryModel[] = rawEntries.map((e) => ({
          roundId: e.roundId,
          endedAt: new Date(e.endedAtMs),
        }));

        const sorted = sortHistoryEntries(entries);

        // Same length
        expect(sorted.length).toBe(entries.length);

        // Same set of roundIds
        const originalIds = new Set(entries.map((e) => e.roundId));
        const sortedIds = new Set(sorted.map((e) => e.roundId));
        expect(sortedIds.size).toBe(originalIds.size);
        for (const id of originalIds) {
          expect(sortedIds.has(id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('a single-entry history is trivially sorted', () => {
    fc.assert(
      fc.property(
        fc.uuidV(4),
        fc.integer({ min: 0, max: 2_000_000_000_000 }),
        (roundId, endedAtMs) => {
          const entries: HistoryEntryModel[] = [{ roundId, endedAt: new Date(endedAtMs) }];
          const sorted = sortHistoryEntries(entries);
          expect(sorted.length).toBe(1);
          expect(sorted[0]!.roundId).toBe(roundId);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 13: Called Numbers Round-Trip Persistence ──────────────────────

describe('Property 13: Called Numbers Round-Trip Persistence', () => {
  it('DB records ordered by sequence_index reproduce the exact broadcast sequence', () => {
    fc.assert(
      fc.property(roundSequenceArb, (broadcastSequence) => {
        // Simulate NCE persisting each number as it is called
        const dbRecords: CalledNumberRecord[] = broadcastSequence.map(
          (number, index) => persistCalledNumber(number, index),
        );

        // Simulate reading back from DB (sorted by sequence_index)
        const fromDb = readFromDb(dbRecords);

        // The numbers read back must match the broadcast sequence exactly
        const dbNumbers = fromDb.map((r) => r.number);
        expect(dbNumbers).toEqual(broadcastSequence);
      }),
      { numRuns: 100 },
    );
  });

  it('sequence_index values form a contiguous range from 0 with no gaps', () => {
    fc.assert(
      fc.property(roundSequenceArb, (broadcastSequence) => {
        const dbRecords: CalledNumberRecord[] = broadcastSequence.map(
          (number, index) => persistCalledNumber(number, index),
        );

        const fromDb = readFromDb(dbRecords);

        // sequence_index must be 0, 1, 2, …, n-1 with no gaps
        fromDb.forEach((record, pos) => {
          expect(record.sequence_index).toBe(pos);
        });
      }),
      { numRuns: 100 },
    );
  });

  it('no duplicate numbers exist in the persisted sequence', () => {
    fc.assert(
      fc.property(roundSequenceArb, (broadcastSequence) => {
        const dbRecords: CalledNumberRecord[] = broadcastSequence.map(
          (number, index) => persistCalledNumber(number, index),
        );

        const numbers = dbRecords.map((r) => r.number);
        const unique = new Set(numbers);

        // Every persisted number must be unique
        expect(unique.size).toBe(numbers.length);
      }),
      { numRuns: 100 },
    );
  });

  it('all persisted numbers are within the valid 1–75 range', () => {
    fc.assert(
      fc.property(roundSequenceArb, (broadcastSequence) => {
        const dbRecords: CalledNumberRecord[] = broadcastSequence.map(
          (number, index) => persistCalledNumber(number, index),
        );

        for (const record of dbRecords) {
          expect(record.number).toBeGreaterThanOrEqual(1);
          expect(record.number).toBeLessThanOrEqual(75);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('inserting records out of chronological order does not affect read-back ordering', () => {
    fc.assert(
      fc.property(roundSequenceArb, (broadcastSequence) => {
        // Persist in reverse order to simulate out-of-order inserts
        const dbRecords: CalledNumberRecord[] = broadcastSequence
          .map((number, index) => persistCalledNumber(number, index))
          .reverse();

        // Read back (sort by sequence_index) should still reproduce original order
        const fromDb = readFromDb(dbRecords);
        const dbNumbers = fromDb.map((r) => r.number);

        expect(dbNumbers).toEqual(broadcastSequence);
      }),
      { numRuns: 100 },
    );
  });
});
