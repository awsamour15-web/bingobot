import { describe, expect, it } from 'vitest';
import { safeNumber, formatMoney, formatWholeMoney } from '../lib/format';

describe('money formatting guards', () => {
  it('normalizes undefined and null wallet values to zero', () => {
    expect(safeNumber(undefined)).toBe(0);
    expect(safeNumber(null)).toBe(0);
    expect(safeNumber('')).toBe(0);
    expect(safeNumber('12.5')).toBe(12.5);
  });

  it('formats missing money values without throwing', () => {
    expect(formatMoney(undefined)).toBe('0.00');
    expect(formatMoney(null)).toBe('0.00');
    expect(formatWholeMoney(undefined)).toBe('0');
    expect(formatWholeMoney(null)).toBe('0');
  });
});
