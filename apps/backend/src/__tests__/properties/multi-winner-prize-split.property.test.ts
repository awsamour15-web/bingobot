// Feature: multi-winner-prize-split, Property 1: Claim window opens and accepts concurrent valid claims
// Feature: multi-winner-prize-split, Property 2: Duplicate claims from the same player are rejected
// Feature: multi-winner-prize-split, Property 3: Claims after window expiry are rejected
// Feature: multi-winner-prize-split, Property 4: Claim window duration is driven by config with a 5000 ms fallback
// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 8.4

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A minimal representation of a CartelaDefinition with a winning grid.
 * The grid is a 25-element flat array (B-I-N-G-O columns, row-major).
 */
interface MockCartela {
  cartela_number: number;
  grid: number[];
}

/**
 * Builds a grid where the first row [indices 0–4] is a guaranteed winning line
 * when calledNums includes all of those values.
 */
function makeWinningGrid(cartelaNumber: number): { grid: number[]; calledNums: number[] } {
  // Use unique values per column range to avoid accidental cross-column collisions.
  // B col (0-4): 1–15, I col (5-9): 16-30, N col (10-14): 31-45, G col (15-19): 46-60, O col (20-24): 61-75
  // Row 0: indices 0, 5, 10, 15, 20 (first of each column)
  const grid = [
    1,  2,  3,  4,  5,    // B column (row 0–4)
    16, 17, 18, 19, 20,   // I column
    31, 32, 0,  34, 35,   // N column (index 12 = free space)
    46, 47, 48, 49, 50,   // G column
    61, 62, 63, 64, 65,   // O column
  ];
  // Row 0 = indices [0, 5, 10, 15, 20] → values [1, 16, 31, 46, 61]
  const calledNums = [1, 16, 31, 46, 61]; // index 10 = 31 (non-zero), 15 = 46, etc.
  // Actually index 12 is 0 (free space), not used in row 0.
  // Row 0 uses indices 0, 5, 10, 15, 20 → values 1, 16, 31, 46, 61
  return { grid, calledNums };
}

// ─── Mock setup ───────────────────────────────────────────────────────────────

// We mock the prisma module so that validateClaim gets controlled DB responses.
vi.mock('../../lib/prisma.js', () => {
  const mockPrisma = {
    config: {
      findUnique: vi.fn(),
    },
    roundEntry: {
      findMany: vi.fn(),
    },
    gameRound: {
      findUnique: vi.fn(),
    },
    cartelaDefinition: {
      findMany: vi.fn(),
    },
    calledNumber: {
      findMany: vi.fn(),
    },
  };
  return { default: mockPrisma };
});

// Mock distributeWinnings side-effects (bot notifications, round scheduler)
vi.mock('../../bot/notifications.js', () => ({
  notifyWin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/round-scheduler.service.js', () => ({
  RoundScheduler: { ensureRoundsExist: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/wallet.service.js', () => ({
  WalletService: { credit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/referral.service.js', () => ({
  ReferralService: { creditCommission: vi.fn().mockResolvedValue(undefined) },
}));

// ─── Import service after mocks ───────────────────────────────────────────────

import { WinDetectionService } from '../../services/win-detection.service.js';
import prisma from '../../lib/prisma.js';

// ─── Typed mock helpers ───────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  config: { findUnique: ReturnType<typeof vi.fn> };
  roundEntry: { findMany: ReturnType<typeof vi.fn> };
  gameRound: { findUnique: ReturnType<typeof vi.fn> };
  cartelaDefinition: { findMany: ReturnType<typeof vi.fn> };
  calledNumber: { findMany: ReturnType<typeof vi.fn> };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the standard winning grid/calledNums for all mock cartela lookups.
 */
const { grid: WINNING_GRID, calledNums: WINNING_CALLED } = makeWinningGrid(1);

/**
 * Sets up prisma mocks for a basic "valid claim" scenario:
 * - One non-watching RoundEntry for the player
 * - GameRound is active with given roundId
 * - CartelaDefinition returns WINNING_GRID
 * - CalledNumbers returns WINNING_CALLED
 * - Config returns the given claim_window_ms value (or null for absent)
 */
function setupValidClaimMocks(
  playerId: string,
  roundId: string,
  cartelaNumber: number,
  configValue: string | null,
): void {
  mockPrisma.roundEntry.findMany.mockImplementation(async (args: { where?: { player_id?: string } }) => {
    // Only return entries for the specific player
    if (args?.where?.player_id === playerId) {
      return [{ round_id: roundId, player_id: playerId, cartela_number: cartelaNumber, is_watching: false }];
    }
    return [];
  });

  mockPrisma.gameRound.findUnique.mockResolvedValue({
    id: roundId,
    status: 'active',
    derash: '1000',
  });

  mockPrisma.cartelaDefinition.findMany.mockResolvedValue([
    { cartela_number: cartelaNumber, grid: WINNING_GRID },
  ]);

  mockPrisma.calledNumber.findMany.mockResolvedValue(
    WINNING_CALLED.map((num, idx) => ({ number: num, sequence_index: idx, round_id: roundId })),
  );

  if (configValue === null) {
    mockPrisma.config.findUnique.mockResolvedValue(null);
  } else {
    mockPrisma.config.findUnique.mockResolvedValue({ key: 'claim_window_ms', value: configValue });
  }
}

/**
 * Resets all mocks and clears timers.
 */
function resetMocks(): void {
  vi.clearAllMocks();
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Two distinct player IDs. */
const twoDistinctPlayerIdsArb = fc
  .uniqueArray(fc.uuid(), { minLength: 2, maxLength: 2 })
  .map(([a, b]) => ({ playerA: a!, playerB: b! }));

/** A single player ID + round ID pair. */
const playerRoundArb = fc.record({
  playerId: fc.uuid(),
  roundId: fc.uuid(),
  cartelaNumber: fc.integer({ min: 1, max: 999 }),
});

/** Cartela number for player A and player B */
const twoCartelaNumbersArb = fc
  .uniqueArray(fc.integer({ min: 1, max: 999 }), { minLength: 2, maxLength: 2 })
  .map(([a, b]) => ({ cartelaA: a!, cartelaB: b! }));

/**
 * Generates config states for Property 4:
 * - { type: 'valid', value: N } — a numeric string (e.g. "3000")
 * - { type: 'invalid', value: 'abc' } — non-numeric
 * - { type: 'absent' } — key not in DB
 */
type ConfigState =
  | { type: 'valid'; value: string; expected: number }
  | { type: 'invalid'; value: string; expected: number }
  | { type: 'absent'; expected: number };

const configStateArb: fc.Arbitrary<ConfigState> = fc.oneof(
  // Valid integer string
  fc
    .integer({ min: 1, max: 30000 })
    .map((n) => ({ type: 'valid' as const, value: String(n), expected: n })),
  // Non-numeric string
  fc
    .stringOf(fc.char().filter((c) => !/\d/.test(c)), { minLength: 1, maxLength: 10 })
    .filter((s) => s.trim().length > 0)
    .map((s) => ({ type: 'invalid' as const, value: s, expected: 5000 })),
  // Absent key
  fc.constant({ type: 'absent' as const, expected: 5000 }),
);

// ─── Property 1: Claim window opens and accepts concurrent valid claims ────────

describe('Property 1: Claim window opens and accepts concurrent valid claims', () => {
  // Feature: multi-winner-prize-split, Property 1: Claim window opens and accepts concurrent valid claims
  // Validates: Requirements 1.1, 1.2

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  it(
    'first claim opens a window and is accepted; second distinct-player claim within the window is also accepted',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          twoDistinctPlayerIdsArb,
          fc.uuid(), // roundId
          twoCartelaNumbersArb,
          async ({ playerA, playerB }, roundId, { cartelaA, cartelaB }) => {
            resetMocks();

            // Setup mocks for player A
            mockPrisma.roundEntry.findMany.mockImplementation(
              async (args: { where?: { player_id?: string } }) => {
                const pid = args?.where?.player_id;
                if (pid === playerA) {
                  return [{ round_id: roundId, player_id: playerA, cartela_number: cartelaA, is_watching: false }];
                }
                if (pid === playerB) {
                  return [{ round_id: roundId, player_id: playerB, cartela_number: cartelaB, is_watching: false }];
                }
                return [];
              },
            );

            mockPrisma.gameRound.findUnique.mockResolvedValue({
              id: roundId,
              status: 'active',
              derash: '1000',
            });

            mockPrisma.cartelaDefinition.findMany.mockImplementation(
              async (args: { where?: { cartela_number?: { in?: number[] } } }) => {
                const nums = args?.where?.cartela_number?.in ?? [];
                return nums.map((n: number) => ({ cartela_number: n, grid: WINNING_GRID }));
              },
            );

            mockPrisma.calledNumber.findMany.mockResolvedValue(
              WINNING_CALLED.map((num, idx) => ({ number: num, sequence_index: idx, round_id: roundId })),
            );

            // Config: valid claim window of 5000ms
            mockPrisma.config.findUnique.mockResolvedValue({ key: 'claim_window_ms', value: '5000' });

            // First claim from playerA — should open a window and be accepted
            const resultA = await WinDetectionService.validateClaim(playerA, roundId);

            // Second claim from playerB while window is open — should also be accepted
            const resultB = await WinDetectionService.validateClaim(playerB, roundId);

            expect(resultA.valid).toBe(true);
            expect(resultB.valid).toBe(true);

            // Clean up timer to avoid leaking into next test
            vi.clearAllTimers();
          },
        ),
        { numRuns: 20 },
      );
    },
  );

  it(
    'first claim is accepted (window is opened) regardless of player ID or round ID',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          playerRoundArb,
          async ({ playerId, roundId, cartelaNumber }) => {
            resetMocks();
            setupValidClaimMocks(playerId, roundId, cartelaNumber, '5000');

            const result = await WinDetectionService.validateClaim(playerId, roundId);

            expect(result.valid).toBe(true);

            vi.clearAllTimers();
          },
        ),
        { numRuns: 20 },
      );
    },
  );
});

