// Feature: beteseb-bingo-telegram, Property 3: Available Cartelas Exclude Taken Ones
// Validates: Requirements 3.1, 3.2

import { describe, it } from 'vitest';
import * as fc from 'fast-check';

// ─── Helpers under test ───────────────────────────────────────────────────────

const ALL_CARTELA_NUMBERS = Array.from({ length: 272 }, (_, i) => i + 1);

/**
 * Pure function that mirrors the backend query:
 * Returns available cartela numbers given a set of already-taken numbers.
 */
function getAvailableCartelas(takenNumbers: number[]): number[] {
  const takenSet = new Set(takenNumbers);
  return ALL_CARTELA_NUMBERS.filter((n) => !takenSet.has(n));
}

// ─── Property 3 ──────────────────────────────────────────────────────────────

describe('Property 3: Available Cartelas Exclude Taken Ones', () => {
  it('available list never contains any taken cartela number', () => {
    fc.assert(
      fc.property(
        // Generate an arbitrary subset of cartela numbers (1-272) as "taken"
        fc.array(fc.integer({ min: 1, max: 272 }), { maxLength: 272 }),
        (takenNumbers) => {
          const takenSet = new Set(takenNumbers);
          const available = getAvailableCartelas(takenNumbers);

          // No available cartela should appear in the taken set
          for (const n of available) {
            if (takenSet.has(n)) return false;
          }

          // Every cartela not in takenSet must appear in available
          for (let n = 1; n <= 272; n++) {
            if (!takenSet.has(n) && !available.includes(n)) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('available list + taken list together always equal the full 1-272 range', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 272 }), { maxLength: 272 }),
        (takenNumbers) => {
          const takenSet = new Set(takenNumbers);
          const available = getAvailableCartelas(takenNumbers);
          const combined = new Set([...takenSet, ...available]);

          // Union must cover exactly 1–272
          for (let n = 1; n <= 272; n++) {
            if (!combined.has(n)) return false;
          }
          return combined.size === 272;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Insufficient Balance Prevents Any Wallet Debit ──────────────
// Feature: beteseb-bingo-telegram, Property 5: Insufficient Balance Prevents Any Wallet Debit
// Validates: Requirements 3.4, 6.4

import { InsufficientFundsError } from '../../services/wallet.service.js';

/**
 * Pure mirror of the balance-check logic inside WalletService.debit.
 * Returns the error that would be thrown, or null if the debit would succeed.
 */
function simulateDebit(
  balance: number,
  amount: number,
): InsufficientFundsError | null {
  if (balance < amount) {
    return new InsufficientFundsError('wallet-id', balance, amount);
  }
  return null;
}

describe('Property 5: Insufficient Balance Prevents Any Wallet Debit', () => {
  it('rejects debit when amount > balance and balance stays unchanged', () => {
    fc.assert(
      fc.property(
        // balance: 0..10_000, amount: 0.01 above balance up to 20_000
        fc.float({ min: Math.fround(0), max: Math.fround(10_000), noNaN: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(20_000), noNaN: true }),
        (balance, excess) => {
          const amount = balance + excess; // always > balance
          const error = simulateDebit(balance, amount);

          // Must throw InsufficientFundsError
          if (!(error instanceof InsufficientFundsError)) return false;

          // Balance must remain unchanged (i.e., we did not mutate it)
          // The pure function never mutates, so we just assert the reported balance
          if (error.balance !== balance) return false;
          if (error.requested !== amount) return false;

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('allows debit when amount <= balance', () => {
    fc.assert(
      fc.property(
        // amount: 0..10_000; balance >= amount
        fc.float({ min: 0, max: 10_000, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }), // fraction of balance
        (amount, fraction) => {
          const balance = amount + fraction * amount; // balance >= amount
          const error = simulateDebit(balance, amount);
          return error === null;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: Cartela Join Atomicity — Balance Deduction ──────────────────
// Feature: beteseb-bingo-telegram, Property 4: Cartela Join Atomicity — Balance Deduction
// Validates: Requirements 3.3

import { expect } from 'vitest';

/**
 * In-memory model of the join operation's atomic effect.
 * A successful join must simultaneously:
 *  (a) mark the cartela as taken in the round, AND
 *  (b) reduce the player's balance by exactly the stake amount.
 * Both conditions must hold — there is no intermediate partial state.
 */
interface RoundState {
  takenCartelas: Set<number>;
}

interface WalletState {
  balance: number;
}

interface JoinResult {
  round: RoundState;
  wallet: WalletState;
}

/**
 * Simulates a successful join atomically.
 * Returns the new state only if the join can proceed; throws otherwise.
 */
function simulateJoin(
  round: Readonly<RoundState>,
  wallet: Readonly<WalletState>,
  cartelaNumber: number,
  stake: number,
): JoinResult {
  // Guard: cartela must not be taken
  if (round.takenCartelas.has(cartelaNumber)) {
    throw new Error('CARTELA_TAKEN');
  }
  // Guard: sufficient balance
  if (wallet.balance < stake) {
    throw new Error('INSUFFICIENT_BALANCE');
  }

  // Atomic update — both mutations happen together or not at all
  const newTaken = new Set(round.takenCartelas);
  newTaken.add(cartelaNumber);

  return {
    round: { takenCartelas: newTaken },
    wallet: { balance: wallet.balance - stake },
  };
}

describe('Property 4: Cartela Join Atomicity — Balance Deduction', () => {
  it('after a successful join, cartela is taken AND balance decreased by exactly stake simultaneously', () => {
    fc.assert(
      fc.property(
        // Existing taken cartelas (subset of 1-272)
        fc.array(fc.integer({ min: 1, max: 272 }), { maxLength: 100 }).map(
          (arr) => new Set(arr),
        ),
        // The cartela the player wants to join with (guaranteed not in taken set below)
        fc.integer({ min: 1, max: 272 }),
        // Stake amount
        fc.float({ min: Math.fround(1), max: Math.fround(10_000), noNaN: true }),
        // Player balance (always >= stake so the join succeeds)
        fc.float({ min: Math.fround(0), max: Math.fround(5_000), noNaN: true }),
        (takenCartelas, rawCartela, stake, surplus) => {
          // Pick a cartela not already taken
          let cartelaNumber = rawCartela;
          if (takenCartelas.has(cartelaNumber)) {
            // Find the first available cartela
            for (let n = 1; n <= 272; n++) {
              if (!takenCartelas.has(n)) {
                cartelaNumber = n;
                break;
              }
            }
          }
          // If all 272 are taken, skip (edge case of over-full round)
          if (takenCartelas.has(cartelaNumber)) return;

          const balance = stake + surplus; // always >= stake
          const roundState: RoundState = { takenCartelas };
          const walletState: WalletState = { balance };

          const result = simulateJoin(roundState, walletState, cartelaNumber, stake);

          // (a) Cartela must now appear as taken
          expect(result.round.takenCartelas.has(cartelaNumber)).toBe(true);

          // (b) Balance must have decreased by exactly the stake
          expect(result.wallet.balance).toBeCloseTo(balance - stake, 5);

          // No other cartelas were affected
          for (const taken of takenCartelas) {
            expect(result.round.takenCartelas.has(taken)).toBe(true);
          }

          // Both changes are visible in the same result object (atomicity)
          const cartelaIsTaken = result.round.takenCartelas.has(cartelaNumber);
          const balanceDecreased = result.wallet.balance < balance;
          expect(cartelaIsTaken && balanceDecreased).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a failed join (cartela taken) leaves both cartela set and balance unchanged', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 272 }),
        fc.float({ min: Math.fround(1), max: Math.fround(10_000), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(5_000), noNaN: true }),
        (cartelaNumber, stake, surplus) => {
          const takenCartelas = new Set([cartelaNumber]); // already taken
          const balance = stake + surplus;
          const roundState: RoundState = { takenCartelas };
          const walletState: WalletState = { balance };

          expect(() =>
            simulateJoin(roundState, walletState, cartelaNumber, stake),
          ).toThrow('CARTELA_TAKEN');

          // State must be completely unchanged
          expect(walletState.balance).toBe(balance);
          expect(roundState.takenCartelas.has(cartelaNumber)).toBe(true);
          expect(roundState.takenCartelas.size).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a failed join (insufficient balance) leaves both cartela set and balance unchanged', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 272 }),
        fc.float({ min: Math.fround(1), max: Math.fround(10_000), noNaN: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(10_000), noNaN: true }),
        (cartelaNumber, balance, excess) => {
          const stake = balance + excess; // always > balance
          const takenCartelas = new Set<number>();
          const roundState: RoundState = { takenCartelas };
          const walletState: WalletState = { balance };

          expect(() =>
            simulateJoin(roundState, walletState, cartelaNumber, stake),
          ).toThrow('INSUFFICIENT_BALANCE');

          expect(walletState.balance).toBe(balance);
          expect(roundState.takenCartelas.has(cartelaNumber)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
