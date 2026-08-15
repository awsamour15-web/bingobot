import { describe, expect, it } from 'vitest';
import { TOTAL_CARTELAS } from '../screens/CartelaScreen';

describe('CartelaScreen totals', () => {
  it('uses the real cartela count for the selection grid', () => {
    expect(TOTAL_CARTELAS).toBe(800);
  });
});
