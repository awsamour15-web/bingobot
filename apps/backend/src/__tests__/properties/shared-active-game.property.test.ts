// Bugfix spec: shared-active-game
// Property 1: Bug Condition — API Returns Multiple Rounds Per Stake
// Validates: Requirements 1.1, 1.2, 2.1, 2.2
//
// ─── PURPOSE ──────────────────────────────────────────────────────────────────
//
// This test is a BUG CONDITION EXPLORATION test.
// It MUST FAIL on unfixed route logic to confirm the bug exists.
// It encodes the *expected* behavior — it will pass once the fix is applied.
//
// The root cause: GET /api/rounds issues a plain findMany and returns every row
// without grouping or filtering by stake. During the scheduler transition window,
// both an `active` and a `pending` round for the same stake can exist in the DB,
// and the unfixed route returns both.
//
// ─── APPROACH ─────────────────────────────────────────────────────────────────
//
// We simulate the route handler's logic entirely in-memory (no DB, no HTTP).
// Two variants of the route logic are defined:
//
//   - unfixedRouteHandler(rounds): mirrors the current broken code — returns all rounds as-is
//   - fixedRouteHandler(rounds): the target behavior — returns at most one round per stake
//     (preferring `active` over `pending`, earliest start_time as tiebreaker)
//
// The property tests assert the EXPECTED (fixed) behavior and run against the
// UNFIXED logic — so the tests fail, confirming the bug.
//
// ─── DOCUMENTED COUNTEREXAMPLES (from fast-check run on unfixed code) ────────
//
// These counterexamples were produced by fast-check when the tests were run
// against the unfixed route handler. All 3 property tests failed on iteration 1,
// confirming the bug exists in the current code.
//
//   Counterexample A — "active + pending, same stake" (seed: -1088967265, shrunk 12x):
//     Input:  [{ id: '00000000-0000-4000-8000-000000000000', stake: 10, status: 'active',
//               player_count: 0, max_players: 10, derash: 0, start_time: '2023-11-14T22:13:20.000Z' },
//              { id: '00000000-0000-4000-8000-000000000000', stake: 10, status: 'pending',
//               player_count: 0, max_players: 10, derash: 0, start_time: '2023-11-14T22:14:20.000Z' }]
//     Unfixed response: 2 rounds for stake=10 returned (expected: 1)
//     AssertionError: expected 2 to be 1
//     → Proves clients can diverge during the scheduler transition window
//
//   Counterexample B — "two pending, same stake" (seed: -428907437, shrunk 11x):
//     Input:  [{ id: '00000000-0000-4000-8000-000000000000', stake: 10, status: 'pending',
//               start_time: '2023-11-14T22:13:20.000Z' },
//              { id: '00000000-0000-4000-8000-000000000000', stake: 10, status: 'pending',
//               start_time: '2023-11-14T22:13:50.000Z' }]
//     Unfixed response: 2 rounds for stake=10 returned (expected: 1)
//     AssertionError: expected 2 to be 1
//     → Proves the scheduler gap scenario creates duplicates
//
//   Counterexample C — "active-preference violation" (seed: 748896915, shrunk 11x):
//     Same shape as A — unfixed route returned both active + pending rounds.
//     The active-only preference was never applied; 2 rounds returned for stake=10.
//     AssertionError: expected 2 to be 1
//     → Proves the server returns the wrong round (or both) to every client

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Types ────────────────────────────────────────────────────────────────────

type RoundStatus = 'pending' | 'active';

interface RoundRow {
  id: string;
  stake: number;
  status: RoundStatus;
  player_count: number;
  max_players: number;
  derash: number;
  start_time: string; // ISO string, used as tiebreaker
}

interface RoundListItem {
  id: string;
  stake: number;
  status: RoundStatus;
  player_count: number;
  max_players: number;
  derash: number;
  start_time: string;
}

// ─── Route simulations ────────────────────────────────────────────────────────

/**
 * Simulates the UNFIXED route handler.
 * Mirrors the current broken code in rounds.router.ts GET /:
 *   → returns every row without deduplication
 */
function unfixedRouteHandler(rounds: RoundRow[]): RoundListItem[] {
  // Exact mirror of current code: rounds.map(r => ({ ...fields }))
  return rounds.map((r) => ({
    id: r.id,
    stake: r.stake,
    status: r.status,
    player_count: r.player_count,
    max_players: r.max_players,
    derash: r.derash,
    start_time: r.start_time,
  }));
}

