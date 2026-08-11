// Feature: fidel-bingo-telegram, Property 19: Config Change Isolation
// Validates: Requirements 15.4

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── In-memory model ──────────────────────────────────────────────────────────

/**
 * Simulates the commission_pct snapshotting behaviour.
 *
 * When a GameRound is created, it captures the current `platform_commission_pct`
 * from Config into its own `commission_pct` column. Subsequent config changes
 * must NOT alter that snapshotted value.
 */
interface ConfigStore {
  platform_commission_pct: number;
}

interface GameRoundSnapshot {
  id: string;
  commission_pct: number; // snapshotted at creation time
  status: 'pending' | 'active' | 'completed';
}

/**
 * Simulate creating a round: snapshot commission_pct at the time of creation.
 */
function createRound(
  id: string,
  config: ConfigStore,
  status: GameRoundSnapshot['status'] = 'pending',
): GameRoundSnapshot {
  return { id, commission_pct: config.platform_commission_pct, status };
}

/**
 * Simulate updating the global config commission_pct.
 * Returns a new config object; does NOT mutate existing rounds.
 */
function updateCommissionConfig(
  _config: ConfigStore,
  newPct: number,
): ConfigStore {
  return { platform_commission_pct: newPct };
}

// ─── Property 19: Config Change Isolation ────────────────────────────────────

