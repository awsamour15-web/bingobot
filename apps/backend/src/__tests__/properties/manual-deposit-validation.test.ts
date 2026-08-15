import { describe, it, expect } from 'vitest';
import { validateDepositReceipt } from '../../bot/index.js';

describe('validateDepositReceipt()', () => {
  it('accepts a matching Telebirr receipt and amount', () => {
    const result = validateDepositReceipt({
      receipt: `Your transaction number is DHD8R7PFDQ
Send to Abebe Bekele (0912345678)
transferred ETB 150.00 to`,
      expectedAmount: 150,
      accountPhone: '0912345678',
      accountName: 'Abebe Bekele',
    });

    expect(result.ok).toBe(true);
    expect(result.txNumber).toBe('DHD8R7PFDQ');
    expect(result.amount).toBe(150);
  });

  it('rejects a wrong amount', () => {
    const result = validateDepositReceipt({
      receipt: `Your transaction number is DHD8R7PFDQ
Send to Abebe Bekele (0912345678)
transferred ETB 250.00 to`,
      expectedAmount: 150,
      accountPhone: '0912345678',
      accountName: 'Abebe Bekele',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('AMOUNT_MISMATCH');
    }
  });
});