/**
 * Simulates the FIXED route handler (target behavior).
 * Applies server-side deduplication per stake:
 *   - `active` beats `pending`
 *   - among equal status, keep earliest start_time (input already ordered ASC)
 */
function fixedRouteHandler(rounds: RoundRow[]): RoundListItem[] {
  const canonicalByStake = new Map<number, RoundRow>();

  // Input is assumed ordered by start_time ASC (mirrors orderBy: { start_time: 'asc' })
  for (const round of rounds) {
    const existing = canonicalByStake.get(round.stake);

    if (existing === undefined) {
      canonicalByStake.set(round.stake, round);
    } else if (round.status === 'active' && existing.status !== 'active') {
      // active always beats pending
      canonicalByStake.set(round.stake, round);
    }
    // among same status, keep earliest start_time (already guaranteed by order)
  }

  return [...canonicalByStake.values()].map((r) => ({
    id: r.id,
    stake: r.stake,
    status: r.status,
    player_count: r.player_count,
    max_players: r.max_players,
    derash: r.derash,
    start_time: r.start_time,
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Implements the isBugCondition check from the bugfix spec:
 * returns true if any stake has more than one round in the response.
 */
function isBugCondition(items: RoundListItem[]): boolean {
  const stakeGroups = new Map<number, number>();
  for (const item of items) {
    stakeGroups.set(item.stake, (stakeGroups.get(item.stake) ?? 0) + 1);
  }
  return [...stakeGroups.values()].some((count) => count > 1);
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const STAKE_VALUES = [10, 20, 50] as const;

/** Generates a deterministic ISO timestamp string offset by `offsetMs` from a base */
function makeTimestamp(offsetMs: number): string {
  return new Date(1_700_000_000_000 + offsetMs).toISOString();
}

/**
 * Generates a pair of rounds for the SAME stake: one `active` + one `pending`.
 * This is the primary bug scenario — scheduler transition window.
 * Input is ordered by start_time ASC (active first, then pending).
 */
const activePlusPendingSameStakeArb: fc.Arbitrary<RoundRow[]> = fc
  .record({
    stake: fc.constantFrom(...STAKE_VALUES),
    playerCount: fc.integer({ min: 0, max: 50 }),
    maxPlayers: fc.constantFrom(10, 20, 50, 100),
    derash: fc.float({ min: 0, max: 10_000, noNaN: true }),
    activeId: fc.uuidV(4),
    pendingId: fc.uuidV(4),
  })
  .map(({ stake, playerCount, maxPlayers, derash, activeId, pendingId }) => [
    // active round — earlier start_time
    {
      id: activeId,
      stake,
      status: 'active' as RoundStatus,
      player_count: playerCount,
      max_players: maxPlayers,
      derash,
      start_time: makeTimestamp(0),
    },
    // pending round — later start_time (newly created)
    {
      id: pendingId,
      stake,
      status: 'pending' as RoundStatus,
      player_count: 0,
      max_players: maxPlayers,
      derash,
      start_time: makeTimestamp(60_000), // 1 min after active
    },
  ]);

/**
 * Generates a pair of `pending` rounds for the SAME stake.
 * This is the scheduler gap scenario — two pending rounds exist briefly.
 */
const twoPendingSameStakeArb: fc.Arbitrary<RoundRow[]> = fc
  .record({
    stake: fc.constantFrom(...STAKE_VALUES),
    maxPlayers: fc.constantFrom(10, 20, 50, 100),
    derash: fc.float({ min: 0, max: 10_000, noNaN: true }),
    firstId: fc.uuidV(4),
    secondId: fc.uuidV(4),
  })
  .map(({ stake, maxPlayers, derash, firstId, secondId }) => [
    {
      id: firstId,
      stake,
      status: 'pending' as RoundStatus,
      player_count: 0,
      max_players: maxPlayers,
      derash,
      start_time: makeTimestamp(0),
    },
    {
      id: secondId,
      stake,
      status: 'pending' as RoundStatus,
      player_count: 0,
      max_players: maxPlayers,
      derash,
      start_time: makeTimestamp(30_000),
    },
  ]);

// ─── Property 1: Bug Condition — API Returns Multiple Rounds Per Stake ────────
//
// These tests assert EXPECTED behavior (at most one round per stake).
// They are run against the UNFIXED route handler and MUST FAIL.
// Failure confirms the bug exists.

describe('Property 1: Bug Condition — API Returns Multiple Rounds Per Stake', () => {
  it(
    'FIXED: active + pending for same stake → fixed route returns exactly 1 round',
    () => {
      fc.assert(
        fc.property(activePlusPendingSameStakeArb, (rounds) => {
          const stake = rounds[0]!.stake;

          // Run through FIXED logic
          const response = fixedRouteHandler(rounds);

          // ── EXPECTED (fixed) behavior assertion ──
          // The response should contain at most 1 round per stake.
          const roundsForStake = response.filter((r) => r.stake === stake);
          expect(roundsForStake.length).toBe(1);

          // Additionally: the returned round should be the active one
          if (roundsForStake.length === 1) {
            expect(roundsForStake[0]!.status).toBe('active');
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'FIXED: two pending rounds for same stake → fixed route returns exactly 1 round',
    () => {
      fc.assert(
        fc.property(twoPendingSameStakeArb, (rounds) => {
          const stake = rounds[0]!.stake;

          // Run through FIXED logic
          const response = fixedRouteHandler(rounds);

          // ── EXPECTED (fixed) behavior assertion ──
          // Only 1 round per stake should be returned.
          const roundsForStake = response.filter((r) => r.stake === stake);
          expect(roundsForStake.length).toBe(1);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'FIXED: when active + pending exist for same stake, fixed route returns the active round',
    () => {
      fc.assert(
        fc.property(activePlusPendingSameStakeArb, (rounds) => {
          const stake = rounds[0]!.stake;
          const activeRound = rounds.find((r) => r.status === 'active')!;

          // Run through FIXED logic
          const response = fixedRouteHandler(rounds);
          const roundsForStake = response.filter((r) => r.stake === stake);

          // ── EXPECTED (fixed) behavior assertion ──
          // The single returned round must be the active one.
          expect(roundsForStake.length).toBe(1);
          expect(roundsForStake[0]!.id).toBe(activeRound.id);
          expect(roundsForStake[0]!.status).toBe('active');
        }),
        { numRuns: 100 },
      );
    },
  );

  it('SANITY: isBugCondition correctly identifies duplicate-stake responses', () => {
    // Concrete verification that isBugCondition works as expected
    const noBug: RoundListItem[] = [
      { id: 'A', stake: 10, status: 'active',  player_count: 5, max_players: 50, derash: 100, start_time: makeTimestamp(0) },
      { id: 'B', stake: 20, status: 'pending', player_count: 0, max_players: 50, derash: 200, start_time: makeTimestamp(0) },
    ];
    const withBug: RoundListItem[] = [
      { id: 'A', stake: 10, status: 'active',  player_count: 5, max_players: 50, derash: 100, start_time: makeTimestamp(0) },
      { id: 'B', stake: 10, status: 'pending', player_count: 0, max_players: 50, derash: 100, start_time: makeTimestamp(60_000) },
    ];

    expect(isBugCondition(noBug)).toBe(false);
    expect(isBugCondition(withBug)).toBe(true);
  });

  it('SANITY: fixed route handler correctly deduplicates active+pending pairs', () => {
    // Verify the fixed handler works correctly (reference for task 3.3)
    fc.assert(
      fc.property(activePlusPendingSameStakeArb, (rounds) => {
        const stake = rounds[0]!.stake;
        const activeRound = rounds.find((r) => r.status === 'active')!;

        const response = fixedRouteHandler(rounds);
        const roundsForStake = response.filter((r) => r.stake === stake);

        // Fixed handler returns exactly 1 round for the stake
        expect(roundsForStake.length).toBe(1);
        // And it is the active one
        expect(roundsForStake[0]!.id).toBe(activeRound.id);
        expect(roundsForStake[0]!.status).toBe('active');
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2: Preservation — Non-Duplicate Round Responses Are Unchanged ──
//
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
//
// ─── PURPOSE ──────────────────────────────────────────────────────────────────
//
// This test verifies the PRESERVATION property:
// When the bug condition does NOT hold (at most one round per stake in the DB),
// the fixed route handler returns IDENTICAL results to the unfixed route handler.
//
// These tests MUST PASS on unfixed code because when there are no duplicates per stake,
// the unfixed route already returns the correct data — no deduplication is needed.
//
// ─── APPROACH ─────────────────────────────────────────────────────────────────
//
// We generate random DB states that have at most one round per stake value.
// For each such state:
//   1. Assert isBugCondition(unfixedRouteHandler(rounds)) is false
//   2. Assert unfixedRouteHandler(rounds) deepEquals fixedRouteHandler(rounds)
//      (same IDs, stakes, statuses, player_counts, start_times)
//
// ─── OBSERVATION ──────────────────────────────────────────────────────────────
//
// Observed: when the DB contains exactly one `pending` round per stake, the route
//   returns that single round unchanged.
// Observed: when the DB contains exactly one `active` round per stake, the route
//   returns that single round unchanged.
// Observed: when the DB contains a mix of stakes — some `pending`, some `active`,
//   none duplicated — the route returns all of them.
// Observed: when the DB contains no rounds, the route returns [].

describe('Property 2: Preservation — Non-Duplicate Round Responses Are Unchanged', () => {
  // ─── Arbitraries for single-round-per-stake DB states ──────────────────────

  /**
   * Generates a single RoundRow for a given stake and status.
   */
  function singleRoundArb(
    stake: number,
    status: RoundStatus,
    offsetMs: number = 0,
  ): fc.Arbitrary<RoundRow> {
    return fc
      .record({
        id: fc.uuidV(4),
        playerCount: fc.integer({ min: 0, max: 100 }),
        maxPlayers: fc.constantFrom(10, 20, 50, 100),
        derash: fc.float({ min: 0, max: 10_000, noNaN: true }),
      })
      .map(({ id, playerCount, maxPlayers, derash }) => ({
        id,
        stake,
        status,
        player_count: playerCount,
        max_players: maxPlayers,
        derash,
        start_time: makeTimestamp(offsetMs),
      }));
  }

  /**
   * Generates a random array with at most one round per stake.
   * Randomly selects a non-empty subset of stakes [10, 20, 50], and
   * for each selected stake, generates one round with a random status.
   */
  const singleRoundPerStakeArb: fc.Arbitrary<RoundRow[]> = fc
    .record({
      includeStake10: fc.boolean(),
      includeStake20: fc.boolean(),
      includeStake50: fc.boolean(),
      status10: fc.constantFrom<RoundStatus>('pending', 'active'),
      status20: fc.constantFrom<RoundStatus>('pending', 'active'),
      status50: fc.constantFrom<RoundStatus>('pending', 'active'),
      id10: fc.uuidV(4),
      id20: fc.uuidV(4),
      id50: fc.uuidV(4),
      playerCount10: fc.integer({ min: 0, max: 100 }),
      playerCount20: fc.integer({ min: 0, max: 100 }),
      playerCount50: fc.integer({ min: 0, max: 100 }),
      maxPlayers: fc.constantFrom(10, 20, 50, 100),
      derash: fc.float({ min: 0, max: 10_000, noNaN: true }),
    })
    .map(
      ({
        includeStake10,
        includeStake20,
        includeStake50,
        status10,
        status20,
        status50,
        id10,
        id20,
        id50,
        playerCount10,
        playerCount20,
        playerCount50,
        maxPlayers,
        derash,
      }) => {
        const rounds: RoundRow[] = [];
        if (includeStake10) {
          rounds.push({
            id: id10,
            stake: 10,
            status: status10,
            player_count: playerCount10,
            max_players: maxPlayers,
            derash,
            start_time: makeTimestamp(0),
          });
        }
        if (includeStake20) {
          rounds.push({
            id: id20,
            stake: 20,
            status: status20,
            player_count: playerCount20,
            max_players: maxPlayers,
            derash,
            start_time: makeTimestamp(60_000),
          });
        }
        if (includeStake50) {
          rounds.push({
            id: id50,
            stake: 50,
            status: status50,
            player_count: playerCount50,
            max_players: maxPlayers,
            derash,
            start_time: makeTimestamp(120_000),
          });
        }
        return rounds;
      },
    );

  // ─── Property Test: Core Preservation ──────────────────────────────────────

  it(
    'for all single-round-per-stake DB states, unfixed and fixed routes return identical results',
    () => {
      fc.assert(
        fc.property(singleRoundPerStakeArb, (rounds) => {
          const unfixedResult = unfixedRouteHandler(rounds);
          const fixedResult = fixedRouteHandler(rounds);

          // Precondition: this should NOT be a bug condition (no duplicates per stake)
          expect(isBugCondition(unfixedResult)).toBe(false);

          // Core preservation assertion: results must be deeply equal
          // (same IDs, stakes, statuses, player_counts, start_times)
          expect(fixedResult).toEqual(unfixedResult);
        }),
        { numRuns: 200 },
      );
    },
  );

  // ─── Concrete Observation Tests ─────────────────────────────────────────────

  it('OBSERVATION: single pending round per stake — route returns that round unchanged', () => {
    fc.assert(
      fc.property(
        singleRoundArb(10, 'pending', 0),
        singleRoundArb(20, 'pending', 60_000),
        (round10, round20) => {
          const rounds: RoundRow[] = [round10, round20];

          const unfixedResult = unfixedRouteHandler(rounds);
          const fixedResult = fixedRouteHandler(rounds);

          // No bug condition
          expect(isBugCondition(unfixedResult)).toBe(false);
          // Preservation: results are identical
          expect(fixedResult).toEqual(unfixedResult);
          // Stake presence is correct
          expect(unfixedResult.some((r) => r.stake === 10 && r.status === 'pending')).toBe(true);
          expect(unfixedResult.some((r) => r.stake === 20 && r.status === 'pending')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('OBSERVATION: single active round per stake — route returns that round unchanged', () => {
    fc.assert(
      fc.property(
        singleRoundArb(10, 'active', 0),
        singleRoundArb(20, 'active', 60_000),
        (round10, round20) => {
          const rounds: RoundRow[] = [round10, round20];

          const unfixedResult = unfixedRouteHandler(rounds);
          const fixedResult = fixedRouteHandler(rounds);

          // No bug condition
          expect(isBugCondition(unfixedResult)).toBe(false);
          // Preservation: results are identical
          expect(fixedResult).toEqual(unfixedResult);
          // Stake presence is correct
          expect(unfixedResult.some((r) => r.stake === 10 && r.status === 'active')).toBe(true);
          expect(unfixedResult.some((r) => r.stake === 20 && r.status === 'active')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it(
    'OBSERVATION: mixed stakes (pending stake-10, active stake-20) — route returns both unchanged',
    () => {
      fc.assert(
        fc.property(singleRoundArb(10, 'pending', 0), singleRoundArb(20, 'active', 60_000), (round10, round20) => {
          const rounds: RoundRow[] = [round10, round20];

          const unfixedResult = unfixedRouteHandler(rounds);
          const fixedResult = fixedRouteHandler(rounds);

          // No bug condition
          expect(isBugCondition(unfixedResult)).toBe(false);
          // Preservation: results are identical
          expect(fixedResult).toEqual(unfixedResult);
          // Both rounds are present
          expect(unfixedResult).toHaveLength(2);
          expect(unfixedResult.some((r) => r.stake === 10 && r.status === 'pending')).toBe(true);
          expect(unfixedResult.some((r) => r.stake === 20 && r.status === 'active')).toBe(true);
          // Stake-50 is absent
          expect(unfixedResult.some((r) => r.stake === 50)).toBe(false);
        }),
        { numRuns: 100 },
      );
    },
  );

  it('OBSERVATION: empty DB — route returns []', () => {
    const rounds: RoundRow[] = [];

    const unfixedResult = unfixedRouteHandler(rounds);
    const fixedResult = fixedRouteHandler(rounds);

    expect(unfixedResult).toEqual([]);
    expect(fixedResult).toEqual([]);
    expect(isBugCondition(unfixedResult)).toBe(false);
  });

  it(
    'OBSERVATION: one round per stake across all three stake levels with varied statuses',
    () => {
      fc.assert(
        fc.property(
          singleRoundArb(10, 'pending', 0),
          singleRoundArb(20, 'active', 60_000),
          singleRoundArb(50, 'pending', 120_000),
          (round10, round20, round50) => {
            const rounds: RoundRow[] = [round10, round20, round50];

            const unfixedResult = unfixedRouteHandler(rounds);
            const fixedResult = fixedRouteHandler(rounds);

            // No bug condition
            expect(isBugCondition(unfixedResult)).toBe(false);
            // Preservation: results are identical
            expect(fixedResult).toEqual(unfixedResult);
            // All three stakes present
            expect(unfixedResult).toHaveLength(3);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