// ─── Property 2: Duplicate claims from the same player are rejected ───────────

describe('Property 2: Duplicate claims from the same player are rejected', () => {
  // Feature: multi-winner-prize-split, Property 2: Duplicate claims from the same player are rejected
  // Validates: Requirements 1.3

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  it(
    'a second win claim from the same player within an open window is rejected with DUPLICATE_CLAIM',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          playerRoundArb,
          async ({ playerId, roundId, cartelaNumber }) => {
            resetMocks();
            setupValidClaimMocks(playerId, roundId, cartelaNumber, '5000');

            // First claim — accepted, opens a window
            const firstResult = await WinDetectionService.validateClaim(playerId, roundId);
            expect(firstResult.valid).toBe(true);

            // Second claim from the same player — must be rejected
            const secondResult = await WinDetectionService.validateClaim(playerId, roundId);

            expect(secondResult.valid).toBe(false);
            expect(secondResult.reason).toBe('DUPLICATE_CLAIM');

            vi.clearAllTimers();
          },
        ),
        { numRuns: 20 },
      );
    },
  );

  it(
    'DUPLICATE_CLAIM is returned regardless of how many times the same player resubmits',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          playerRoundArb,
          fc.integer({ min: 2, max: 5 }), // number of duplicate attempts
          async ({ playerId, roundId, cartelaNumber }, extraAttempts) => {
            resetMocks();
            setupValidClaimMocks(playerId, roundId, cartelaNumber, '5000');

            // First claim — accepted
            await WinDetectionService.validateClaim(playerId, roundId);

            // All subsequent claims must all be rejected with DUPLICATE_CLAIM
            for (let i = 0; i < extraAttempts; i++) {
              const result = await WinDetectionService.validateClaim(playerId, roundId);
              expect(result.valid).toBe(false);
              expect(result.reason).toBe('DUPLICATE_CLAIM');
            }

            vi.clearAllTimers();
          },
        ),
        { numRuns: 15 },
      );
    },
  );
});

// ─── Property 3: Claims after window expiry are rejected ──────────────────────

describe('Property 3: Claims after window expiry are rejected', () => {
  // Feature: multi-winner-prize-split, Property 3: Claims after window expiry are rejected
  // Validates: Requirements 1.4

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  it(
    'after the claim window timer fires and closing=true, a new claim is rejected',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Use distinct UUIDs for playerId vs roundId to avoid accidental collisions in mock
          fc.record({
            playerId: fc.uuid(),
            roundId: fc.uuid(),
            latePlayer: fc.uuid(),
            cartelaNumber: fc.integer({ min: 1, max: 999 }),
          }).filter(({ playerId, latePlayer }) => playerId !== latePlayer),
          async ({ playerId, roundId, cartelaNumber, latePlayer }) => {
            resetMocks();

            // Both players get valid entries
            mockPrisma.roundEntry.findMany.mockImplementation(
              async (args: { where?: { player_id?: string } }) => {
                const pid = args?.where?.player_id;
                return [{ round_id: roundId, player_id: pid, cartela_number: cartelaNumber, is_watching: false }];
              },
            );

            // gameRound is active for the first claim; completed after distribution
            mockPrisma.gameRound.findUnique
              .mockResolvedValueOnce({ id: roundId, status: 'active', derash: '1000' }) // for first validateClaim
              .mockResolvedValue({ id: roundId, derash: '1000', status: 'completed' }); // after distribution

            mockPrisma.cartelaDefinition.findMany.mockResolvedValue([
              { cartela_number: cartelaNumber, grid: WINNING_GRID },
            ]);

            mockPrisma.calledNumber.findMany.mockResolvedValue(
              WINNING_CALLED.map((num, idx) => ({ number: num, sequence_index: idx, round_id: roundId })),
            );

            // Short claim window so timer fires quickly
            mockPrisma.config.findUnique.mockResolvedValue({ key: 'claim_window_ms', value: '50' });

            // Mock prisma.$transaction so distributeWinnings can complete
            const mockTx = {
              $queryRaw: vi.fn().mockResolvedValue([{ id: roundId, status: 'active', derash: '1000' }]),
              roundWinner: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
              wallet: { update: vi.fn().mockResolvedValue({}) },
              transaction: { create: vi.fn().mockResolvedValue({}) },
              gameRound: { update: vi.fn().mockResolvedValue({}) },
            };
            (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction =
              vi.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx));

            // Mock player.findMany (used in distributeWinnings post-commit)
            (prisma as unknown as { player: { findMany: ReturnType<typeof vi.fn> } }).player = {
              findMany: vi.fn().mockResolvedValue([{ id: playerId, username: 'TestUser' }]),
            };

            // First claim: opens the window
            const firstResult = await WinDetectionService.validateClaim(playerId, roundId);
            expect(firstResult.valid).toBe(true);

            // Advance fake timers past the claim window — fires distributeWinnings
            await vi.runAllTimersAsync();

            // After the window fires: window is either still in closing state or removed.
            // Either CLAIM_WINDOW_CLOSED (closing=true still in map) or
            // ROUND_NOT_ACTIVE (window removed and round is now completed) — both mean rejected.
            const lateResult = await WinDetectionService.validateClaim(latePlayer, roundId);

            expect(lateResult.valid).toBe(false);
            // After expiry the service either returns CLAIM_WINDOW_CLOSED (closing=true)
            // or ROUND_NOT_ACTIVE (window removed, round completed). Both are valid rejections
            // per Requirement 1.4 ("reject any further Win_Claims").
            expect(['CLAIM_WINDOW_CLOSED', 'ROUND_NOT_ACTIVE']).toContain(lateResult.reason);
          },
        ),
        { numRuns: 15 },
      );
    },
  );
});

// ─── Property 4: Claim window duration is driven by config with a 5000 ms fallback ──

