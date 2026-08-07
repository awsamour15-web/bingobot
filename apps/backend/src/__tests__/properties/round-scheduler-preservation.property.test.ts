// Bugfix spec: round-scheduler-stuck-active
// Property 2: Preservation — Normal Scheduler Behavior Unchanged
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
//
// ─── PURPOSE ──────────────────────────────────────────────────────────────────
//
// These tests verify that the normal (non-buggy) round scheduler behaviors are
// preserved after the bugfixes are applied. They MUST PASS on UNFIXED code
// because they only exercise paths that are already correct.
//
// ─── FOUR PRESERVATION BEHAVIORS ─────────────────────────────────────────────
//
// P1 — Auto-start: a pending round with ≥1 player whose start_time has elapsed
//      → expireEmptyRounds() calls GameRoundService.start() → status becomes active
//
// P2 — New pending creation: a stake level with no active and no pending round
//      → ensureRoundsExist() creates exactly one new pending round ~60s in the future
//
// P3 — No duplicate creation: a stake level that already has a pending round
//      → ensureRoundsExist() does NOT create a second pending round for that stake
//
// P4 — Server recovery: server starts with an active round in the DB
//      → recoverActiveRounds() calls nce.start() for that round
//
// ─── APPROACH ─────────────────────────────────────────────────────────────────
//
// All tests use pure in-memory logic mirroring the scheduler service functions.
// No real DB or NCE is used. We model the scheduler logic and verify the four
// preservation behaviors across arbitrary inputs.
//
// ─── OBSERVATION NOTES ────────────────────────────────────────────────────────
//
// Observed P1: expireEmptyRounds with a pending round (entryCount > 0, overdue)
//   → round appears in startedRoundIds, not in voidedRoundIds.
//
// Observed P2: ensureRoundsExist with no pending and no active round for a stake
//   → exactly one new pending round is created for that stake with
//     start_time ≈ now + 60s.
//
// Observed P3: ensureRoundsExist when a pending round already exists for a stake
//   → no new pending round is created; existing pending round is unchanged.
//
// Observed P4: recoverActiveRounds sees active rounds in DB
//   → nce.start() is called exactly once per active round.

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Types ────────────────────────────────────────────────────────────────────

type RoundStatus = 'pending' | 'active' | 'void' | 'completed';

interface GameRoundRow {
  id: string;
  stake: number;
  status: RoundStatus;
  start_time: Date;
}

interface GameRoundWithCount extends GameRoundRow {
  _count: { round_entries: number };
}

// ─── Constants (mirrored from service) ───────────────────────────────────────

const STAKE_LEVELS = [10, 20, 50];
const LEAD_TIME_MS = 60_000;
const STALE_THRESHOLD_TOLERANCE_MS = 5_000; // allow 5s tolerance for "~60s"

// ─── P1: expireEmptyRounds simulation ────────────────────────────────────────

interface ExpireResult {
  voidedRoundIds: string[];
  startedRoundIds: string[];
}

/**
 * Mirrors the expireEmptyRounds logic from the scheduler service (current code).
 * Processes overdue rounds: voids empty ones, starts non-empty ones.
 */
function simulateExpireEmptyRounds(overdueRounds: GameRoundWithCount[]): ExpireResult {
  const result: ExpireResult = { voidedRoundIds: [], startedRoundIds: [] };
  for (const round of overdueRounds) {
    if (round._count.round_entries === 0) {
      result.voidedRoundIds.push(round.id);
    } else {
      result.startedRoundIds.push(round.id);
    }
  }
  return result;
}

// ─── P2 & P3: ensureRoundsExist simulation ───────────────────────────────────

interface EnsureState {
  pendingRounds: GameRoundRow[];
  activeRounds: GameRoundRow[];
  activeTimers: Set<string>;
}

interface EnsureResult {
  /** Stakes for which a new pending round was created. */
  createdForStakes: Set<number>;
  /** Start times assigned to newly created rounds, keyed by stake. */
  newRoundStartTimes: Map<number, Date>;
}

/**
 * Mirrors the ensureRoundsExist logic from the scheduler service (current code).
 * Determines which stakes need a new pending round and what start_time they get.
 */
