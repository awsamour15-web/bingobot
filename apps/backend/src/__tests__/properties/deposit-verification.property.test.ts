// Feature: deposit-auto-verification
// Property 1 (Task 7.2): Idempotency — claiming the same tx_number N times results in exactly one wallet credit
// Property 2 (Task 7.3): Ledger consistency — sum of credited transactions equals sum of claimed PendingDeposit amounts
// Property 3 (Task 7.4): Already-claimed tx_number always returns an already-used error on re-submission
// Validates: Requirements 4.2, 4.3, 3.2, 3.4

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Shared types / in-memory model ──────────────────────────────────────────

type DepositStatus = 'pending' | 'claimed' | 'cancelled';

interface InMemoryPendingDeposit {
  id: string;
  tx_number: string;
  amount: number;
  status: DepositStatus;
  player_id: string | null;
  claimed_at: Date | null;
}

interface InMemoryWallet {
  id: string;
  balance: number;
  transactions: Array<{ type: string; amount: number; reference_id: string | null }>;
}

// ─── Pure simulation functions ────────────────────────────────────────────────

type ClaimResult =
  | { success: true }
  | { success: false; error: 'ALREADY_CLAIMED' | 'CANCELLED' };

/**
 * Pure in-memory simulation of the /txn command claim flow.
 * Mutates deposit and wallet in place (mirrors the atomic DB transaction).
 */
function simulateClaim(
  deposit: InMemoryPendingDeposit,
  wallet: InMemoryWallet,
  playerId: string,
): ClaimResult {
  if (deposit.status === 'claimed') {
    return { success: false, error: 'ALREADY_CLAIMED' };
  }
  if (deposit.status === 'cancelled') {
    return { success: false, error: 'CANCELLED' };
  }
  // status === 'pending' — atomic claim + credit
  deposit.status = 'claimed';
  deposit.player_id = playerId;
  deposit.claimed_at = new Date();

  wallet.balance += deposit.amount;
  wallet.transactions.push({
    type: 'deposit',
    amount: deposit.amount,
    reference_id: deposit.tx_number,
  });

  return { success: true };
}

/**
 * Processes an array of pending deposits one by one, calling simulateClaim on each.
 * Used for ledger consistency testing.
 */