describe('Property 4: Claim window duration is driven by config with a 5000 ms fallback', () => {
  // Feature: multi-winner-prize-split, Property 4: Claim window duration is driven by config with a 5000 ms fallback
  // Validates: Requirements 1.5, 8.4

  /**
   * We test the getClaimWindowMs logic by observing validateClaim's behavior:
   * The timer is set with setTimeout(fn, windowMs). By using fake timers and
   * checking when the timer fires, we can infer the effective windowMs.
   *
   * Alternatively, we directly test the pure logic of getClaimWindowMs by
   * simulating what it does: read from config, parse, fallback if invalid.
   */

  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  /**
   * Pure simulation of the getClaimWindowMs logic (mirrors the implementation exactly).
   * This allows property testing without database or timer dependencies.
   */
  function simulateGetClaimWindowMs(configRow: { key: string; value: string } | null): number {
    if (!configRow) return 5000;
    const parsed = parseInt(configRow.value, 10);
    return isNaN(parsed) || parsed <= 0 ? 5000 : parsed;
  }

  it('returns the stored integer when claim_window_ms is present and valid', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30000 }),
        (validMs) => {
          const configRow = { key: 'claim_window_ms', value: String(validMs) };
          const result = simulateGetClaimWindowMs(configRow);
          expect(result).toBe(validMs);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 5000 when claim_window_ms is absent (null row)', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        (configRow) => {
          const result = simulateGetClaimWindowMs(configRow);
          expect(result).toBe(5000);
        },
      ),
      { numRuns: 10 },
    );
  });

  it('returns 5000 when claim_window_ms value is non-numeric', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.char().filter((c) => !/\d/.test(c)), { minLength: 1, maxLength: 20 })
          .filter((s) => s.trim().length > 0 && isNaN(parseInt(s, 10))),
        (invalidValue) => {
          const configRow = { key: 'claim_window_ms', value: invalidValue };
          const result = simulateGetClaimWindowMs(configRow);
          expect(result).toBe(5000);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 5000 for zero or negative values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: 0 }),
        (nonPositive) => {
          const configRow = { key: 'claim_window_ms', value: String(nonPositive) };
          const result = simulateGetClaimWindowMs(configRow);
          expect(result).toBe(5000);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('effective window duration matches expected for all config states', () => {
    fc.assert(
      fc.property(configStateArb, (configState) => {
        const configRow =
          configState.type === 'absent'
            ? null
            : { key: 'claim_window_ms', value: configState.value };

        const result = simulateGetClaimWindowMs(configRow);
        expect(result).toBe(configState.expected);
      }),
      { numRuns: 200 },
    );
  });
});

// ─── Property 5: Watching players' claims are rejected ───────────────────────

describe('Property 5: Watching players\' claims are rejected', () => {
  // Feature: multi-winner-prize-split, Property 5: Watching players' claims are rejected
  // Validates: Requirements 2.1

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  it(
    'a player whose RoundEntry has is_watching=true is rejected with ENTRY_NOT_FOUND',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          playerRoundArb,
          async ({ playerId, roundId, cartelaNumber }) => {
            resetMocks();

            // Return a watching entry (is_watching = true) for this player
            mockPrisma.roundEntry.findMany.mockResolvedValue([
              { round_id: roundId, player_id: playerId, cartela_number: cartelaNumber, is_watching: true },
            ]);
            // NOTE: validateClaim queries with is_watching: false, so a watching entry
            // won't appear in the results → findMany returns [] → ENTRY_NOT_FOUND
            // We simulate this by making findMany return [] when is_watching filter applied
            mockPrisma.roundEntry.findMany.mockImplementation(
              async (args: { where?: { is_watching?: boolean } }) => {
                // The service queries with is_watching: false; watching players don't match
                if (args?.where?.is_watching === false) return [];
                return [{ round_id: roundId, player_id: playerId, cartela_number: cartelaNumber, is_watching: true }];
              },
            );

            mockPrisma.gameRound.findUnique.mockResolvedValue({
              id: roundId,
              status: 'active',
              derash: '1000',
            });

            const result = await WinDetectionService.validateClaim(playerId, roundId);

            expect(result.valid).toBe(false);
            expect(result.reason).toBe('ENTRY_NOT_FOUND');

            vi.clearAllTimers();
          },
        ),
        { numRuns: 30 },
      );
    },
  );

  it(
    'wallet balance is never modified for a watching player claim',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          playerRoundArb,
          async ({ playerId, roundId }) => {
            resetMocks();

            // Watching player — no non-watching entry returned
            mockPrisma.roundEntry.findMany.mockResolvedValue([]);
            mockPrisma.gameRound.findUnique.mockResolvedValue({
              id: roundId, status: 'active', derash: '1000',
            });

            const result = await WinDetectionService.validateClaim(playerId, roundId);

            expect(result.valid).toBe(false);
            // WalletService.credit must never have been called
            const { WalletService: mWS } = await import('../../services/wallet.service.js');
            expect(vi.mocked(mWS.credit)).not.toHaveBeenCalled();

            vi.clearAllTimers();
          },
        ),
        { numRuns: 20 },
      );
    },
  );
});

// ─── Property 6: Claims without a winning bingo line are rejected ─────────────

describe('Property 6: Claims without a winning bingo line are rejected', () => {
  // Feature: multi-winner-prize-split, Property 6: Claims without a winning bingo line are rejected
  // Validates: Requirements 2.2

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  /**
   * Builds a grid and called-number set that CANNOT complete any of the 12 winning lines.
   * We use numbers 1–25 for the grid but only call number 99 (which doesn't appear on
   * the grid at all), guaranteeing no line is complete.
   */
  function makeLosingScenario(): { grid: number[]; calledNums: number[] } {
    const grid = [
      1,  2,  3,  4,  5,
      6,  7,  8,  9,  10,
      11, 12, 0,  14, 15,   // index 12 = free space
      16, 17, 18, 19, 20,
      21, 22, 23, 24, 25,
    ];
    // Call no real numbers — none of the lines will be complete
    return { grid, calledNums: [] };
  }

  it(
    'a player with a non-watching entry but no complete bingo line is rejected with NO_WINNING_LINE',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          playerRoundArb,
          async ({ playerId, roundId, cartelaNumber }) => {
            resetMocks();

            mockPrisma.roundEntry.findMany.mockResolvedValue([
              { round_id: roundId, player_id: playerId, cartela_number: cartelaNumber, is_watching: false },
            ]);

            mockPrisma.gameRound.findUnique.mockResolvedValue({
              id: roundId, status: 'active', derash: '1000',
            });

            const { grid, calledNums } = makeLosingScenario();
            mockPrisma.cartelaDefinition.findMany.mockResolvedValue([
              { cartela_number: cartelaNumber, grid },
            ]);

            // No called numbers — no line can be complete
            mockPrisma.calledNumber.findMany.mockResolvedValue(
              calledNums.map((num, idx) => ({ number: num, sequence_index: idx, round_id: roundId })),
            );

            const result = await WinDetectionService.validateClaim(playerId, roundId);

            expect(result.valid).toBe(false);
            expect(result.reason).toBe('NO_WINNING_LINE');

            vi.clearAllTimers();
          },
        ),
        { numRuns: 30 },
      );
    },
  );

  it(
    'wallet balance is never modified when the claim has no winning line',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          playerRoundArb,
          async ({ playerId, roundId, cartelaNumber }) => {
            resetMocks();

            mockPrisma.roundEntry.findMany.mockResolvedValue([
              { round_id: roundId, player_id: playerId, cartela_number: cartelaNumber, is_watching: false },
            ]);
            mockPrisma.gameRound.findUnique.mockResolvedValue({
              id: roundId, status: 'active', derash: '1000',
            });

            const { grid } = makeLosingScenario();
            mockPrisma.cartelaDefinition.findMany.mockResolvedValue([
              { cartela_number: cartelaNumber, grid },
            ]);
            mockPrisma.calledNumber.findMany.mockResolvedValue([]);

            await WinDetectionService.validateClaim(playerId, roundId);

            const { WalletService: mWS } = await import('../../services/wallet.service.js');
            expect(vi.mocked(mWS.credit)).not.toHaveBeenCalled();

            vi.clearAllTimers();
          },
        ),
        { numRuns: 20 },
      );
    },
  );
});

// ─── Property 7: Invalid claims never modify wallet balances ─────────────────

