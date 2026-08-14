import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {
    gameRound: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    config: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../services/nce.service.js', () => ({
  nce: {
    activeTimers: new Map(),
    startingRounds: new Set(),
    stop: vi.fn(),
  },
}));

import prisma from '../lib/prisma.js';
import { nce } from '../services/nce.service.js';
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

  it('creates a pending round for a stake when the active DB row has no live NCE timer', async () => {
    vi.mocked(prisma.config.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.gameRound.findMany).mockImplementation(async ({ where }: any) => {
      if (where?.status === 'pending') return [];
      if (where?.status === 'active') return [{ id: 'active-round-1', stake: 10 }];
      return [];
    });
    vi.mocked(prisma.gameRound.create).mockResolvedValue({
      id: 'pending-round-1',
      stake: 10,
      status: 'pending',
      max_players: 800,
      start_time: new Date(Date.now() + 60000),
      commission_pct: 20,
      derash: 0,
      ended_at: null,
      winner_player_id: null,
      winner_cartela_number: null,
    } as any);
    nce.activeTimers.clear();
    nce.startingRounds.clear();

    await RoundScheduler.ensureRoundsExist();

    expect(prisma.gameRound.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stake: 10,
          status: 'pending',
        }),
      }),
    );
  });
});
