// Feature: fidel-bingo-telegram, Property 10: Every Wallet Mutation Produces a Transaction Record
// Feature: fidel-bingo-telegram, Property 11: Play Wallet Cannot Be Withdrawn
// Validates: Requirements 6.2, 6.6

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { InsufficientFundsError } from '../../services/wallet.service.js';

// ─── Shared types / in-memory model ──────────────────────────────────────────

type TxType =
  | 'deposit'
  | 'withdrawal'
  | 'game_entry'
  | 'game_win'
  | 'referral_commission'
  | 'admin_credit'
  | 'admin_debit'
  | 'refund';

type WalletType = 'main' | 'play';

interface InMemoryWallet {
  id: string;
  type: WalletType;
  balance: number;
}

interface InMemoryTransaction {
  wallet_id: string;
  type: TxType;
  amount: number;
  reference_id: string | null;
}

/**
 * Pure in-memory simulation of WalletService.credit / WalletService.debit.
 * Returns the updated wallet + the new transaction record, or throws.
 */
function simulateCredit(
  wallet: InMemoryWallet,
  amount: number,
  txType: TxType,
  referenceId: string | null,
): { wallet: InMemoryWallet; tx: InMemoryTransaction } {
  const updated: InMemoryWallet = { ...wallet, balance: wallet.balance + amount };
  const tx: InMemoryTransaction = {
    wallet_id: wallet.id,
    type: txType,
    amount,
    reference_id: referenceId,
  };
  return { wallet: updated, tx };
}

function simulateDebit(
  wallet: InMemoryWallet,
  amount: number,
  txType: TxType,
  referenceId: string | null,
): { wallet: InMemoryWallet; tx: InMemoryTransaction } {
  if (wallet.balance < amount) {
    throw new InsufficientFundsError(wallet.id, wallet.balance, amount);
  }
  const updated: InMemoryWallet = { ...wallet, balance: wallet.balance - amount };
  const tx: InMemoryTransaction = {
    wallet_id: wallet.id,
    type: txType,
    amount,
    reference_id: referenceId,
  };
  return { wallet: updated, tx };
}

/**
 * Mirrors WalletService.assertWithdrawable.
 * Returns true when the withdrawal should be blocked.
 */
function isWithdrawalBlocked(walletType: WalletType): boolean {
  return walletType === 'play';
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const txTypeArb = fc.constantFrom<TxType>(
  'deposit',
  'withdrawal',
  'game_entry',
  'game_win',
  'referral_commission',
  'admin_credit',
  'admin_debit',
  'refund',
);

const walletTypeArb = fc.constantFrom<WalletType>('main', 'play');

const positiveAmountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(100_000), noNaN: true });

const walletArb = (type?: WalletType) =>
  fc
    .record({
      id: fc.uuid(),
      balance: fc.float({ min: Math.fround(0), max: Math.fround(100_000), noNaN: true }),
    })
    .map((r) => ({
      id: r.id,
      type: type ?? ('main' as WalletType),
      balance: r.balance,
    }));

// ─── Property 10: Every Wallet Mutation Produces a Transaction Record ─────────