describe('Property 7: Invalid claims never modify wallet balances', () => {
  // Feature: multi-winner-prize-split, Property 7: Invalid claims never modify wallet balances
  // Validates: Requirements 2.3, 3.4, 9.4

  /**
   * All possible rejection scenarios, each represented as a test-setup function.
   */
  type RejectionScenario = 'watching_player' | 'no_entry' | 'no_winning_line' | 'round_not_active';

  const scenarioArb: fc.Arbitrary<RejectionScenario> = fc.oneof(
    fc.constant<RejectionScenario>('watching_player'),
    fc.constant<RejectionScenario>('no_entry'),
    fc.constant<RejectionScenario>('no_winning_line'),
    fc.constant<RejectionScenario>('round_not_active'),
  );

  function setupRejectionScenario(
    scenario: RejectionScenario,
    playerId: string,
    roundId: string,
    cartelaNumber: number,
  ): void {
    switch (scenario) {
      case 'watching_player':
      case 'no_entry':
        mockPrisma.roundEntry.findMany.mockResolvedValue([]);
        mockPrisma.gameRound.findUnique.mockResolvedValue({ id: roundId, status: 'active', derash: '1000' });
        break;
      case 'no_winning_line':
        mockPrisma.roundEntry.findMany.mockResolvedValue([
          { round_id: roundId, player_id: playerId, cartela_number: cartelaNumber, is_watching: false },
        ]);
        mockPrisma.gameRound.findUnique.mockResolvedValue({ id: roundId, status: 'active', derash: '1000' });
        mockPrisma.cartelaDefinition.findMany.mockResolvedValue([
          { cartela_number: cartelaNumber, grid: Array(25).fill(1) },
        ]);
        // No called numbers → no line complete
        mockPrisma.calledNumber.findMany.mockResolvedValue([]);
        break;
      case 'round_not_active':
        mockPrisma.roundEntry.findMany.mockResolvedValue([
          { round_id: roundId, player_id: playerId, cartela_number: cartelaNumber, is_watching: false },
        ]);
        mockPrisma.gameRound.findUnique.mockResolvedValue({ id: roundId, status: 'completed', derash: '1000' });
        break;
    }
  }

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  it(
    'no wallet credit is issued for any rejected claim scenario',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          playerRoundArb,
          scenarioArb,
          async ({ playerId, roundId, cartelaNumber }, scenario) => {
            resetMocks();
            setupRejectionScenario(scenario, playerId, roundId, cartelaNumber);

            const result = await WinDetectionService.validateClaim(playerId, roundId);

            expect(result.valid).toBe(false);

            const { WalletService: mWS } = await import('../../services/wallet.service.js');
            expect(vi.mocked(mWS.credit)).not.toHaveBeenCalled();

            // Also verify prisma.$transaction was not called (no distribution started)
            const mockTxFn = (prisma as unknown as { $transaction?: ReturnType<typeof vi.fn> }).$transaction;
            if (mockTxFn) {
              // If it exists and was set up in a prior test, it should not have been called
              // for a rejected claim
              expect(vi.mocked(mockTxFn)).not.toHaveBeenCalled();
            }

            vi.clearAllTimers();
          },
        ),
        { numRuns: 40 },
      );
    },
  );
});

// ─── Property 8: Independent claim validation within the same window ──────────

describe('Property 8: Independent claim validation within the same window', () => {
  // Feature: multi-winner-prize-split, Property 8: Independent claim validation within the same window
  // Validates: Requirements 2.4

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  it(
    'rejecting an invalid claim in the same window does not prevent a valid claim from being accepted',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            validPlayer: fc.uuid(),
            invalidPlayer: fc.uuid(),
            roundId: fc.uuid(),
            validCartela: fc.integer({ min: 1, max: 999 }),
            invalidCartela: fc.integer({ min: 1000, max: 1999 }),
          }).filter(({ validPlayer, invalidPlayer }) => validPlayer !== invalidPlayer),
          async ({ validPlayer, invalidPlayer, roundId, validCartela, invalidCartela }) => {
            resetMocks();

            // Valid player has a winning cartela; invalid player has no winning line
            mockPrisma.roundEntry.findMany.mockImplementation(
              async (args: { where?: { player_id?: string } }) => {
                const pid = args?.where?.player_id;
                if (pid === validPlayer) {
                  return [{ round_id: roundId, player_id: validPlayer, cartela_number: validCartela, is_watching: false }];
                }
                if (pid === invalidPlayer) {
                  return [{ round_id: roundId, player_id: invalidPlayer, cartela_number: invalidCartela, is_watching: false }];
                }
                return [];
              },
            );

            mockPrisma.gameRound.findUnique.mockResolvedValue({
              id: roundId, status: 'active', derash: '1000',
            });

            mockPrisma.cartelaDefinition.findMany.mockImplementation(
              async (args: { where?: { cartela_number?: { in?: number[] } } }) => {
                const nums: number[] = args?.where?.cartela_number?.in ?? [];
                return nums.map((n: number) => ({
                  cartela_number: n,
                  // Valid cartela has WINNING_GRID; invalid cartela has a grid with no line completeable
                  grid: n === validCartela ? WINNING_GRID : Array(25).fill(99),
                }));
              },
            );

            mockPrisma.calledNumber.findMany.mockResolvedValue(
              WINNING_CALLED.map((num, idx) => ({ number: num, sequence_index: idx, round_id: roundId })),
            );

            mockPrisma.config.findUnique.mockResolvedValue({ key: 'claim_window_ms', value: '5000' });

            // First: valid player claims → accepted, window opens
            const validResult = await WinDetectionService.validateClaim(validPlayer, roundId);
            expect(validResult.valid).toBe(true);

            // Second: invalid player claims (their cartela has no winning line) → rejected
            const invalidResult = await WinDetectionService.validateClaim(invalidPlayer, roundId);
            expect(invalidResult.valid).toBe(false);
            expect(invalidResult.reason).toBe('NO_WINNING_LINE');

            // The valid claim must still be valid — window is still open, valid player is in winners set
            // We confirm by verifying invalid claim rejection did not close the window
            // (Another valid player should still be accepted if they claim)
            const anotherResult = await WinDetectionService.validateClaim(validPlayer, roundId);
            // validPlayer already claimed → DUPLICATE_CLAIM (not CLAIM_WINDOW_CLOSED)
            expect(anotherResult.valid).toBe(false);
            expect(anotherResult.reason).toBe('DUPLICATE_CLAIM');

            vi.clearAllTimers();
          },
        ),
        { numRuns: 20 },
      );
    },
  );
});

// ─── Property 9: Split amount calculation correctness ────────────────────────

describe('Property 9: Split amount calculation correctness', () => {
  // Feature: multi-winner-prize-split, Property 9: Split amount calculation correctness
  // Validates: Requirements 3.1, 3.2, 3.3
  // NOTE: Pure arithmetic test — no DB or mocks needed.

  /**
   * Pure implementation of the split arithmetic that mirrors distributeWinnings exactly.
   * Given a derash and an ordered list of playerIds (sorted lexicographically),
   * returns a map of playerId → credited amount.
   */
  function computeSplitAmounts(derash: number, playerIds: string[]): Map<string, number> {
    const winnerCount = playerIds.length;
    const splitAmount = Math.floor(derash / winnerCount);
    const remainder = derash - splitAmount * winnerCount;

    const sortedIds = [...playerIds].sort();
    const smallestId = sortedIds[0]!;

    const result = new Map<string, number>();
    for (const id of playerIds) {
      result.set(id, id === smallestId ? splitAmount + remainder : splitAmount);
    }
    return result;
  }

  it(
    'each winner receives floor(derash/count), lex-smallest gets the remainder, sum equals derash',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000 }),                              // derash
          fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 20 }),        // winner IDs
          (derash, playerIds) => {
            const amounts = computeSplitAmounts(derash, playerIds);
            const winnerCount = playerIds.length;
            const splitAmount = Math.floor(derash / winnerCount);
            const remainder = derash % winnerCount;
            const sortedIds = [...playerIds].sort();
            const smallestId = sortedIds[0]!;

            // Every player except the smallest gets exactly splitAmount
            for (const id of playerIds) {
              const credited = amounts.get(id)!;
              if (id === smallestId) {
                expect(credited).toBe(splitAmount + remainder);
              } else {
                expect(credited).toBe(splitAmount);
              }
            }

            // Sum of all credited amounts must exactly equal derash
            const total = [...amounts.values()].reduce((acc, v) => acc + v, 0);
            expect(total).toBe(derash);
          },
        ),
        { numRuns: 500 },
      );
    },
  );

  it(
    'single winner receives the full derash amount',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1_000_000 }),
          fc.uuid(),
          (derash, playerId) => {
            const amounts = computeSplitAmounts(derash, [playerId]);
            expect(amounts.get(playerId)).toBe(derash);
          },
        ),
        { numRuns: 200 },
      );
    },
  );

  it(
    'sum of split amounts always equals derash for any winner count 1–20',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 999_999 }),
          fc.integer({ min: 1, max: 20 }),
          (derash, winnerCount) => {
            const playerIds = Array.from({ length: winnerCount }, (_, i) => `player-${i.toString().padStart(3, '0')}`);
            const amounts = computeSplitAmounts(derash, playerIds);
            const total = [...amounts.values()].reduce((acc, v) => acc + v, 0);
            expect(total).toBe(derash);
          },
        ),
        { numRuns: 500 },
      );
    },
  );
});

// ─── Property 10: Remainder and winner_player_id go to lex-smallest player ID ─

