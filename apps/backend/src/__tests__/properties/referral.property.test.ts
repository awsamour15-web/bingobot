// Feature: beteseb-bingo-telegram, Property 14: Referral Link Uniqueness
// Validates: Requirements 9.1

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Referral link generation (mirrors routes/referral.router.ts) ─────────────
//
// The referral link format is:
//   https://t.me/{botUsername}?start=ref_{telegramId}
//
// The uniqueness guarantee comes directly from the fact that telegram_id is
// unique per player (enforced at DB level). If every player has a distinct
// telegram_id, then their referral link identifier (`ref_<telegramId>`) is
// also distinct.

const BOT_USERNAME = 'BetesebBingoBot';

/**
 * Generates the referral link for a player given their Telegram ID.
 * Mirrors the logic in GET /api/referral/link.
 */
function buildReferralLink(telegramId: bigint): string {
  return `https://t.me/${BOT_USERNAME}?start=ref_${telegramId}`;
}

/**
 * Extracts the referral identifier from a referral link.
 * Returns the `ref_<telegramId>` portion of the start parameter.
 */
function extractReferralIdentifier(link: string): string {
  const url = new URL(link);
  return url.searchParams.get('start') ?? '';
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * Generates an arbitrary Telegram user ID (positive 64-bit-safe integer).
 * Telegram IDs are positive integers; we use a large but safe range.
 */
const telegramIdArb = fc.bigInt({ min: 1n, max: 9_999_999_999n });

/**
 * Generates an array of distinct Telegram IDs (simulates a set of players).
 * Uses uniqueArray to guarantee no duplicate IDs in the generated set.
 */
const distinctTelegramIdsArb = fc.uniqueArray(telegramIdArb, {
  minLength: 2,
  maxLength: 100,
});

// ─── Property 14: Referral Link Uniqueness ───────────────────────────────────

describe('Property 14: Referral Link Uniqueness', () => {
  it('distinct players have distinct referral links', () => {
    fc.assert(
      fc.property(distinctTelegramIdsArb, (telegramIds) => {
        const links = telegramIds.map((id) => buildReferralLink(id));

        // All generated links must be unique
        const uniqueLinks = new Set(links);
        expect(uniqueLinks.size).toBe(links.length);
      }),
      { numRuns: 100 },
    );
  });

  it('distinct players have distinct referral identifiers embedded in their links', () => {
    fc.assert(
      fc.property(distinctTelegramIdsArb, (telegramIds) => {
        const identifiers = telegramIds.map((id) =>
          extractReferralIdentifier(buildReferralLink(id)),
        );

        // All referral identifiers must be unique
        const uniqueIdentifiers = new Set(identifiers);
        expect(uniqueIdentifiers.size).toBe(identifiers.length);
      }),
      { numRuns: 100 },
    );
  });

  it('each referral identifier encodes exactly the player telegram_id', () => {
    fc.assert(
      fc.property(telegramIdArb, (telegramId) => {
        const link = buildReferralLink(telegramId);
        const identifier = extractReferralIdentifier(link);

        // Identifier must be in the format ref_<telegramId>
        expect(identifier).toBe(`ref_${telegramId}`);
      }),
      { numRuns: 100 },
    );
  });

  it('two players with the same telegram_id (impossible in DB, but pure check) produce the same link', () => {
    fc.assert(
      fc.property(telegramIdArb, (telegramId) => {
        // Same ID → same link (determinism)
        const linkA = buildReferralLink(telegramId);
        const linkB = buildReferralLink(telegramId);
        expect(linkA).toBe(linkB);
      }),
      { numRuns: 100 },
    );
  });

  it('referral link always starts with the expected bot URL prefix', () => {
    fc.assert(
      fc.property(telegramIdArb, (telegramId) => {
        const link = buildReferralLink(telegramId);
        expect(link.startsWith(`https://t.me/${BOT_USERNAME}?start=ref_`)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 15: Referral Commission Credited on Paid Round Completion ───────
// Feature: beteseb-bingo-telegram, Property 15: Referral Commission Credited on Paid Round Completion
// Validates: Requirements 9.3

/**
 * In-memory simulation of ReferralService.creditCommission.
 * After a paid round completes for a player who has a referrer, the referrer's
 * main wallet balance must increase by exactly stake × referral_commission_pct / 100,
 * and a referral_commission transaction record must exist.
 */
interface ReferralWallet {
  playerId: string;
  balance: number;
}

interface ReferralTx {
  fromPlayerId: string;   // the player whose round completed
  toReferrerId: string;   // the referrer who receives the commission
  type: 'referral_commission';
  amount: number;
  referenceId: string;    // roundId
}

function simulateCreditCommission(
  playerId: string,
  referrerId: string | null,
  roundId: string,
  stake: number,
  commissionPct: number,
  referrerInitialBalance: number,
): { referrerBalance: number; tx: ReferralTx | null } {
  if (!referrerId) {
    return { referrerBalance: referrerInitialBalance, tx: null };
  }

  const commissionAmount = stake * (commissionPct / 100);

  if (commissionAmount <= 0) {
    return { referrerBalance: referrerInitialBalance, tx: null };
  }

  return {
    referrerBalance: referrerInitialBalance + commissionAmount,
    tx: {
      fromPlayerId: playerId,
      toReferrerId: referrerId,
      type: 'referral_commission',
      amount: commissionAmount,
      referenceId: roundId,
    },
  };
}

describe('Property 15: Referral Commission Credited on Paid Round Completion', () => {
  it('referrer balance increases by exactly stake × commission_pct / 100 after a paid round', () => {
    fc.assert(
      fc.property(
        fc.uuid(),                                                // playerId
        fc.uuid(),                                               // referrerId
        fc.uuid(),                                               // roundId
        fc.float({ min: Math.fround(1), max: Math.fround(1_000), noNaN: true }), // stake
        fc.float({ min: Math.fround(0.1), max: Math.fround(50), noNaN: true }),  // commissionPct
        fc.float({ min: Math.fround(0), max: Math.fround(10_000), noNaN: true }), // referrerInitialBalance
        (playerId, referrerId, roundId, stake, commissionPct, initialBalance) => {
          const { referrerBalance, tx } = simulateCreditCommission(
            playerId,
            referrerId,
            roundId,
            stake,
            commissionPct,
            initialBalance,
          );

          const expectedCommission = stake * (commissionPct / 100);

          // Referrer balance must increase by exactly the commission amount
          expect(referrerBalance).toBeCloseTo(initialBalance + expectedCommission, 5);

          // A referral_commission transaction must exist
          expect(tx).not.toBeNull();
          expect(tx?.type).toBe('referral_commission');
          expect(tx?.amount).toBeCloseTo(expectedCommission, 5);
          expect(tx?.toReferrerId).toBe(referrerId);
          expect(tx?.referenceId).toBe(roundId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no commission is credited when the player has no referrer', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.float({ min: Math.fround(1), max: Math.fround(1_000), noNaN: true }),
        fc.float({ min: Math.fround(0.1), max: Math.fround(50), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(10_000), noNaN: true }),
        (playerId, roundId, stake, commissionPct, initialBalance) => {
          const { referrerBalance, tx } = simulateCreditCommission(
            playerId,
            null, // no referrer
            roundId,
            stake,
            commissionPct,
            initialBalance,
          );

          // Balance must remain unchanged
          expect(referrerBalance).toBeCloseTo(initialBalance, 5);
          // No transaction created
          expect(tx).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('commission amount equals stake multiplied by commission rate divided by 100', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1), max: Math.fround(1_000), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
        (stake, commissionPct) => {
          const { tx } = simulateCreditCommission(
            'player-1',
            'referrer-1',
            'round-1',
            stake,
            commissionPct,
            0,
          );

          if (commissionPct > 0) {
            expect(tx?.amount).toBeCloseTo(stake * (commissionPct / 100), 5);
          } else {
            expect(tx).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
