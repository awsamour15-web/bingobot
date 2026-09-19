/**
 * Tests for the SMS webhook deposit flow.
 *
 * Covers:
 *  1. parseIncomingPaymentSms — all supported banks (Telebirr, CBE, BOA, Dashen, CBE Birr)
 *  2. parseIncomingTelebirrSms — legacy alias backward compatibility
 *  3. Flow model — httpSMS primary, admin fallback, idempotency
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseIncomingPaymentSms, parseIncomingTelebirrSms } from '../../routes/sms-webhook.router.js';

// ─── 1. Multi-bank SMS Parser ─────────────────────────────────────────────────

describe('parseIncomingPaymentSms() — all banks', () => {

  // ── Telebirr ─────────────────────────────────────────────────────────────

  describe('Telebirr', () => {
    it('English new format', () => {
      const r = parseIncomingPaymentSms(
        'You have received ETB 250.00 from 0911234567. Ref: DHD8R7PFDQ. Your new balance is ETB 1,234.56.',
      );
      expect(r).not.toBeNull();
      expect(r?.bank).toBe('telebirr');
      expect(r?.amount).toBe(250);
      expect(r?.senderPhone).toBe('0911234567');
      expect(r?.txNumber).toBe('DHD8R7PFDQ');
    });

    it('English older format', () => {
      const r = parseIncomingPaymentSms(
        'Telebirr: ETB 500.00 received from 0922345678. Transaction No: ABC1234567.',
      );
      expect(r?.bank).toBe('telebirr');
      expect(r?.amount).toBe(500);
      expect(r?.senderPhone).toBe('0922345678');
      expect(r?.txNumber).toBe('ABC1234567');
    });

    it('Amharic format', () => {
      const r = parseIncomingPaymentSms(
        'ከ 0911234567 ETB 250.00 ተቀብለዋል። Ref: DHD8R7PFDQ',
      );
      expect(r?.bank).toBe('telebirr');
      expect(r?.amount).toBe(250);
      expect(r?.senderPhone).toBe('0911234567');
      expect(r?.txNumber).toBe('DHD8R7PFDQ');
    });

    it('Amharic amount-first', () => {
      const r = parseIncomingPaymentSms(
        '250.00 ብር ከ 0911234567 ተቀብለዋል። ቁጥር DHD8R7PFDQ',
      );
      expect(r?.amount).toBe(250);
      expect(r?.txNumber).toBe('DHD8R7PFDQ');
    });

    it('Amharic with የሂሳብ tx reference', () => {
      const r = parseIncomingPaymentSms(
        'ከ 0911234567 250.00 ብር ተቀብለዋል። የሂሳብ እንቅስቃሴ ቁጥርዎ DHC8QENUF0 ነዉ።',
      );
      expect(r?.amount).toBe(250);
      expect(r?.txNumber).toBe('DHC8QENUF0');
    });

    it('comma-formatted amount ETB 1,250.00', () => {
      const r = parseIncomingPaymentSms(
        'You have received ETB 1,250.00 from 0911234567. Ref: DHD8R7PFDQ.',
      );
      expect(r?.amount).toBe(1250);
    });

    it('+251 international sender phone', () => {
      const r = parseIncomingPaymentSms(
        'You have received ETB 300.00 from +251911234567. Ref: REF1234567.',
      );
      expect(r?.senderPhone).toBe('+251911234567');
    });

    it('07xxxxxxxx sender phone', () => {
      const r = parseIncomingPaymentSms(
        'You have received ETB 75.00 from 0712345678. Ref: REF7654321X.',
      );
      expect(r?.senderPhone).toBe('0712345678');
    });

    it('Reference: prefix', () => {
      const r = parseIncomingPaymentSms('You have received ETB 100.00 from 0911234567. Reference: ABCD123456.');
      expect(r?.txNumber).toBe('ABCD123456');
    });

    it('Txn: prefix', () => {
      const r = parseIncomingPaymentSms('You have received ETB 100.00 from 0911234567. Txn: ABCD123456.');
      expect(r?.txNumber).toBe('ABCD123456');
    });

    it('fallback: standalone 10-char alphanumeric', () => {
      const r = parseIncomingPaymentSms('You have received ETB 100.00 from 0911234567. A1B2C3D4E5.');
      expect(r?.txNumber).toBe('A1B2C3D4E5');
    });
  });

  // ── CBE ───────────────────────────────────────────────────────────────────

  describe('CBE (Commercial Bank of Ethiopia)', () => {
    it('credited format with FT reference', () => {
      const r = parseIncomingPaymentSms(
        'ETB 500.00 credited to your account from Acc No 1000XXXXX3241. Ref No: FT26123456789',
      );
      expect(r).not.toBeNull();
      expect(r?.bank).toBe('cbe');
      expect(r?.amount).toBe(500);
      expect(r?.txNumber).toBe('FT26123456789');
      expect(r?.senderPhone).toBeNull();
    });

    it('deposited format', () => {
      const r = parseIncomingPaymentSms(
        'Dear Customer, ETB 200.00 has been deposited to your account. Transaction Ref: FT26987654321',
      );
      expect(r?.bank).toBe('cbe');
      expect(r?.amount).toBe(200);
      expect(r?.txNumber).toBe('FT26987654321');
    });

    it('standalone FT reference fallback', () => {
      const r = parseIncomingPaymentSms('ETB 750.00 has been credited. FT26000012345');
      expect(r?.amount).toBe(750);
      expect(r?.txNumber).toBe('FT26000012345');
    });

    it('real CBE received SMS with receipt URL as tx reference', () => {
      const r = parseIncomingPaymentSms(
        'Dear Abebe Zewedu W/amanueal You have received ETB 1,500.00 from account 1**9285 ' +
        '(Elfaz Tsegaye Dino) to your account 1**3878. Your current balance is ETB2,263.96. ' +
        'Thanks for Banking with CBE. https://mbreciept.cbe.com.et/v2-hfHCxH9dh3e3S5qZNMbt ' +
        'for feedback: https://forms.gle/kGNGQpG3mQCCk3iD6',
      );
      expect(r).not.toBeNull();
      expect(r?.bank).toBe('cbe');
      expect(r?.amount).toBe(1500);
      // tx extracted from receipt URL path: v2-hfHCxH9dh3e3S5qZNMbt
      expect(r?.txNumber).toBe('V2-HFHCXH9DH3E3S5QZNMBT');
      // CBE received SMS has no sender phone — only account number (masked)
      expect(r?.senderPhone).toBeNull();
    });
  });

  // ── BOA ───────────────────────────────────────────────────────────────────

  describe('BOA (Bank of Abyssinia)', () => {
    it('credited format', () => {
      const r = parseIncomingPaymentSms(
        'ETB 200.00 has been credited to your BOA account. Ref: BOA2026ABCDEF',
      );
      expect(r).not.toBeNull();
      expect(r?.bank).toBe('boa');
      expect(r?.amount).toBe(200);
      expect(r?.txNumber).toBe('BOA2026ABCDEF');
    });

    it('received format', () => {
      const r = parseIncomingPaymentSms(
        'Dear BOA Customer, you have received ETB 350.00. Reference: BOA2026XYZ789',
      );
      expect(r?.bank).toBe('boa');
      expect(r?.amount).toBe(350);
      expect(r?.txNumber).toBe('BOA2026XYZ789');
    });
  });

  // ── Dashen ────────────────────────────────────────────────────────────────

  describe('Dashen Bank', () => {
    it('credited format', () => {
      const r = parseIncomingPaymentSms(
        'ETB 300.00 credited to your account. Transaction Ref: DB20260112345',
      );
      expect(r).not.toBeNull();
      expect(r?.bank).toBe('dashen');
      expect(r?.amount).toBe(300);
      expect(r?.txNumber).toBe('DB20260112345');
    });

    it('received format with sender phone', () => {
      const r = parseIncomingPaymentSms(
        'Dashen: You have received ETB 400.00 from 0911234567. Ref: DB20260198765',
      );
      expect(r?.bank).toBe('dashen');
      expect(r?.amount).toBe(400);
      expect(r?.senderPhone).toBe('0911234567');
      expect(r?.txNumber).toBe('DB20260198765');
    });
  });

  // ── CBE Birr ─────────────────────────────────────────────────────────────

  describe('CBE Birr', () => {
    it('received format with phone and receipt number', () => {
      const r = parseIncomingPaymentSms(
        'ETB 150.00 received from 0912345678. Receipt No: CB20260512345',
      );
      expect(r).not.toBeNull();
      expect(r?.bank).toBe('cbebirr');
      expect(r?.amount).toBe(150);
      expect(r?.senderPhone).toBe('0912345678');
      expect(r?.txNumber).toBe('CB20260512345');
    });

    it('received with name in parentheses', () => {
      const r = parseIncomingPaymentSms(
        'You have received ETB 150.00 from 0912345678 (Meron). Receipt No: CB20260512345',
      );
      expect(r?.amount).toBe(150);
      expect(r?.txNumber).toBe('CB20260512345');
    });
  });

  // ── Rejection cases ───────────────────────────────────────────────────────

  describe('rejects non-received SMS', () => {
    it('sent confirmation (Telebirr)', () => {
      const r = parseIncomingPaymentSms('You have sent ETB 250.00 to 0911234567. Ref: DHD8R7PFDQ.');
      expect(r).toBeNull();
    });

    it('debit notification (CBE)', () => {
      const r = parseIncomingPaymentSms('ETB 500.00 debited from your account. Ref: FT26123456789');
      expect(r).toBeNull();
    });

    it('OTP message', () => {
      expect(parseIncomingPaymentSms('Your OTP is 123456. Valid for 5 minutes.')).toBeNull();
    });

    it('empty string', () => {
      expect(parseIncomingPaymentSms('')).toBeNull();
    });

    it('missing amount', () => {
      expect(parseIncomingPaymentSms('You received from 0911234567. Ref: ABC1234567.')).toBeNull();
    });
  });

  // ── Property ─────────────────────────────────────────────────────────────

  it('property: parsed amount is always > 0 when result is non-null', () => {
    fc.assert(
      fc.property(fc.string(), (sms) => {
        const r = parseIncomingPaymentSms(sms);
        if (r !== null) {
          expect(r.amount).toBeGreaterThan(0);
        }
      }),
      { numRuns: 500 },
    );
  });
});

// ─── 2. Legacy alias backward compat ─────────────────────────────────────────

describe('parseIncomingTelebirrSms() backward compat', () => {
  it('returns same result as parseIncomingPaymentSms for Telebirr SMS', () => {
    const sms = 'You have received ETB 250.00 from 0911234567. Ref: DHD8R7PFDQ.';
    const legacy = parseIncomingTelebirrSms(sms);
    const full = parseIncomingPaymentSms(sms);
    expect(legacy).not.toBeNull();
    expect(legacy?.amount).toBe(full?.amount);
    expect(legacy?.senderPhone).toBe(full?.senderPhone);
    expect(legacy?.txNumber).toBe(full?.txNumber);
  });

  it('returns null for CBE SMS (no sender phone)', () => {
    const r = parseIncomingTelebirrSms(
      'ETB 500.00 credited to your account. Ref No: FT26123456789',
    );
    expect(r).toBeNull();
  });
});

// ─── 3. Deposit flow model ────────────────────────────────────────────────────

describe('Deposit flow — httpSMS primary, admin fallback', () => {
  type DepositStatus = 'pending' | 'claimed' | 'cancelled';

  interface MockDeposit {
    tx_number: string;
    amount: number;
    status: DepositStatus;
    player_id: string | null;
  }

  interface MockWallet {
    balance: number;
    txCount: number;
  }

  function simulateWebhookClaim(
    deposit: MockDeposit,
    wallet: MockWallet,
    playerId: string,
  ): 'credited' | 'already_claimed' | 'cancelled' {
    if (deposit.status === 'claimed') return 'already_claimed';
    if (deposit.status === 'cancelled') return 'cancelled';
    deposit.status = 'claimed';
    deposit.player_id = playerId;
    wallet.balance += deposit.amount;
    wallet.txCount += 1;
    return 'credited';
  }

  function simulateAdminApprove(
    deposit: MockDeposit,
    wallet: MockWallet,
  ): 'credited' | 'already_claimed' | 'cancelled' | 'no_player' {
    if (!deposit.player_id) return 'no_player';
    if (deposit.status === 'claimed') return 'already_claimed';
    if (deposit.status === 'cancelled') return 'cancelled';
    deposit.status = 'claimed';
    wallet.balance += deposit.amount;
    wallet.txCount += 1;
    return 'credited';
  }

  it('webhook fires first → credited, admin is a no-op', () => {
    const deposit: MockDeposit = { tx_number: 'TX1', amount: 200, status: 'pending', player_id: 'p1' };
    const wallet: MockWallet = { balance: 0, txCount: 0 };
    expect(simulateWebhookClaim(deposit, wallet, 'p1')).toBe('credited');
    expect(simulateAdminApprove(deposit, wallet)).toBe('already_claimed');
    expect(wallet.txCount).toBe(1);
    expect(wallet.balance).toBe(200);
  });

  it('webhook never fires → admin approves → credited once', () => {
    const deposit: MockDeposit = { tx_number: 'TX2', amount: 500, status: 'pending', player_id: 'p1' };
    const wallet: MockWallet = { balance: 0, txCount: 0 };
    expect(simulateAdminApprove(deposit, wallet)).toBe('credited');
    expect(wallet.txCount).toBe(1);
    expect(wallet.balance).toBe(500);
  });

  it('webhook fires twice (retry) → only one credit', () => {
    const deposit: MockDeposit = { tx_number: 'TX3', amount: 100, status: 'pending', player_id: 'p1' };
    const wallet: MockWallet = { balance: 0, txCount: 0 };
    expect(simulateWebhookClaim(deposit, wallet, 'p1')).toBe('credited');
    expect(simulateWebhookClaim(deposit, wallet, 'p1')).toBe('already_claimed');
    expect(wallet.txCount).toBe(1);
  });

  it('cancelled deposit cannot be credited by webhook or admin', () => {
    const deposit: MockDeposit = { tx_number: 'TX4', amount: 300, status: 'cancelled', player_id: 'p1' };
    const wallet: MockWallet = { balance: 0, txCount: 0 };
    expect(simulateWebhookClaim(deposit, wallet, 'p1')).toBe('cancelled');
    expect(simulateAdminApprove(deposit, wallet)).toBe('cancelled');
    expect(wallet.txCount).toBe(0);
  });

  it('admin cannot approve without a linked player', () => {
    const deposit: MockDeposit = { tx_number: 'TX5', amount: 300, status: 'pending', player_id: null };
    const wallet: MockWallet = { balance: 0, txCount: 0 };
    expect(simulateAdminApprove(deposit, wallet)).toBe('no_player');
    expect(wallet.txCount).toBe(0);
  });

  it('property: webhook + admin combination never double-credits for any amount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1), max: Math.fround(100_000), noNaN: true }),
        fc.boolean(),
        fc.boolean(),
        (amount, webhookFires, adminTries) => {
          const deposit: MockDeposit = { tx_number: 'TX', amount, status: 'pending', player_id: 'p1' };
          const wallet: MockWallet = { balance: 0, txCount: 0 };
          if (webhookFires) simulateWebhookClaim(deposit, wallet, 'p1');
          if (adminTries) simulateAdminApprove(deposit, wallet);
          expect(wallet.txCount).toBeLessThanOrEqual(1);
          expect(wallet.balance === 0 || Math.abs(wallet.balance - amount) < 0.01).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});