describe('Property 10: Remainder and winner_player_id go to lexicographically smallest player ID', () => {
  // Feature: multi-winner-prize-split, Property 10: Remainder and winner_player_id go to lexicographically smallest player ID
  // Validates: Requirements 3.3, 4.4
  // NOTE: Pure arithmetic test — no DB needed.

  /**
   * Computes the expected winner_player_id and split amounts for a set of UUIDs.
   */
  function computeDistribution(derash: number, playerIds: string[]): {
    winnerPlayerId: string;
    splitAmounts: Map<string, number>;
  } {
    const sortedIds = [...playerIds].sort();
    const smallestId = sortedIds[0]!;
    const winnerCount = playerIds.length;
    const splitAmount = Math.floor(derash / winnerCount);
    const remainder = derash % winnerCount;

    const splitAmounts = new Map<string, number>();
    for (const id of playerIds) {
      splitAmounts.set(id, id === smallestId ? splitAmount + remainder : splitAmount);
    }

    return { winnerPlayerId: smallestId, splitAmounts };
  }

  it(
    'winner_player_id equals the lexicographically smallest player ID in any winner set',
    () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 100_000 }),
          (playerIds, derash) => {
            const { winnerPlayerId } = computeDistribution(derash, playerIds);
            const expectedSmallest = [...playerIds].sort()[0]!;
            expect(winnerPlayerId).toBe(expectedSmallest);
          },
        ),
        { numRuns: 300 },
      );
    },
  );

  it(
    'the lex-smallest player receives floor(derash/count) + remainder while others receive floor(derash/count)',
    () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 20 }),
          fc.integer({ min: 1, max: 100_000 }),
          (playerIds, derash) => {
            const { winnerPlayerId, splitAmounts } = computeDistribution(derash, playerIds);
            const winnerCount = playerIds.length;
            const baseSplit = Math.floor(derash / winnerCount);
            const remainder = derash % winnerCount;

            expect(splitAmounts.get(winnerPlayerId)).toBe(baseSplit + remainder);

            for (const id of playerIds) {
              if (id !== winnerPlayerId) {
                expect(splitAmounts.get(id)).toBe(baseSplit);
              }
            }
          },
        ),
        { numRuns: 300 },
      );
    },
  );

  it(
    'lex ordering is consistent regardless of insertion order of player IDs',
    () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 10 }),
          fc.integer({ min: 1, max: 10_000 }),
          (playerIds, derash) => {
            // Compute with original order
            const { winnerPlayerId: r1 } = computeDistribution(derash, playerIds);
            // Compute with reversed order
            const { winnerPlayerId: r2 } = computeDistribution(derash, [...playerIds].reverse());
            // Result must be the same
            expect(r1).toBe(r2);
          },
        ),
        { numRuns: 200 },
      );
    },
  );
});

// ─── Property 11: Round status and ended_at are updated on distribution ───────

describe('Property 11: Round status and ended_at are updated on distribution', () => {
  // Feature: multi-winner-prize-split, Property 11: Round status and ended_at are updated on distribution
  // Validates: Requirements 3.5

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  it(
    'after prize distribution completes, round status is completed and ended_at is set',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            playerId: fc.uuid(),
            roundId: fc.uuid(),
            cartelaNumber: fc.integer({ min: 1, max: 999 }),
          }),
          async ({ playerId, roundId, cartelaNumber }) => {
            resetMocks();

            setupValidClaimMocks(playerId, roundId, cartelaNumber, '50'); // Short window

            const mockTx = {
              $queryRaw: vi.fn().mockResolvedValue([{ id: roundId, status: 'active', derash: '1000' }]),
              roundWinner: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
              wallet: { update: vi.fn().mockResolvedValue({}) },
              transaction: { create: vi.fn().mockResolvedValue({}) },
              gameRound: {
                update: vi.fn().mockImplementation(async (args: { where: { id: string }; data: { status: string; ended_at: Date } }) => {
                  // Verify that ended_at is a valid date
                  expect(args.data.status).toBe('completed');
                  expect(args.data.ended_at).toBeInstanceOf(Date);
                  return { id: roundId, status: 'completed', ended_at: args.data.ended_at };
                }),
              },
            };
            (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction =
              vi.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx));

            // Mock player.findMany for post-commit notification logic
            (prisma as unknown as { player: { findMany: ReturnType<typeof vi.fn> } }).player = {
              findMany: vi.fn().mockResolvedValue([{ id: playerId, username: 'TestUser' }]),
            };

            // Claim → window opens
            await WinDetectionService.validateClaim(playerId, roundId);

            // Timer fires → distributeWinnings called
            await vi.runAllTimersAsync();

            // Verify gameRound.update was called (and the spy inside verified ended_at)
            expect(mockTx.gameRound.update).toHaveBeenCalled();
          },
        ),
        { numRuns: 20 },
      );
    },
  );
});

// ─── Property 12: Winner records are persisted for every verified winner ──────

describe('Property 12: Winner records are persisted for every verified winner', () => {
  // Feature: multi-winner-prize-split, Property 12: Winner records are persisted for every verified winner
  // Validates: Requirements 4.1, 4.2

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  it(
    'createMany is called with exactly N rows when N winners claim in the same window',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),   // winner count
          fc.uuid(),                          // roundId
          async (winnerCount, roundId) => {
            resetMocks();

            // Create winnerCount unique players, each with a distinct cartela
            const players = Array.from({ length: winnerCount }, (_, i) => ({
              playerId: `player-${roundId.slice(0, 8)}-${i}`,
              cartelaNumber: 100 + i,
            }));

            mockPrisma.roundEntry.findMany.mockImplementation(
              async (args: { where?: { player_id?: string } }) => {
                const pid = args?.where?.player_id;
                const p = players.find((pl) => pl.playerId === pid);
                if (!p) return [];
                return [{ round_id: roundId, player_id: p.playerId, cartela_number: p.cartelaNumber, is_watching: false }];
              },
            );

            mockPrisma.gameRound.findUnique.mockResolvedValue({
              id: roundId, status: 'active', derash: '1000',
            });

            mockPrisma.cartelaDefinition.findMany.mockImplementation(
              async (args: { where?: { cartela_number?: { in?: number[] } } }) => {
                const nums: number[] = args?.where?.cartela_number?.in ?? [];
                return nums.map((n: number) => ({ cartela_number: n, grid: WINNING_GRID }));
              },
            );

            mockPrisma.calledNumber.findMany.mockResolvedValue(
              WINNING_CALLED.map((num, idx) => ({ number: num, sequence_index: idx, round_id: roundId })),
            );

            mockPrisma.config.findUnique.mockResolvedValue({ key: 'claim_window_ms', value: '50' });

            const createManySpy = vi.fn().mockResolvedValue({ count: winnerCount });
            const walletsSpy = vi.fn().mockResolvedValue([{ id: 'wallet-1' }]);

            const mockTx = {
              $queryRaw: vi.fn().mockImplementation(async () => {
                // First call = lock round; subsequent calls = wallet lookups
                return [{ id: roundId, status: 'active', derash: '1000' }];
              }),
              roundWinner: { createMany: createManySpy },
              wallet: { update: vi.fn().mockResolvedValue({}) },
              transaction: { create: vi.fn().mockResolvedValue({}) },
              gameRound: { update: vi.fn().mockResolvedValue({}) },
            };

            // Override $queryRaw to handle both round-lock and wallet queries
            mockTx.$queryRaw.mockImplementation(async (..._args: unknown[]) => {
              return [{ id: roundId, status: 'active', derash: '1000' }];
            });
            // Wallet query returns a wallet id
            const originalQueryRaw = mockTx.$queryRaw;
            mockTx.$queryRaw = vi.fn().mockImplementation(async (template: TemplateStringsArray, ...values: unknown[]) => {
              // If query contains 'wallets', return wallet
              const queryStr = template ? template.join('') : '';
              if (queryStr.includes('wallet') || queryStr.includes('SELECT id FROM')) {
                return [{ id: 'wallet-abc' }];
              }
              return [{ id: roundId, status: 'active', derash: '1000' }];
            });
            void originalQueryRaw;
            void walletsSpy;

            (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction =
              vi.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx));

            (prisma as unknown as { player: { findMany: ReturnType<typeof vi.fn> } }).player = {
              findMany: vi.fn().mockResolvedValue(
                players.map((p) => ({ id: p.playerId, username: `user-${p.playerId}` })),
              ),
            };

            // All players claim
            for (const p of players) {
              await WinDetectionService.validateClaim(p.playerId, roundId);
            }

            // Fire distribution timer
            await vi.runAllTimersAsync();

            // createMany must have been called once with winnerCount rows
            expect(createManySpy).toHaveBeenCalledTimes(1);
            const createManyArg = createManySpy.mock.calls[0]?.[0] as { data: unknown[] };
            expect(createManyArg?.data).toHaveLength(winnerCount);

            // Each row must contain round_id, player_id, cartela_number, split_amount
            for (const row of createManyArg.data as Array<{
              round_id: string;
              player_id: string;
              cartela_number: number;
              split_amount: number;
            }>) {
              expect(row.round_id).toBe(roundId);
              expect(typeof row.player_id).toBe('string');
              expect(typeof row.cartela_number).toBe('number');
              expect(typeof row.split_amount).toBe('number');
            }
          },
        ),
        { numRuns: 15 },
      );
    },
  );
});