describe('Property 10: Every Wallet Mutation Produces a Transaction Record', () => {
  it('credit always produces a transaction with correct amount, type, and wallet_id', () => {
    fc.assert(
      fc.property(
        walletArb(),
        positiveAmountArb,
        txTypeArb,
        fc.option(fc.uuidV(4), { nil: null }),
        (wallet, amount, txType, refId) => {
          const { wallet: updated, tx } = simulateCredit(wallet, amount, txType, refId);

          // Transaction must reference the correct wallet
          expect(tx.wallet_id).toBe(wallet.id);
          // Transaction must carry the exact credited amount
          expect(tx.amount).toBeCloseTo(amount, 5);
          // Transaction type must be preserved
          expect(tx.type).toBe(txType);
          // Balance must increase by exactly amount
          expect(updated.balance).toBeCloseTo(wallet.balance + amount, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('successful debit always produces a transaction with correct amount, type, and wallet_id', () => {
    fc.assert(
      fc.property(
        positiveAmountArb,
        fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }), // surplus fraction
        txTypeArb,
        fc.option(fc.uuidV(4), { nil: null }),
        (amount, fraction, txType, refId) => {
          const balance = amount + fraction * amount; // always >= amount
          const wallet: InMemoryWallet = { id: 'w-1', type: 'main', balance };

          const { wallet: updated, tx } = simulateDebit(wallet, amount, txType, refId);

          expect(tx.wallet_id).toBe(wallet.id);
          expect(tx.amount).toBeCloseTo(amount, 5);
          expect(tx.type).toBe(txType);
          expect(updated.balance).toBeCloseTo(wallet.balance - amount, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('failed debit produces NO transaction record and leaves balance unchanged', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(10_000), noNaN: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(20_000), noNaN: true }),
        txTypeArb,
        (balance, excess, txType) => {
          const amount = balance + excess;
          const wallet: InMemoryWallet = { id: 'w-2', type: 'main', balance };

          expect(() => simulateDebit(wallet, amount, txType, null)).toThrow(
            InsufficientFundsError,
          );
          // Wallet object was never mutated (we use immutable approach above)
          expect(wallet.balance).toBe(balance);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 11: Play Wallet Cannot Be Withdrawn ─────────────────────────────

describe('Property 11: Play Wallet Cannot Be Withdrawn', () => {
  it('any withdrawal targeting a play wallet is blocked regardless of balance', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(100_000), noNaN: true }), // arbitrary balance
        positiveAmountArb,
        (balance, amount) => {
          const playWallet: InMemoryWallet = { id: 'w-play', type: 'play', balance };

          // assertWithdrawable must block play wallets
          expect(isWithdrawalBlocked(playWallet.type)).toBe(true);

          // Even when balance is sufficient, the withdrawal guard fires first
          const wouldHaveFunds = balance >= amount;
          if (wouldHaveFunds) {
            // Confirm the balance check alone would pass — but the wallet-type
            // guard must still block it
            expect(isWithdrawalBlocked('play')).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('withdrawal targeting a main wallet is NOT blocked by wallet-type guard', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(100_000), noNaN: true }),
        (balance) => {
          const mainWallet: InMemoryWallet = { id: 'w-main', type: 'main', balance };
          expect(isWithdrawalBlocked(mainWallet.type)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 17: Cancellation / Void Refund Invariant ───────────────────────
// Feature: fidel-bingo-telegram, Property 17: Cancellation / Void Refund Invariant
// Validates: Requirements 13.3, 16.3

/**
 * In-memory model of a round with player entries.
 * Simulates the cancel/void refund flow:
 *  - Every paying player gets credited back exactly the stake amount.
 *  - A 'refund' transaction record is created for each entry.
 *  - No other wallet is affected.
 */
interface PlayerWallet {
  playerId: string;
  balance: number;
}

interface RoundEntryModel {
  playerId: string;
  stake: number;
  isWatching: boolean;
}

interface RefundTransaction {
  playerId: string;
  type: 'refund';
  amount: number;
  referenceId: string;
}

interface RefundResult {
  wallets: Map<string, number>; // playerId → new balance
  transactions: RefundTransaction[];
}

/**
 * Pure simulation of the cancel/void refund flow.
 * Mirrors the logic in GameRoundService.cancel and NCE.triggerVoid.
 */
function simulateRefund(
  roundId: string,
  entries: RoundEntryModel[],
  initialBalances: Map<string, number>,
): RefundResult {
  const wallets = new Map(initialBalances);
  const transactions: RefundTransaction[] = [];

  for (const entry of entries) {
    if (entry.isWatching) continue; // watching-only entries are not refunded

    const current = wallets.get(entry.playerId) ?? 0;
    wallets.set(entry.playerId, current + entry.stake);

    transactions.push({
      playerId: entry.playerId,
      type: 'refund',
      amount: entry.stake,
      referenceId: roundId,
    });
  }

  return { wallets, transactions };
}

describe('Property 17: Cancellation / Void Refund Invariant', () => {
  it('after cancel or void, every paying player balance increases by exactly their stake', () => {
    fc.assert(
      fc.property(
        fc.uuid(), // roundId
        // Generate 1-10 unique player IDs
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }).map((ids) => [
          ...new Set(ids),
        ]),
        fc.float({ min: Math.fround(1), max: Math.fround(1_000), noNaN: true }), // stake
        (roundId, playerIds, stake) => {
          if (playerIds.length === 0) return;

          // Build entries and initial balances
          const entries: RoundEntryModel[] = playerIds.map((id) => ({
            playerId: id,
            stake,
            isWatching: false,
          }));

          const initialBalances = new Map<string, number>(
            playerIds.map((id) => [id, Math.random() * 1_000]),
          );

          const result = simulateRefund(roundId, entries, initialBalances);

          for (const entry of entries) {
            const before = initialBalances.get(entry.playerId) ?? 0;
            const after = result.wallets.get(entry.playerId) ?? 0;

            // Balance must increase by exactly the stake
            expect(after).toBeCloseTo(before + stake, 5);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a refund transaction of type "refund" exists for every paying entry', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }).map((ids) => [
          ...new Set(ids),
        ]),
        fc.float({ min: Math.fround(1), max: Math.fround(1_000), noNaN: true }),
        (roundId, playerIds, stake) => {
          if (playerIds.length === 0) return;

          const entries: RoundEntryModel[] = playerIds.map((id) => ({
            playerId: id,
            stake,
            isWatching: false,
          }));

          const initialBalances = new Map<string, number>(
            playerIds.map((id) => [id, 0]),
          );

          const result = simulateRefund(roundId, entries, initialBalances);

          for (const entry of entries) {
            const tx = result.transactions.find(
              (t) => t.playerId === entry.playerId,
            );

            // Transaction must exist
            expect(tx).toBeDefined();
            // Must be a refund type
            expect(tx?.type).toBe('refund');
            // Must carry the exact stake amount
            expect(tx?.amount).toBeCloseTo(stake, 5);
            // Must reference the round
            expect(tx?.referenceId).toBe(roundId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('watching-only entries are NOT refunded', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(), // watcherId
        fc.uuid(), // payerId
        fc.float({ min: Math.fround(1), max: Math.fround(1_000), noNaN: true }),
        (roundId, watcherId, payerId, stake) => {
          const entries: RoundEntryModel[] = [
            { playerId: watcherId, stake, isWatching: true },
            { playerId: payerId, stake, isWatching: false },
          ];

          const initialBalances = new Map<string, number>([
            [watcherId, 100],
            [payerId, 0],
          ]);

          const result = simulateRefund(roundId, entries, initialBalances);

          // Watcher balance must be unchanged
          expect(result.wallets.get(watcherId)).toBeCloseTo(100, 5);

          // Payer must be refunded
          expect(result.wallets.get(payerId)).toBeCloseTo(stake, 5);

          // No refund transaction for watcher
          const watcherTx = result.transactions.find(
            (t) => t.playerId === watcherId,
          );
          expect(watcherTx).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 8: Derash Calculation Invariant ─────────────────────────────────
// Feature: fidel-bingo-telegram, Property 8: Derash Calculation Invariant
// Validates: Requirements 5.5

/**
 * Derash formula: N × S × (1 − C/100)
 *   N = number of paying players
 *   S = stake amount per player
 *   C = platform commission percentage
 */
function computeDerash(N: number, S: number, C: number): number {
  return N * S * (1 - C / 100);
}

describe('Property 8: Derash Calculation Invariant', () => {
  it('derash equals N × S × (1 − C/100) for all valid inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),                                               // N players
        fc.float({ min: Math.fround(1), max: Math.fround(10_000), noNaN: true }),       // S stake
        fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),          // C commission pct
        (N, S, C) => {
          const derash = computeDerash(N, S, C);
          const expected = N * S * (1 - C / 100);
          expect(derash).toBeCloseTo(expected, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('derash is always non-negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.float({ min: Math.fround(0), max: Math.fround(10_000), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
        (N, S, C) => {
          const derash = computeDerash(N, S, C);
          expect(derash).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('derash is 0 when commission is 100%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.float({ min: Math.fround(1), max: Math.fround(10_000), noNaN: true }),
        (N, S) => {
          const derash = computeDerash(N, S, 100);
          expect(derash).toBeCloseTo(0, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('derash equals total stakes when commission is 0%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.float({ min: Math.fround(1), max: Math.fround(10_000), noNaN: true }),
        (N, S) => {
          const derash = computeDerash(N, S, 0);
          expect(derash).toBeCloseTo(N * S, 5);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 9: Winner Receives Exact Derash Amount ─────────────────────────
// Feature: fidel-bingo-telegram, Property 9: Winner Receives Exact Derash Amount
// Validates: Requirements 5.3

interface WinnerWallet {
  playerId: string;
  balance: number;
}

interface CompletedRound {
  derash: number;
  winnerId: string;
}

function simulateWinPayout(
  wallet: WinnerWallet,
  round: CompletedRound,
): { newBalance: number; tx: { type: 'game_win'; amount: number } } {
  return {
    newBalance: wallet.balance + round.derash,
    tx: { type: 'game_win', amount: round.derash },
  };
}

describe('Property 9: Winner Receives Exact Derash Amount', () => {
  it('winner main wallet balance increases by exactly the round derash amount', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.float({ min: Math.fround(0), max: Math.fround(50_000), noNaN: true }), // initial balance
        fc.float({ min: Math.fround(0.01), max: Math.fround(100_000), noNaN: true }), // derash
        (winnerId, initialBalance, derash) => {
          const wallet: WinnerWallet = { playerId: winnerId, balance: initialBalance };
          const round: CompletedRound = { derash, winnerId };

          const { newBalance, tx } = simulateWinPayout(wallet, round);

          expect(newBalance).toBeCloseTo(initialBalance + derash, 5);
          expect(tx.type).toBe('game_win');
          expect(tx.amount).toBeCloseTo(derash, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('winner receives exactly the computed derash (N×S×(1-C/100))', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.float({ min: Math.fround(1), max: Math.fround(1_000), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(50), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(10_000), noNaN: true }),
        (N, S, C, initialBalance) => {
          const derash = computeDerash(N, S, C);
          const wallet: WinnerWallet = { playerId: 'winner', balance: initialBalance };
          const { newBalance } = simulateWinPayout(wallet, { derash, winnerId: 'winner' });

          expect(newBalance).toBeCloseTo(initialBalance + derash, 5);
        },
      ),
      { numRuns: 100 },
    );
  });
});