function simulateClaimBatch(
  deposits: InMemoryPendingDeposit[],
  wallet: InMemoryWallet,
  playerId: string,
): ClaimResult[] {
  return deposits.map((deposit) => simulateClaim(deposit, wallet, playerId));
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const depositAmountArb = fc.float({
  min: Math.fround(1),
  max: Math.fround(100_000),
  noNaN: true,
});

const smallDepositAmountArb = fc.float({
  min: Math.fround(1),
  max: Math.fround(10_000),
  noNaN: true,
});

const repeatCountArb = fc.integer({ min: 1, max: 10 });

function makePendingDeposit(
  id: string,
  txNumber: string,
  amount: number,
): InMemoryPendingDeposit {
  return { id, tx_number: txNumber, amount, status: 'pending', player_id: null, claimed_at: null };
}

function makeWallet(id: string, initialBalance: number = 0): InMemoryWallet {
  return { id, balance: initialBalance, transactions: [] };
}

// ─── Property 1 (Task 7.2): Idempotency ──────────────────────────────────────

describe('Property 1 (Task 7.2): Idempotency — claiming the same tx_number N times results in exactly one wallet credit', () => {
  it('concrete example: claiming a deposit twice only credits the wallet once', () => {
    const deposit = makePendingDeposit('dep-1', 'TXN001', 500);
    const wallet = makeWallet('wallet-1');
    const playerId = 'player-1';

    const result1 = simulateClaim(deposit, wallet, playerId);
    const result2 = simulateClaim(deposit, wallet, playerId);

    expect(result1).toEqual({ success: true });
    expect(result2).toEqual({ success: false, error: 'ALREADY_CLAIMED' });
    expect(wallet.transactions).toHaveLength(1);
    expect(wallet.balance).toBeCloseTo(500, 2);
  });

  it('for any amount and N ≥ 1 submissions, exactly one credit occurs and all subsequent calls return ALREADY_CLAIMED', () => {
    fc.assert(
      fc.property(
        fc.uuid(),       // deposit id
        fc.uuid(),       // tx_number
        depositAmountArb,
        fc.uuid(),       // wallet id
        fc.uuid(),       // player id
        repeatCountArb,  // N
        (depositId, txNumber, amount, walletId, playerId, N) => {
          const deposit = makePendingDeposit(depositId, txNumber, amount);
          const wallet = makeWallet(walletId);

          const results: ClaimResult[] = [];
          for (let i = 0; i < N; i++) {
            results.push(simulateClaim(deposit, wallet, playerId));
          }

          // First call must succeed
          expect(results[0]).toEqual({ success: true });

          // All subsequent calls must return ALREADY_CLAIMED
          for (let i = 1; i < N; i++) {
            expect(results[i]).toEqual({ success: false, error: 'ALREADY_CLAIMED' });
          }

          // Exactly one transaction was created
          expect(wallet.transactions).toHaveLength(1);

          // Balance increased by exactly the deposit amount
          expect(wallet.balance).toBeCloseTo(amount, 2);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2 (Task 7.3): Ledger consistency ───────────────────────────────

describe('Property 2 (Task 7.3): Ledger consistency — sum of credited transactions equals sum of claimed PendingDeposit amounts', () => {
  it('concrete example: sum of wallet transactions equals sum of deposit amounts after batch claim', () => {
    const deposits = [
      makePendingDeposit('dep-1', 'TXN001', 100),
      makePendingDeposit('dep-2', 'TXN002', 250),
      makePendingDeposit('dep-3', 'TXN003', 50),
    ];
    const wallet = makeWallet('wallet-1', 0);
    const playerId = 'player-1';

    simulateClaimBatch(deposits, wallet, playerId);

    const txSum = wallet.transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const depositSum = deposits.reduce((sum, d) => sum + d.amount, 0);

    expect(txSum).toBeCloseTo(depositSum, 2);
    expect(wallet.balance).toBeCloseTo(depositSum, 2);
    expect(wallet.transactions).toHaveLength(3);
  });

  it('for any batch of 1–20 deposits, sum of wallet transactions equals sum of deposit amounts', () => {
    fc.assert(
      fc.property(
        fc.uuid(),  // wallet id
        fc.uuid(),  // player id
        fc.array(
          fc.record({
            id: fc.uuid(),
            txNumber: fc.uuid(),
            amount: smallDepositAmountArb,
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (walletId, playerId, depositSpecs) => {
          const deposits = depositSpecs.map((spec) =>
            makePendingDeposit(spec.id, spec.txNumber, spec.amount),
          );
          const wallet = makeWallet(walletId, 0);

          simulateClaimBatch(deposits, wallet, playerId);

          const txSum = wallet.transactions.reduce((sum, tx) => sum + tx.amount, 0);
          const depositSum = deposits.reduce((sum, d) => sum + d.amount, 0);

          // Sum of transaction amounts matches sum of deposit amounts
          expect(txSum).toBeCloseTo(depositSum, 2);

          // Wallet balance equals initial balance (0) + sum of deposit amounts
          expect(wallet.balance).toBeCloseTo(depositSum, 2);

          // Number of transactions equals number of deposits
          expect(wallet.transactions).toHaveLength(deposits.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3 (Task 7.4): Already-claimed tx_number always returns already-used error ──

describe('Property 3 (Task 7.4): Already-claimed tx_number always returns an already-used error on re-submission', () => {
  it('concrete example: already-claimed deposit returns ALREADY_CLAIMED for any player', () => {
    const deposit: InMemoryPendingDeposit = {
      id: 'dep-1',
      tx_number: 'TXN001',
      amount: 300,
      status: 'claimed',
      player_id: 'original-player',
      claimed_at: new Date(),
    };
    const wallet = makeWallet('wallet-1', 1000);

    const result = simulateClaim(deposit, wallet, 'some-other-player');

    expect(result).toEqual({ success: false, error: 'ALREADY_CLAIMED' });
    // Wallet must not be modified
    expect(wallet.transactions).toHaveLength(0);
    expect(wallet.balance).toBe(1000);
  });

  it('for any already-claimed deposit, simulateClaim returns ALREADY_CLAIMED regardless of the requester', () => {
    fc.assert(
      fc.property(
        fc.uuid(),        // deposit id
        fc.uuid(),        // tx_number
        depositAmountArb,
        fc.uuid(),        // original player who claimed it
        fc.uuid(),        // wallet id
        fc.float({ min: Math.fround(0), max: Math.fround(100_000), noNaN: true }), // initial balance
        fc.string(),      // any player id attempting re-claim
        (depositId, txNumber, amount, originalPlayerId, walletId, initialBalance, resubmittingPlayerId) => {
          const deposit: InMemoryPendingDeposit = {
            id: depositId,
            tx_number: txNumber,
            amount,
            status: 'claimed',
            player_id: originalPlayerId,
            claimed_at: new Date(),
          };
          const wallet = makeWallet(walletId, initialBalance);

          const result = simulateClaim(deposit, wallet, resubmittingPlayerId);

          // Must always return ALREADY_CLAIMED — regardless of who is asking
          expect(result).toEqual({ success: false, error: 'ALREADY_CLAIMED' });

          // Wallet must not be modified in any way
          expect(wallet.transactions).toHaveLength(0);
          expect(wallet.balance).toBeCloseTo(initialBalance, 2);
        },
      ),
      { numRuns: 100 },
    );
  });
});