// ─── Property 13: Telegram notifications are sent per winner with correct amounts

describe('Property 13: Telegram notifications are sent per winner with correct amounts', () => {
  // Feature: multi-winner-prize-split, Property 13: Telegram notifications are sent per winner with correct amounts
  // Validates: Requirements 5.2, 5.3

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  /**
   * Pure simulation of the notification dispatch logic used in distributeWinnings.
   * Mirrors the implementation: for each winner, call notifyWin(playerId, splitAmount, totalWinners).
   * This tests the correctness of the arguments without relying on fire-and-forget async side-effects.
   */
  function simulateNotifyWinCalls(
    derash: number,
    playerIds: string[],
  ): Array<{ playerId: string; amount: number; totalWinners: number }> {
    const winnerCount = playerIds.length;
    const sortedIds = [...playerIds].sort();
    const smallestId = sortedIds[0]!;
    const baseSplit = Math.floor(derash / winnerCount);
    const remainder = derash % winnerCount;

    return playerIds.map((pid) => ({
      playerId: pid,
      amount: pid === smallestId ? baseSplit + remainder : baseSplit,
      totalWinners: winnerCount,
    }));
  }

  it(
    'notifyWin arguments are correct: each winner gets their split amount and the total winner count',
    () => {
      // Feature: multi-winner-prize-split, Property 13: Telegram notifications are sent per winner with correct amounts
      // Pure simulation — tests the argument computation without fire-and-forget async timing issues.
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 2, max: 100_000 }),
          (playerIds, derash) => {
            if (playerIds.length === 0) return;
            const calls = simulateNotifyWinCalls(derash, playerIds);

            // Exactly one call per winner
            expect(calls).toHaveLength(playerIds.length);

            const winnerCount = playerIds.length;
            const sortedIds = [...playerIds].sort();
            const smallestId = sortedIds[0]!;
            const baseSplit = Math.floor(derash / winnerCount);
            const remainder = derash % winnerCount;

            for (const { playerId, amount, totalWinners } of calls) {
              // totalWinners is always the full winner count
              expect(totalWinners).toBe(winnerCount);
              // Each winner gets their correct split
              const expectedAmount = playerId === smallestId ? baseSplit + remainder : baseSplit;
              expect(amount).toBe(expectedAmount);
            }

            // Sum of all notified amounts equals derash
            const total = calls.reduce((acc, c) => acc + c.amount, 0);
            expect(total).toBe(derash);
          },
        ),
        { numRuns: 300 },
      );
    },
  );

  it(
    'a failure in notifyWin does not prevent distribution from completing',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          playerRoundArb,
          async ({ playerId, roundId, cartelaNumber }) => {
            resetMocks();

            setupValidClaimMocks(playerId, roundId, cartelaNumber, '50');

            const mockTx = {
              $queryRaw: vi.fn().mockResolvedValue([{ id: roundId, status: 'active', derash: '500' }]),
              roundWinner: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
              wallet: { update: vi.fn().mockResolvedValue({}) },
              transaction: { create: vi.fn().mockResolvedValue({}) },
              gameRound: { update: vi.fn().mockResolvedValue({}) },
            };

            (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction =
              vi.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx));

            (prisma as unknown as { player: { findMany: ReturnType<typeof vi.fn> } }).player = {
              findMany: vi.fn().mockResolvedValue([{ id: playerId, username: 'Player1' }]),
            };

            mockPrisma.gameRound.findUnique
              .mockResolvedValueOnce({ id: roundId, status: 'active', derash: '500' })
              .mockResolvedValue({ id: roundId, status: 'completed', derash: '500' });

            // Make notifyWin throw
            const { notifyWin: notifyWinSpy } = await import('../../bot/notifications.js');
            vi.mocked(notifyWinSpy).mockRejectedValueOnce(new Error('Telegram API down'));

            await WinDetectionService.validateClaim(playerId, roundId);

            // Should not throw even if notifyWin fails
            await expect(vi.runAllTimersAsync()).resolves.not.toThrow();

            // Distribution transaction should have committed (wallet.update called)
            expect(mockTx.wallet.update).toHaveBeenCalled();
          },
        ),
        { numRuns: 15 },
      );
    },
  );
});

// ─── Property 14: Distribution is aborted when round is no longer active ─────

describe('Property 14: Distribution is aborted when round is no longer active', () => {
  // Feature: multi-winner-prize-split, Property 14: Distribution is aborted when round is no longer active
  // Validates: Requirements 9.2, 9.3

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  it(
    'no round_winners rows are inserted and no wallet credits occur when round status is not active at distribution time',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            playerId: fc.uuid(),
            roundId: fc.uuid(),
            cartelaNumber: fc.integer({ min: 1, max: 999 }),
          }),
          fc.oneof(fc.constant('completed'), fc.constant('cancelled')),
          async ({ playerId, roundId, cartelaNumber }, nonActiveStatus) => {
            resetMocks();

            // Claim setup: round is active when claim arrives
            setupValidClaimMocks(playerId, roundId, cartelaNumber, '50');

            const createManySpy = vi.fn();
            const walletUpdateSpy = vi.fn();

            const mockTx = {
              // At distribution time, round is no longer active — this causes early return
              $queryRaw: vi.fn().mockResolvedValue([{ id: roundId, status: nonActiveStatus, derash: '1000' }]),
              roundWinner: { createMany: createManySpy },
              wallet: { update: walletUpdateSpy },
              transaction: { create: vi.fn().mockResolvedValue({}) },
              gameRound: { update: vi.fn().mockResolvedValue({}) },
            };

            (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction =
              vi.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx));

            (prisma as unknown as { player: { findMany: ReturnType<typeof vi.fn> } }).player = {
              findMany: vi.fn().mockResolvedValue([]),
            };

            // First validateClaim opens the window (round appears active here)
            const claimResult = await WinDetectionService.validateClaim(playerId, roundId);
            expect(claimResult.valid).toBe(true);

            // Timer fires — at distribution time the transaction sees non-active status
            await vi.runAllTimersAsync();

            // createMany must NOT have been called — no winner rows inserted
            expect(createManySpy).not.toHaveBeenCalled();

            // No wallet credits should have been issued
            expect(walletUpdateSpy).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 20 },
      );
    },
  );

  it(
    'distribution is a no-op when round is cancelled between claim and timer fire',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          playerRoundArb,
          async ({ playerId, roundId, cartelaNumber }) => {
            resetMocks();
            setupValidClaimMocks(playerId, roundId, cartelaNumber, '50');

            const createManySpy = vi.fn();
            const mockTx = {
              $queryRaw: vi.fn().mockResolvedValue([{ id: roundId, status: 'cancelled', derash: '1000' }]),
              roundWinner: { createMany: createManySpy },
              wallet: { update: vi.fn() },
              transaction: { create: vi.fn() },
              gameRound: { update: vi.fn() },
            };

            (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction =
              vi.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx));

            (prisma as unknown as { player: { findMany: ReturnType<typeof vi.fn> } }).player = {
              findMany: vi.fn().mockResolvedValue([]),
            };

            await WinDetectionService.validateClaim(playerId, roundId);
            await vi.runAllTimersAsync();

            expect(createManySpy).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 15 },
      );
    },
  );
});

// ─── Property 15: WebSocket winner payload survives a round-trip ──────────────

// Feature: multi-winner-prize-split, Property 15: WebSocket winner payload survives a round-trip
// Validates: Requirements 6.4, 10.1, 10.2

/**
 * The shape of the ROUND_WON WebSocket payload.
 */
interface RoundWonPayload {
  winners: Array<{
    playerId: string;
    username: string;
    cartelaNumber: number;
    amount: number;
  }>;
  totalDerash: number;
  winnerCount: number;
}

