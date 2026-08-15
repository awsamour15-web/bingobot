import { describe, it, expect } from 'vitest';
import { shouldHandleCurrentRoundEvent } from '../lib/round-event-guards';

describe('round end event filtering', () => {
  it('ignores void/cancel events for a different round', () => {
    expect(shouldHandleCurrentRoundEvent('round-123', 'round-999')).toBe(false);
  });

  it('accepts the matching round event for the current flow', () => {
    expect(shouldHandleCurrentRoundEvent('round-123', 'round-123')).toBe(true);
  });

  it('treats events without round ids as current-round-safe when no current round is known', () => {
    expect(shouldHandleCurrentRoundEvent(undefined, undefined)).toBe(true);
  });
});