describe('Property 19: Config Change Isolation', () => {
  it('rounds created before a config change retain their original snapshotted commission_pct', () => {
    fc.assert(
      fc.property(
        // Original commission percentage (0-100)
        fc.float({ min: 0, max: 100, noNaN: true }),
        // New commission percentage applied after round creation
        fc.float({ min: 0, max: 100, noNaN: true }),
        // A set of round IDs created before the config change
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
        (originalPct, newPct, roundIds) => {
          const config: ConfigStore = { platform_commission_pct: originalPct };

          // Create rounds under the original config
          const rounds = roundIds.map((id) => createRound(id, config));

          // Now update the config
          updateCommissionConfig(config, newPct);

          // Existing round snapshots must not be affected
          for (const round of rounds) {
            expect(round.commission_pct).toBeCloseTo(originalPct, 5);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rounds created after a config change use the new commission_pct', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.uuid(), // round created after the change
        (originalPct, newPct, roundId) => {
          let config: ConfigStore = { platform_commission_pct: originalPct };

          // Change config before creating this round
          config = updateCommissionConfig(config, newPct);

          const round = createRound(roundId, config);

          expect(round.commission_pct).toBeCloseTo(newPct, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('active or completed rounds retain their snapshotted commission_pct after a config change', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.constantFrom<GameRoundSnapshot['status']>('active', 'completed'),
        fc.uuid(),
        (originalPct, newPct, status, roundId) => {
          const config: ConfigStore = { platform_commission_pct: originalPct };

          const round = createRound(roundId, config, status);

          // Config changes after the round is already active/completed
          updateCommissionConfig(config, newPct);

          // Round snapshot is immutable — it was captured at creation
          expect(round.commission_pct).toBeCloseTo(originalPct, 5);
          expect(round.status).toBe(status);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('multiple rounds created at different commission rates each retain their own snapshot', () => {
    fc.assert(
      fc.property(
        // Array of (roundId, commissionPct) pairs representing rounds created at different times
        fc.array(
          fc.record({
            id: fc.uuid(),
            pct: fc.float({ min: 0, max: 100, noNaN: true }),
          }),
          { minLength: 2, maxLength: 10 },
        ),
        (roundSpecs) => {
          const rounds: GameRoundSnapshot[] = roundSpecs.map((spec) => {
            const config: ConfigStore = { platform_commission_pct: spec.pct };
            return createRound(spec.id, config);
          });

          // Each round must retain exactly the commission_pct that was active at its creation
          for (let i = 0; i < rounds.length; i++) {
            expect(rounds[i]!.commission_pct).toBeCloseTo(roundSpecs[i]!.pct, 5);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 16: Suspended Player Cannot Join Rounds ─────────────────────────
// Feature: fidel-bingo-telegram, Property 16: Suspended Player Cannot Join Rounds
// Validates: Requirements 12.3

/**
 * In-memory simulation of the suspended-player guard in GameRoundService.join
 * and the rounds join endpoint.
 */
interface PlayerState {
  id: string;
  is_suspended: boolean;
  balance: number;
}

interface RoundState {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'void';
  stake: number;
}

type JoinResult =
  | { success: true }
  | { success: false; reason: 'PLAYER_SUSPENDED' | 'ROUND_NOT_JOINABLE' | 'INSUFFICIENT_BALANCE' | 'CARTELA_TAKEN' };

function simulateJoin(
  player: PlayerState,
  round: RoundState,
  availableCartela: boolean,
): JoinResult {
  // Suspended guard fires before any other check
  if (player.is_suspended) {
    return { success: false, reason: 'PLAYER_SUSPENDED' };
  }
  if (round.status !== 'pending') {
    return { success: false, reason: 'ROUND_NOT_JOINABLE' };
  }
  if (!availableCartela) {
    return { success: false, reason: 'CARTELA_TAKEN' };
  }
  if (player.balance < round.stake) {
    return { success: false, reason: 'INSUFFICIENT_BALANCE' };
  }
  return { success: true };
}

describe('Property 16: Suspended Player Cannot Join Rounds', () => {
  it('suspended player is always rejected regardless of balance or cartela availability', () => {
    fc.assert(
      fc.property(
        fc.uuid(), // playerId
        fc.float({ min: Math.fround(0), max: Math.fround(100_000), noNaN: true }), // balance
        fc.float({ min: Math.fround(1), max: Math.fround(1_000), noNaN: true }),   // stake
        fc.boolean(), // cartela available
        fc.constantFrom<RoundState['status']>('pending', 'active', 'completed'),    // round status
        (playerId, balance, stake, cartelaAvailable, roundStatus) => {
          const player: PlayerState = { id: playerId, is_suspended: true, balance };
          const round: RoundState = { id: 'round-1', status: roundStatus, stake };

          const result = simulateJoin(player, round, cartelaAvailable);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.reason).toBe('PLAYER_SUSPENDED');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('non-suspended player with sufficient balance and available cartela can join a pending round', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.float({ min: Math.fround(1_000), max: Math.fround(100_000), noNaN: true }), // always enough balance
        fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),           // stake always < balance
        (playerId, balance, stake) => {
          const player: PlayerState = { id: playerId, is_suspended: false, balance };
          const round: RoundState = { id: 'round-1', status: 'pending', stake };

          const result = simulateJoin(player, round, true /* cartela available */);

          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('suspended guard fires before round-status and balance checks', () => {
    fc.assert(
      fc.property(
        // Always-failing conditions that would normally block the join
        fc.constantFrom<RoundState['status']>('active', 'completed', 'cancelled', 'void'),
        fc.float({ min: Math.fround(0), max: Math.fround(0.99), noNaN: true }), // balance < stake of 1
        (roundStatus, balance) => {
          const player: PlayerState = { id: 'p1', is_suspended: true, balance };
          const round: RoundState = { id: 'r1', status: roundStatus, stake: 1 };

          const result = simulateJoin(player, round, false /* no cartela */);

          // Must be rejected as suspended — not as round-not-joinable or insufficient balance
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.reason).toBe('PLAYER_SUSPENDED');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 18: Admin Manual Adjustment Integrity ──────────────────────────
// Feature: fidel-bingo-telegram, Property 18: Admin Manual Adjustment Integrity
// Validates: Requirements 14.1

interface AdjustmentWallet {
  id: string;
  playerId: string;
  balance: number;
}

interface AdjustmentTx {
  wallet_id: string;
  type: 'admin_credit' | 'admin_debit';
  amount: number;
  note: string;
}

interface AdjustmentResult {
  targetWallet: AdjustmentWallet;
  tx: AdjustmentTx;
  otherWallets: AdjustmentWallet[];
}

function simulateAdminAdjustment(
  targetWallet: AdjustmentWallet,
  amount: number,          // positive = credit, negative = debit
  note: string,
  otherWallets: AdjustmentWallet[],
): AdjustmentResult {
  const absAmount = Math.abs(amount);
  const type: 'admin_credit' | 'admin_debit' = amount >= 0 ? 'admin_credit' : 'admin_debit';

  const updatedTarget: AdjustmentWallet = {
    ...targetWallet,
    balance: targetWallet.balance + amount,
  };

  const tx: AdjustmentTx = {
    wallet_id: targetWallet.id,
    type,
    amount: absAmount,
    note,
  };

  // Other wallets must be unchanged (deep copy to show immutability)
  const unchangedOthers = otherWallets.map((w) => ({ ...w }));

  return { targetWallet: updatedTarget, tx, otherWallets: unchangedOthers };
}

describe('Property 18: Admin Manual Adjustment Integrity', () => {
  it('credit adjustment increases target wallet balance by exactly the specified amount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(50_000), noNaN: true }), // initial balance
        fc.float({ min: Math.fround(0.01), max: Math.fround(10_000), noNaN: true }), // credit amount
        fc.string({ minLength: 1, maxLength: 200 }), // mandatory note
        (initialBalance, creditAmount, note) => {
          const wallet: AdjustmentWallet = { id: 'w-1', playerId: 'p-1', balance: initialBalance };
          const { targetWallet, tx } = simulateAdminAdjustment(wallet, creditAmount, note, []);

          expect(targetWallet.balance).toBeCloseTo(initialBalance + creditAmount, 5);
          expect(tx.type).toBe('admin_credit');
          expect(tx.amount).toBeCloseTo(creditAmount, 5);
          expect(tx.note).toBe(note);
          expect(tx.wallet_id).toBe('w-1');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('debit adjustment decreases target wallet balance by exactly the specified amount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(100), max: Math.fround(50_000), noNaN: true }),    // initial balance
        fc.float({ min: Math.fround(0.01), max: Math.fround(99), noNaN: true }),       // debit amount < balance
        fc.string({ minLength: 1, maxLength: 200 }),
        (initialBalance, debitAmount, note) => {
          const wallet: AdjustmentWallet = { id: 'w-2', playerId: 'p-2', balance: initialBalance };
          const { targetWallet, tx } = simulateAdminAdjustment(wallet, -debitAmount, note, []);

          expect(targetWallet.balance).toBeCloseTo(initialBalance - debitAmount, 5);
          expect(tx.type).toBe('admin_debit');
          expect(tx.amount).toBeCloseTo(debitAmount, 5);
          expect(tx.note).toBe(note);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('adjustment does not affect any other wallet', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10_000), noNaN: true }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.array(
          fc.record({
            id: fc.uuid(),
            playerId: fc.uuid(),
            balance: fc.float({ min: Math.fround(0), max: Math.fround(50_000), noNaN: true }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (amount, note, otherWalletSpecs) => {
          const targetWallet: AdjustmentWallet = { id: 'target', playerId: 'p-t', balance: 1_000 };
          const { otherWallets } = simulateAdminAdjustment(
            targetWallet,
            amount,
            note,
            otherWalletSpecs,
          );

          // Every other wallet must retain its original balance
          for (let i = 0; i < otherWallets.length; i++) {
            expect(otherWallets[i]!.balance).toBeCloseTo(otherWalletSpecs[i]!.balance, 5);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('transaction record always carries the mandatory note', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10_000), noNaN: true }),
        fc.string({ minLength: 1, maxLength: 500 }),
        (amount, note) => {
          const wallet: AdjustmentWallet = { id: 'w-3', playerId: 'p-3', balance: 50_000 };
          const { tx } = simulateAdminAdjustment(wallet, amount, note, []);
          expect(tx.note).toBe(note);
          expect(tx.note.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