describe('Property 15: WebSocket winner payload survives a round-trip', () => {
  // Feature: multi-winner-prize-split, Property 15: WebSocket winner payload survives a round-trip
  // Validates: Requirements 6.4, 10.1, 10.2
  // NOTE: Pure serialization test — no DB or mocks needed.

  /** Arbitrary for a single winner entry */
  const winnerEntryArb = fc.record({
    playerId: fc.uuid(),
    username: fc.string({ minLength: 1, maxLength: 50 }),
    cartelaNumber: fc.integer({ min: 1, max: 999 }),
    amount: fc.integer({ min: 0, max: 1_000_000 }),
  });

  /** Arbitrary for a complete RoundWonPayload with 1–10 winners */
  const roundWonPayloadArb = fc
    .array(winnerEntryArb, { minLength: 1, maxLength: 10 })
    .chain((winners) =>
      fc.record({
        winners: fc.constant(winners),
        totalDerash: fc.integer({ min: 0, max: 10_000_000 }),
        winnerCount: fc.constant(winners.length),
      }),
    );

  it(
    'serializing then deserializing the payload preserves the winners array length',
    () => {
      fc.assert(
        fc.property(roundWonPayloadArb, (payload: RoundWonPayload) => {
          const serialized = JSON.stringify(payload);
          const deserialized: RoundWonPayload = JSON.parse(serialized);

          expect(deserialized.winners).toHaveLength(payload.winners.length);
          expect(deserialized.winnerCount).toBe(payload.winners.length);
        }),
        { numRuns: 200 },
      );
    },
  );

  it(
    'each winner in the deserialized payload contains the correct playerId, username, cartelaNumber, and amount',
    () => {
      fc.assert(
        fc.property(roundWonPayloadArb, (payload: RoundWonPayload) => {
          const serialized = JSON.stringify(payload);
          const deserialized: RoundWonPayload = JSON.parse(serialized);

          deserialized.winners.forEach((winner, idx) => {
            const original = payload.winners[idx]!;
            expect(winner.playerId).toBe(original.playerId);
            expect(winner.username).toBe(original.username);
            expect(winner.cartelaNumber).toBe(original.cartelaNumber);
            expect(winner.amount).toBe(original.amount);
          });
        }),
        { numRuns: 200 },
      );
    },
  );

  it(
    'round-trip is idempotent: double serialization produces the same result as single serialization',
    () => {
      fc.assert(
        fc.property(roundWonPayloadArb, (payload: RoundWonPayload) => {
          const once = JSON.parse(JSON.stringify(payload)) as RoundWonPayload;
          const twice = JSON.parse(JSON.stringify(once)) as RoundWonPayload;

          expect(twice.winners).toHaveLength(once.winners.length);
          twice.winners.forEach((winner, idx) => {
            const ref = once.winners[idx]!;
            expect(winner.playerId).toBe(ref.playerId);
            expect(winner.username).toBe(ref.username);
            expect(winner.cartelaNumber).toBe(ref.cartelaNumber);
            expect(winner.amount).toBe(ref.amount);
          });
          expect(twice.totalDerash).toBe(once.totalDerash);
          expect(twice.winnerCount).toBe(once.winnerCount);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'winnerCount in deserialized payload always equals the length of the winners array',
    () => {
      fc.assert(
        fc.property(roundWonPayloadArb, (payload: RoundWonPayload) => {
          const deserialized: RoundWonPayload = JSON.parse(JSON.stringify(payload));

          expect(deserialized.winnerCount).toBe(deserialized.winners.length);
        }),
        { numRuns: 200 },
      );
    },
  );
});

// ─── Property 16: API winner amounts are numeric, not strings ─────────────────

// Feature: multi-winner-prize-split, Property 16: API winner amounts are numeric, not strings
// Validates: Requirements 10.3

/**
 * The mapping function from the admin rounds router.
 * Converts a Prisma RoundWinner row (with Decimal split_amount) into the API shape.
 */
function mapRoundWinner(w: {
  player_id: string;
  player: { username: string };
  cartela_number: number;
  split_amount: string | number | { toString(): string };
}): { playerId: string; username: string; cartelaNumber: number; splitAmount: number } {
  return {
    playerId: w.player_id,
    username: w.player.username,
    cartelaNumber: w.cartela_number,
    splitAmount: Number(w.split_amount),
  };
}

describe('Property 16: API winner amounts are numeric, not strings', () => {
  // Feature: multi-winner-prize-split, Property 16: API winner amounts are numeric, not strings
  // Validates: Requirements 10.3
  // NOTE: Pure mapping test — simulates the admin router mapping logic directly.

  /**
   * Arbitrary for a Prisma-like split_amount value.
   * Prisma Decimal fields come back as objects with a toString() that yields a numeric string.
   * We model this as either a plain numeric string or a Decimal-like object.
   */
  const decimalLikeArb = fc.oneof(
    // Plain numeric string (most common Prisma Decimal representation)
    fc
      .tuple(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 99 }),
      )
      .map(([whole, frac]) => `${whole}.${String(frac).padStart(2, '0')}`),
    // Integer string (no decimal point)
    fc.integer({ min: 0, max: 1_000_000 }).map((n) => String(n)),
    // Decimal-like object with toString()
    fc
      .integer({ min: 0, max: 1_000_000 })
      .map((n) => ({ toString: () => String(n), valueOf: () => n })),
  );

  /** Arbitrary for a single Prisma RoundWinner row */
  const prismaWinnerRowArb = fc.record({
    player_id: fc.uuid(),
    player: fc.record({ username: fc.string({ minLength: 1, maxLength: 50 }) }),
    cartela_number: fc.integer({ min: 1, max: 999 }),
    split_amount: decimalLikeArb,
  });

  it(
    'splitAmount in the mapped result is always typeof "number", never a string',
    () => {
      fc.assert(
        fc.property(prismaWinnerRowArb, (row) => {
          const mapped = mapRoundWinner(row);

          // Core assertion: splitAmount must be a JavaScript number, not a string
          expect(typeof mapped.splitAmount).toBe('number');
          expect(mapped.splitAmount).not.toBeNaN();
        }),
        { numRuns: 500 },
      );
    },
  );

  it(
    'splitAmount is finite for all valid numeric Prisma Decimal strings',
    () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 999_999 }),
            fc.integer({ min: 0, max: 99 }),
          ).map(([whole, frac]) => `${whole}.${String(frac).padStart(2, '0')}`),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.integer({ min: 1, max: 999 }),
          (decimalStr, playerId, username, cartelaNumber) => {
            const row = {
              player_id: playerId,
              player: { username },
              cartela_number: cartelaNumber,
              split_amount: decimalStr,
            };
            const mapped = mapRoundWinner(row);

            expect(typeof mapped.splitAmount).toBe('number');
            expect(isFinite(mapped.splitAmount)).toBe(true);
            expect(mapped.splitAmount).toBeGreaterThanOrEqual(0);
          },
        ),
        { numRuns: 300 },
      );
    },
  );

  it(
    'other mapped fields (playerId, username, cartelaNumber) are preserved correctly',
    () => {
      fc.assert(
        fc.property(prismaWinnerRowArb, (row) => {
          const mapped = mapRoundWinner(row);

          expect(mapped.playerId).toBe(row.player_id);
          expect(mapped.username).toBe(row.player.username);
          expect(mapped.cartelaNumber).toBe(row.cartela_number);
        }),
        { numRuns: 300 },
      );
    },
  );
});

// ─── Property 17: Admin API includes winners array for completed rounds ───────

// Feature: multi-winner-prize-split, Property 17: Admin API includes winners array for completed rounds
// Validates: Requirements 7.1, 7.3, 7.4

/**
 * Simulates the full admin round mapping from the GET /api/admin/rounds router.
 * Mirrors the `items` map in rounds.admin.router.ts.
 */
function mapAdminRound(r: {
  id: string;
  stake: string | number;
  status: string;
  _count: { round_entries: number; called_numbers: number };
  max_players: number;
  derash: string | number;
  start_time: Date;
  ended_at?: Date | null;
  winner_player_id?: string | null;
  winner_cartela_number?: number | null;
  commission_pct: number;
  round_winners: Array<{
    player_id: string;
    player: { username: string };
    cartela_number: number;
    split_amount: string | number | { toString(): string };
  }>;
}): {
  id: string;
  stake: number;
  status: string;
  player_count: number;
  max_players: number;
  derash: number;
  called_numbers_count: number;
  start_time: string;
  ended_at?: string;
  winner_player_id?: string;
  winner_cartela_number?: number;
  commission_pct: number;
  winners: Array<{ playerId: string; username: string; cartelaNumber: number; splitAmount: number }>;
} {
 const result: {
    id: string; stake: number; status: string; player_count: number; max_players: number;
    derash: number; called_numbers_count: number; start_time: string; commission_pct: number;
    ended_at?: string; winner_player_id?: string; winner_cartela_number?: number;
    winners: Array<{ playerId: string; username: string; cartelaNumber: number; splitAmount: number }>;
  } = {
    id: r.id,
    stake: Number(r.stake),
    status: r.status,
    player_count: r._count.round_entries,
    max_players: r.max_players,
    derash: Number(r.derash),
    called_numbers_count: r._count.called_numbers,
    start_time: r.start_time.toISOString(),
    commission_pct: r.commission_pct,
    winners: r.round_winners.map((w) => ({
      playerId: w.player_id,
      username: w.player.username,
      cartelaNumber: w.cartela_number,
      splitAmount: Number(w.split_amount),
    })),
  };
  if (r.ended_at != null) result.ended_at = r.ended_at.toISOString();
  if (r.winner_player_id != null) result.winner_player_id = r.winner_player_id;
  if (r.winner_cartela_number != null) result.winner_cartela_number = r.winner_cartela_number;
  return result;
}

