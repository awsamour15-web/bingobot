import { describe, expect, it } from 'vitest';
import { isRoundStartBlocked } from '../lib/round-start-flow';

describe('round-start-flow', () => {
  it('blocks duplicate round starts while a start is already in progress', () => {
    expect(isRoundStartBlocked({ joined: false, starting: false, startRequested: false })).toBe(false);
    expect(isRoundStartBlocked({ joined: false, starting: true, startRequested: true })).toBe(true);
    expect(isRoundStartBlocked({ joined: true, starting: false, startRequested: false })).toBe(true);
  });
});
