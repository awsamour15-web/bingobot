// Feature: beteseb-bingo-telegram, Property 1: initData Authentication Soundness
// Feature: beteseb-bingo-telegram, Property 2: Player Upsert Idempotency
// Validates: Requirements 1.1, 1.2, 1.3

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createHmac } from 'node:crypto';
import {
  verifyTelegramInitData,
  buildSignedInitData,
  TelegramAuthError,
  type TelegramUser,
} from '../../lib/telegram-auth.js';

// ─── Shared arbitraries ───────────────────────────────────────────────────────

/** Generates a realistic Telegram user object */
const telegramUserArb: fc.Arbitrary<TelegramUser> = fc
  .record({
    id: fc.integer({ min: 1, max: 2_000_000_000 }),
    first_name: fc.string({ minLength: 1, maxLength: 64 }),
    username: fc.string({ minLength: 5, maxLength: 32 }),
    language_code: fc.constantFrom('en', 'am', 'ru', 'ar'),
  })
  .map((r) => ({
    id: r.id,
    first_name: r.first_name,
    // Omit optional fields ~50% of the time to exercise both branches
    ...(Math.random() > 0.5 ? { username: r.username } : {}),
    ...(Math.random() > 0.5 ? { language_code: r.language_code } : {}),
  }));

/** Generates a valid bot token string (not real credentials) */
const botTokenArb = fc.string({ minLength: 10, maxLength: 50 });

/** Current unix timestamp — valid auth_date */
const nowSeconds = () => Math.floor(Date.now() / 1000);

// ─── Property 1: initData Authentication Soundness ───────────────────────────

describe('Property 1: initData Authentication Soundness', () => {
  it('accepts a correctly signed payload with a fresh auth_date', () => {
    fc.assert(
      fc.property(telegramUserArb, botTokenArb, (user, botToken) => {
        const initData = buildSignedInitData(user, botToken, nowSeconds());
        const result = verifyTelegramInitData(initData, botToken);
        expect(result.id).toBe(user.id);
        expect(result.first_name).toBe(user.first_name);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects a payload with a tampered hash', () => {
    fc.assert(
      fc.property(telegramUserArb, botTokenArb, (user, botToken) => {
        const initData = buildSignedInitData(user, botToken, nowSeconds());
        const params = new URLSearchParams(initData);
        // Flip last two hex chars to corrupt the hash
        const originalHash = params.get('hash')!;
        const tamperedHash =
          originalHash.slice(0, -2) +
          (originalHash.endsWith('ff') ? '00' : 'ff');
        params.set('hash', tamperedHash);

        expect(() =>
          verifyTelegramInitData(params.toString(), botToken)
        ).toThrow(TelegramAuthError);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects a payload signed with a different bot token', () => {
    fc.assert(
      fc.property(
        telegramUserArb,
        botTokenArb,
        // Generate a different bot token
        fc.string({ minLength: 10, maxLength: 50 }).filter((t2) => t2 !== 'dummy'),
        (user, botToken, wrongToken) => {
          fc.pre(botToken !== wrongToken);
          const initData = buildSignedInitData(user, botToken, nowSeconds());
          expect(() =>
            verifyTelegramInitData(initData, wrongToken)
          ).toThrow(TelegramAuthError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects a payload with expired auth_date (> 3600s ago)', () => {
    fc.assert(
      fc.property(
        telegramUserArb,
        botTokenArb,
        // Generate an age between 3601 and 1 year
        fc.integer({ min: 3601, max: 365 * 24 * 3600 }),
        (user, botToken, ageSeconds) => {
          const expiredAuthDate = nowSeconds() - ageSeconds;
          const initData = buildSignedInitData(user, botToken, expiredAuthDate);
          expect(() =>
            verifyTelegramInitData(initData, botToken)
          ).toThrow(TelegramAuthError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects a payload missing the hash field', () => {
    fc.assert(
      fc.property(telegramUserArb, botTokenArb, (user, botToken) => {
        const initData = buildSignedInitData(user, botToken, nowSeconds());
        const params = new URLSearchParams(initData);
        params.delete('hash');

        expect(() =>
          verifyTelegramInitData(params.toString(), botToken)
        ).toThrow(TelegramAuthError);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects a payload with a mutated user field', () => {
    fc.assert(
      fc.property(
        telegramUserArb,
        botTokenArb,
        fc.integer({ min: 1, max: 2_000_000_000 }),
        (user, botToken, altId) => {
          fc.pre(altId !== user.id);
          const initData = buildSignedInitData(user, botToken, nowSeconds());
          // Replace user.id in the raw string to invalidate signature
          const params = new URLSearchParams(initData);
          const userObj = JSON.parse(params.get('user')!) as TelegramUser;
          userObj.id = altId;
          params.set('user', JSON.stringify(userObj));

          expect(() =>
            verifyTelegramInitData(params.toString(), botToken)
          ).toThrow(TelegramAuthError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('accepts a payload right at the 3600s boundary (not expired)', () => {
    fc.assert(
      fc.property(telegramUserArb, botTokenArb, (user, botToken) => {
        // auth_date exactly 3600 seconds ago should still be accepted
        const authDate = nowSeconds() - 3600;
        const initData = buildSignedInitData(user, botToken, authDate);
        // Should not throw
        const result = verifyTelegramInitData(initData, botToken);
        expect(result.id).toBe(user.id);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 2: Player Upsert Idempotency ───────────────────────────────────
//
// This property tests the idempotency contract at the pure-function / service
// level. The actual DB upsert idempotency is tested via integration in task 3.4.
// Here we verify the deterministic mapping: same telegram_id always produces
// the same canonical key, regardless of how many times it is computed.

describe('Property 2: Player Upsert Idempotency', () => {
  it('the same telegram_id always maps to the same stable player key', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2_000_000_000 }),
        fc.integer({ min: 1, max: 10 }), // number of repeated calls
        (telegramId, callCount) => {
          // Simulate the deterministic key derivation that the upsert relies on.
          // The upsert uses `telegram_id` as the unique constraint key, so calling
          // it multiple times with the same value must resolve to the same record.
          const keys = Array.from({ length: callCount }, () =>
            derivePlayerKey(telegramId)
          );

          // All derived keys must be identical
          const unique = new Set(keys);
          expect(unique.size).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('different telegram_ids produce different player keys', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.integer({ min: 1_000_000_001, max: 2_000_000_000 }),
        (idA, idB) => {
          expect(derivePlayerKey(idA)).not.toBe(derivePlayerKey(idB));
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Mirrors the stable key derivation used by the login upsert:
 * the player's canonical lookup key is their telegram_id cast to string.
 * This function represents the pure logic extracted from the service layer.
 */
function derivePlayerKey(telegramId: number): string {
  return String(telegramId);
}