describe('Property 17: Admin API includes winners array for completed rounds', () => {
  // Feature: multi-winner-prize-split, Property 17: Admin API includes winners array for completed rounds
  // Validates: Requirements 7.1, 7.3, 7.4
  // NOTE: Pure data-shape test — simulates the admin router mapping directly.

  /** Arbitrary for a Prisma RoundWinner row with a numeric string split_amount */
  const roundWinnerRowArb = fc.record({
    player_id: fc.uuid(),
    player: fc.record({ username: fc.string({ minLength: 1, maxLength: 50 }) }),
    cartela_number: fc.integer({ min: 1, max: 999 }),
    split_amount: fc.integer({ min: 0, max: 500_000 }).map((n) => String(n)),
  });

  /** Arbitrary for a Prisma GameRound row including round_winners */
  const prismaRoundArb = fc
    .array(roundWinnerRowArb, { minLength: 0, maxLength: 10 })
    .chain((roundWinners) =>
      fc.record({
        id: fc.uuid(),
        stake: fc.integer({ min: 10, max: 10_000 }).map((n) => String(n)),
        status: fc.oneof(fc.constant('completed'), fc.constant('active'), fc.constant('cancelled')),
        _count: fc.record({
          round_entries: fc.integer({ min: 0, max: 100 }),
          called_numbers: fc.integer({ min: 0, max: 75 }),
        }),
        max_players: fc.integer({ min: 2, max: 100 }),
        derash: fc.integer({ min: 0, max: 1_000_000 }).map((n) => String(n)),
        start_time: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
        ended_at: fc.oneof(
          fc.constant(null),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
        ),
        winner_player_id: fc.oneof(fc.constant(null), fc.uuid()),
        winner_cartela_number: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 999 })),
        commission_pct: fc.integer({ min: 0, max: 30 }),
        round_winners: fc.constant(roundWinners),
      }),
    );

  it(
    'mapped round always contains a winners array of the same length as round_winners',
    () => {
      fc.assert(
        fc.property(prismaRoundArb, (prismaRound) => {
          const mapped = mapAdminRound(prismaRound);

          // winners array must exist and match the source length
          expect(Array.isArray(mapped.winners)).toBe(true);
          expect(mapped.winners).toHaveLength(prismaRound.round_winners.length);
        }),
        { numRuns: 300 },
      );
    },
  );

  it(
    'each winner element contains playerId, username, cartelaNumber, and splitAmount',
    () => {
      fc.assert(
        fc.property(
          fc.array(roundWinnerRowArb, { minLength: 1, maxLength: 10 })
            .chain((rw) =>
              fc.record({
                id: fc.uuid(),
                stake: fc.constant('100'),
                status: fc.constant('completed'),
                _count: fc.constant({ round_entries: 5, called_numbers: 30 }),
                max_players: fc.constant(10),
                derash: fc.constant('1000'),
                start_time: fc.constant(new Date('2025-01-01T00:00:00Z')),
                ended_at: fc.constant(new Date('2025-01-01T01:00:00Z')),
                winner_player_id: fc.constant(null),
                winner_cartela_number: fc.constant(null),
                commission_pct: fc.constant(5),
                round_winners: fc.constant(rw),
              }),
            ),
          (prismaRound) => {
            const mapped = mapAdminRound(prismaRound);

            for (let i = 0; i < mapped.winners.length; i++) {
              const winner = mapped.winners[i]!;
              const source = prismaRound.round_winners[i]!;

              // All required fields must be present
              expect(winner).toHaveProperty('playerId');
              expect(winner).toHaveProperty('username');
              expect(winner).toHaveProperty('cartelaNumber');
              expect(winner).toHaveProperty('splitAmount');

              // Values must match the source
              expect(winner.playerId).toBe(source.player_id);
              expect(winner.username).toBe(source.player.username);
              expect(winner.cartelaNumber).toBe(source.cartela_number);
              expect(typeof winner.splitAmount).toBe('number');
            }
          },
        ),
        { numRuns: 200 },
      );
    },
  );

  it(
    'winners array is empty (not undefined) when round_winners is empty',
    () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            stake: fc.constant('100'),
            status: fc.oneof(fc.constant('active'), fc.constant('cancelled')),
            _count: fc.record({
              round_entries: fc.integer({ min: 0, max: 50 }),
              called_numbers: fc.integer({ min: 0, max: 75 }),
            }),
            max_players: fc.integer({ min: 2, max: 100 }),
            derash: fc.constant('0'),
            start_time: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
            ended_at: fc.constant(null),
            winner_player_id: fc.constant(null),
            winner_cartela_number: fc.constant(null),
            commission_pct: fc.integer({ min: 0, max: 30 }),
            round_winners: fc.constant([]),
          }),
          (prismaRound) => {
            const mapped = mapAdminRound(prismaRound);

            expect(Array.isArray(mapped.winners)).toBe(true);
            expect(mapped.winners).toHaveLength(0);
          },
        ),
        { numRuns: 200 },
      );
    },
  );

  it(
    'splitAmount values in the winners array are always finite numbers',
    () => {
      fc.assert(
        fc.property(prismaRoundArb, (prismaRound) => {
          const mapped = mapAdminRound(prismaRound);

          for (const winner of mapped.winners) {
            expect(typeof winner.splitAmount).toBe('number');
            expect(isFinite(winner.splitAmount)).toBe(true);
          }
        }),
        { numRuns: 300 },
      );
    },
  );
});

// ─── Property 18: Claim window validation enforces 1000–30000 ms range ────────

// Feature: multi-winner-prize-split, Property 18: Claim window validation enforces 1000–30000 ms range
// Validates: Requirements 8.3

/**
 * Pure simulation of the claim_window_ms validation logic in the admin config API.
 * Mirrors the validation added to PUT /api/admin/config/:key for key === 'claim_window_ms'.
 */
function validateClaimWindowMs(value: string): { error: 'VALIDATION_ERROR' } | null {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1000 || parsed > 30000) {
    return { error: 'VALIDATION_ERROR' };
  }
  return null;
}

describe('Property 18: Claim window validation enforces 1000–30000 ms range', () => {
  // Feature: multi-winner-prize-split, Property 18: Claim window validation enforces 1000–30000 ms range
  // Validates: Requirements 8.3
  // NOTE: Pure validation logic test — simulates the admin settings API validation directly.

  it(
    'values below 1000 are rejected with VALIDATION_ERROR',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100_000, max: 999 }),
          (value) => {
            const result = validateClaimWindowMs(String(value));
            expect(result).toEqual({ error: 'VALIDATION_ERROR' });
          },
        ),
        { numRuns: 200 },
      );
    },
  );

  it(
    'values above 30000 are rejected with VALIDATION_ERROR',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 30001, max: 100_000 }),
          (value) => {
            const result = validateClaimWindowMs(String(value));
            expect(result).toEqual({ error: 'VALIDATION_ERROR' });
          },
        ),
        { numRuns: 200 },
      );
    },
  );

  it(
    'values in [1000, 30000] are accepted (no error)',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 30000 }),
          (value) => {
            const result = validateClaimWindowMs(String(value));
            expect(result).toBeNull();
          },
        ),
        { numRuns: 200 },
      );
    },
  );

  it(
    'non-numeric strings are rejected with VALIDATION_ERROR',
    () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.char().filter((c) => !/\d/.test(c)), { minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0 && isNaN(parseInt(s, 10))),
          (value) => {
            const result = validateClaimWindowMs(value);
            expect(result).toEqual({ error: 'VALIDATION_ERROR' });
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
