import { describe, expect, it } from 'vitest';
import { TOTAL_CARTELAS } from '../../routes/rounds.router.js';

describe('Cartela availability range', () => {
  it('uses the real cartela count', () => {
    expect(TOTAL_CARTELAS).toBe(800);
  });
});