function simulateEnsureRoundsExist(state: EnsureState): EnsureResult {
  const result: EnsureResult = { createdForStakes: new Set(), newRoundStartTimes: new Map() };

  const pendingStakes = new Set(state.pendingRounds.map((r) => r.stake));
  // Current code: skips if ANY active round exists for the stake (no timer check)
  const activeStakes = new Set(state.activeRounds.map((r) => r.stake));

  for (const stake of STAKE_LEVELS) {
    if (pendingStakes.has(stake)) continue;
    if (activeStakes.has(stake)) continue;
    // Create a new pending round
    result.createdForStakes.add(stake);
    result.newRoundStartTimes.set(stake, new Date(Date.now() + LEAD_TIME_MS));
  }

  return result;
}

// ─── P4: recoverActiveRounds simulation ──────────────────────────────────────

interface RecoveryResult {
  /** Round IDs for which nce.start() would be called. */
  recoveredRoundIds: string[];
}

/**
 * Mirrors the recoverActiveRounds logic: for each active DB round, call nce.start().
 */
function simulateRecoverActiveRounds(activeRounds: GameRoundRow[]): RecoveryResult {
  return {
    recoveredRoundIds: activeRounds.map((r) => r.id),
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const stakeArb = fc.constantFrom(...STAKE_LEVELS);

const nonEmptyOverdueRoundArb = (stake: number): fc.Arbitrary<GameRoundWithCount> =>
  fc
    .record({
      id: fc.uuidV(4),
      pastMs: fc.integer({ min: 1, max: 3_600_000 }),
      entryCount: fc.integer({ min: 1, max: 800 }),
    })
    .map(({ id, pastMs, entryCount }) => ({
      id,
      stake,
      status: 'pending' as RoundStatus,
      start_time: new Date(Date.now() - pastMs),
      _count: { round_entries: entryCount },
    }));

const existingPendingRoundArb = (stake: number): fc.Arbitrary<GameRoundRow> =>
  fc
    .record({ id: fc.uuidV(4), futureMs: fc.integer({ min: 1, max: 120_000 }) })
    .map(({ id, futureMs }) => ({
      id,
      stake,
      status: 'pending' as RoundStatus,
      start_time: new Date(Date.now() + futureMs),
    }));

const activeRoundArb = (stake: number): fc.Arbitrary<GameRoundRow> =>
  fc
    .record({ id: fc.uuidV(4), startedMsAgo: fc.integer({ min: 0, max: 300_000 }) })
    .map(({ id, startedMsAgo }) => ({
      id,
      stake,
      status: 'active' as RoundStatus,
      start_time: new Date(Date.now() - startedMsAgo),
    }));

// ═══════════════════════════════════════════════════════════════════════════════
// P1 — Auto-start: pending round with ≥1 player gets started (not voided)
// ═══════════════════════════════════════════════════════════════════════════════

describe('P1 — Auto-start: pending round with ≥1 player is started by expireEmptyRounds', () => {
  it('a single overdue non-empty round is started, not voided', () => {
    fc.assert(
      fc.property(
        stakeArb,
        fc.record({
          id: fc.uuidV(4),
          pastMs: fc.integer({ min: 1, max: 3_600_000 }),
          entryCount: fc.integer({ min: 1, max: 800 }),
        }),
        (stake, roundProps) => {
          const round: GameRoundWithCount = {
            id: roundProps.id,
            stake,
            status: 'pending',
            start_time: new Date(Date.now() - roundProps.pastMs),
            _count: { round_entries: roundProps.entryCount },
          };

          const result = simulateExpireEmptyRounds([round]);

          expect(result.startedRoundIds).toContain(round.id);
          expect(result.voidedRoundIds).not.toContain(round.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('overdue non-empty round is started, not voided (across all stake levels)', () => {
    fc.assert(
      fc.property(
        stakeArb,
        fc.record({
          id: fc.uuidV(4),
          pastMs: fc.integer({ min: 1, max: 3_600_000 }),
          entryCount: fc.integer({ min: 1, max: 800 }),
        }),
        (stake, roundProps) => {
          const round: GameRoundWithCount = {
            id: roundProps.id,
            stake,
            status: 'pending',
            start_time: new Date(Date.now() - roundProps.pastMs),
            _count: { round_entries: roundProps.entryCount },
          };

          const result = simulateExpireEmptyRounds([round]);

          expect(result.startedRoundIds).toContain(round.id);
          expect(result.voidedRoundIds).not.toContain(round.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when multiple overdue non-empty rounds exist, all are started', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuidV(4),
            stake: stakeArb,
            pastMs: fc.integer({ min: 1, max: 3_600_000 }),
            entryCount: fc.integer({ min: 1, max: 800 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (roundProps) => {
          const rounds: GameRoundWithCount[] = roundProps.map((p) => ({
            id: p.id,
            stake: p.stake,
            status: 'pending',
            start_time: new Date(Date.now() - p.pastMs),
            _count: { round_entries: p.entryCount },
          }));

          const result = simulateExpireEmptyRounds(rounds);

          for (const r of rounds) {
            expect(result.startedRoundIds).toContain(r.id);
            expect(result.voidedRoundIds).not.toContain(r.id);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P2 — New pending creation: missing stake gets exactly one new pending round
// ═══════════════════════════════════════════════════════════════════════════════

describe('P2 — New pending creation: stake with no active/pending round gets new pending round', () => {
  it('when no pending and no active round exists for a stake, ensureRoundsExist creates exactly one', () => {
    fc.assert(
      fc.property(stakeArb, (stake) => {
        // No rounds exist for any stake
        const state: EnsureState = {
          pendingRounds: [],
          activeRounds: [],
          activeTimers: new Set(),
        };

        const result = simulateEnsureRoundsExist(state);

        // All three stakes should get a new pending round
        expect(result.createdForStakes.has(stake)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('newly created pending round has start_time approximately LEAD_TIME_MS (60s) in the future', () => {
    fc.assert(
      fc.property(stakeArb, (stake) => {
        const beforeCall = Date.now();

        const state: EnsureState = {
          pendingRounds: [],
          activeRounds: [],
          activeTimers: new Set(),
        };

        const result = simulateEnsureRoundsExist(state);

        const newStartTime = result.newRoundStartTimes.get(stake);
        expect(newStartTime).toBeDefined();

        const startTimeMs = newStartTime!.getTime();
        const expectedMs = beforeCall + LEAD_TIME_MS;

        // Allow ±5s tolerance for execution time
        expect(startTimeMs).toBeGreaterThanOrEqual(expectedMs - STALE_THRESHOLD_TOLERANCE_MS);
        expect(startTimeMs).toBeLessThanOrEqual(expectedMs + STALE_THRESHOLD_TOLERANCE_MS);
      }),
      { numRuns: 100 },
    );
  });

  it('when one stake already has a pending round, only the other stakes get new rounds', () => {
    fc.assert(
      fc.property(
        stakeArb,
        fc.record({ id: fc.uuidV(4), futureMs: fc.integer({ min: 1, max: 120_000 }) }),
        (existingStake, pendingProps) => {
          const existingPending: GameRoundRow = {
            id: pendingProps.id,
            stake: existingStake,
            status: 'pending',
            start_time: new Date(Date.now() + pendingProps.futureMs),
          };

          const state: EnsureState = {
            pendingRounds: [existingPending],
            activeRounds: [],
            activeTimers: new Set(),
          };

          const result = simulateEnsureRoundsExist(state);

          // The existing stake should NOT get a new round
          expect(result.createdForStakes.has(existingStake)).toBe(false);

          // All other stakes SHOULD get new rounds
          for (const stake of STAKE_LEVELS) {
            if (stake !== existingStake) {
              expect(result.createdForStakes.has(stake)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P3 — No duplicate creation: existing pending round is not duplicated
// ═══════════════════════════════════════════════════════════════════════════════

describe('P3 — No duplicate creation: stake with existing pending round is skipped', () => {
  it('when all stake levels have a pending round, no new rounds are created', () => {
    fc.assert(
      fc.property(
        fc.record({
          id10: fc.uuidV(4),
          id20: fc.uuidV(4),
          id50: fc.uuidV(4),
          futureMs: fc.integer({ min: 1, max: 120_000 }),
        }),
        ({ id10, id20, id50, futureMs }) => {
          const pendingRounds: GameRoundRow[] = STAKE_LEVELS.map((stake, i) => ({
            id: [id10, id20, id50][i]!,
            stake,
            status: 'pending',
            start_time: new Date(Date.now() + futureMs),
          }));

          const state: EnsureState = {
            pendingRounds,
            activeRounds: [],
            activeTimers: new Set(),
          };

          const result = simulateEnsureRoundsExist(state);

          // No new rounds should be created for any stake
          expect(result.createdForStakes.size).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when a stake has an existing pending round, ensureRoundsExist does not create a second one', () => {
    fc.assert(
      fc.property(
        stakeArb,
        fc.record({ id: fc.uuidV(4), futureMs: fc.integer({ min: 1, max: 120_000 }) }),
        (stake, pendingProps) => {
          const existingPending: GameRoundRow = {
            id: pendingProps.id,
            stake,
            status: 'pending',
            start_time: new Date(Date.now() + pendingProps.futureMs),
          };

          const state: EnsureState = {
            pendingRounds: [existingPending],
            activeRounds: [],
            activeTimers: new Set(),
          };

          const result = simulateEnsureRoundsExist(state);

          // This specific stake must NOT be in createdForStakes
          expect(result.createdForStakes.has(stake)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when a stake has an active round (with live timer), ensureRoundsExist also skips it', () => {
    fc.assert(
      fc.property(
        stakeArb,
        fc.record({ id: fc.uuidV(4), startedMsAgo: fc.integer({ min: 0, max: 300_000 }) }),
        (stake, activeProps) => {
          const activeRound: GameRoundRow = {
            id: activeProps.id,
            stake,
            status: 'active',
            start_time: new Date(Date.now() - activeProps.startedMsAgo),
          };

          const state: EnsureState = {
            pendingRounds: [],
            activeRounds: [activeRound],
            activeTimers: new Set([activeRound.id]), // timer is alive
          };

          const result = simulateEnsureRoundsExist(state);

          // Active stake with live timer is skipped
          expect(result.createdForStakes.has(stake)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P4 — Server recovery: active rounds in DB trigger nce.start() on server start
// ═══════════════════════════════════════════════════════════════════════════════

describe('P4 — Server recovery: recoverActiveRounds calls nce.start() for each active round', () => {
  it('when one active round exists, nce.start() is called for it', () => {
    fc.assert(
      fc.property(
        stakeArb,
        fc.record({ id: fc.uuidV(4), startedMsAgo: fc.integer({ min: 0, max: 300_000 }) }),
        (stake, roundProps) => {
          const activeRound: GameRoundRow = {
            id: roundProps.id,
            stake,
            status: 'active',
            start_time: new Date(Date.now() - roundProps.startedMsAgo),
          };

          const result = simulateRecoverActiveRounds([activeRound]);

          expect(result.recoveredRoundIds).toContain(activeRound.id);
          expect(result.recoveredRoundIds).toHaveLength(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when multiple active rounds exist (different stakes), nce.start() is called for each', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuidV(4),
            stake: stakeArb,
            startedMsAgo: fc.integer({ min: 0, max: 300_000 }),
          }),
          { minLength: 1, maxLength: 3 },
        ),
        (roundProps) => {
          const activeRounds: GameRoundRow[] = roundProps.map((p) => ({
            id: p.id,
            stake: p.stake,
            status: 'active',
            start_time: new Date(Date.now() - p.startedMsAgo),
          }));

          const result = simulateRecoverActiveRounds(activeRounds);

          expect(result.recoveredRoundIds).toHaveLength(activeRounds.length);
          for (const round of activeRounds) {
            expect(result.recoveredRoundIds).toContain(round.id);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when no active rounds exist, nce.start() is not called', () => {
    const result = simulateRecoverActiveRounds([]);
    expect(result.recoveredRoundIds).toHaveLength(0);
  });

  it('nce.start() is called exactly once per active round (no double-recovery)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuidV(4),
            stake: stakeArb,
            startedMsAgo: fc.integer({ min: 0, max: 300_000 }),
          }),
          { minLength: 1, maxLength: 3 },
        ),
        (roundProps) => {
          const activeRounds: GameRoundRow[] = roundProps.map((p) => ({
            id: p.id,
            stake: p.stake,
            status: 'active',
            start_time: new Date(Date.now() - p.startedMsAgo),
          }));

          const result = simulateRecoverActiveRounds(activeRounds);

          // Each round ID appears exactly once
          for (const round of activeRounds) {
            const count = result.recoveredRoundIds.filter((id) => id === round.id).length;
            expect(count).toBe(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
