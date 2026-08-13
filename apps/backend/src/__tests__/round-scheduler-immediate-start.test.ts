import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoundScheduler } from '../services/round-scheduler.service';

describe('RoundScheduler immediate start behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    RoundScheduler.stop();
  });

  it('starts immediately and polls on a 1s cadence so rounds do not wait 10s to begin', async () => {
    const tickSpy = vi.spyOn(RoundScheduler, 'tick').mockResolvedValue();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 1 as any);

    RoundScheduler.start();

    expect(tickSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
  });
});
