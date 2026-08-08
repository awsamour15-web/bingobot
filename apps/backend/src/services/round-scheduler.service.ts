// Round Scheduler Service
// Automatically maintains one pending round per stake level at all times.

import prisma from '../lib/prisma.js';
import { GameRoundService } from './game-round.service.js';
import { nce } from './nce.service.js';
import { GameStatus } from '@fidel/shared';

const STAKE_LEVELS = [10, 20, 50];
const LEAD_TIME_MS = 60_000;
const DEFAULT_MAX_PLAYERS = 800;
const CHECK_INTERVAL_MS = 15_000;

// Prevents concurrent ensureRoundsExist calls from racing to create duplicate rounds
let ensureLock = false;

export const RoundScheduler = {
  _timer: undefined as ReturnType<typeof setInterval> | undefined,

  start(): void {
    console.log('[Scheduler] Starting round scheduler');
    void prisma.config.upsert({
      where: { key: 'call_interval_ms' },
      update: { value: '5000' },
      create: { key: 'call_interval_ms', value: '5000' },
    });
    void RoundScheduler.recoverActiveRounds();
    void RoundScheduler.tick();
    RoundScheduler._timer = setInterval(() => {
      void RoundScheduler.tick();
    }, CHECK_INTERVAL_MS);
  },

  stop(): void {
    if (RoundScheduler._timer !== undefined) {
      clearInterval(RoundScheduler._timer);
      RoundScheduler._timer = undefined;
    }
  },

  async recoverActiveRounds(): Promise<void> {
    try {
      const activeRounds = await prisma.gameRound.findMany({
        where: { status: GameStatus.active },
        select: { id: true, stake: true },
      });
      if (activeRounds.length === 0) return;
      console.log(`[Scheduler] Recovering ${activeRounds.length} interrupted active round(s)`);
      for (const round of activeRounds) {
        console.log(`[Scheduler] Resuming NCE for round ${round.id} (stake=${round.stake})`);
        void nce.start(round.id);
      }
    } catch (err) {
      console.error('[Scheduler] recoverActiveRounds error:', err);
    }
  },

  async tick(): Promise<void> {
    await RoundScheduler.expireEmptyRounds();
    await RoundScheduler.recoverStaleActiveRounds();
    await RoundScheduler.ensureRoundsExist();
  },

  // FIX Bug 2.1: check ALL active rounds for missing NCE timer, not just stale ones.
  async recoverStaleActiveRounds(): Promise<void> {
    try {
      const callIntervalRow = await prisma.config.findUnique({ where: { key: 'call_interval_ms' } });
      const callIntervalMs = callIntervalRow ? parseInt(callIntervalRow.value, 10) : 5_000;
      const staleThreshold = new Date(Date.now() - (75 * callIntervalMs + 5 * 60_000));

      const activeRounds = await prisma.gameRound.findMany({
        where: { status: GameStatus.active },
        select: { id: true, stake: true, start_time: true },
      });

      for (const round of activeRounds) {
        if (nce.activeTimers.has(round.id)) continue;
        const isStale = round.start_time <= staleThreshold;
        console.log(`[Scheduler] Timer-less active round ${round.id} (stake=${round.stake}, stale=${isStale}) - resuming NCE`);
        try {
          await nce.start(round.id);
        } catch (err) {
          console.error(`[Scheduler] NCE resume failed for ${round.id} - force-voiding:`, err);
          try {
            await prisma.gameRound.update({
              where: { id: round.id },
              data: { status: GameStatus.void, ended_at: new Date() },
            });
            console.log(`[Scheduler] Force-voided stuck active round ${round.id}`);
          } catch (voidErr) {
            console.error(`[Scheduler] Failed to force-void round ${round.id}:`, voidErr);
          }
        }
      }
    } catch (err) {
      console.error('[Scheduler] recoverStaleActiveRounds error:', err);
    }
  },

  // FIX Bug 2.2: void pending rounds with 0 players instead of starting them.
  async expireEmptyRounds(): Promise<void> {
    try {
      const overdue = await prisma.gameRound.findMany({
        where: { status: GameStatus.pending, start_time: { lte: new Date() } },
        include: { _count: { select: { round_entries: true } } },
      });

      for (const round of overdue) {
        if (round._count.round_entries === 0) {
          try {
            await prisma.gameRound.update({
              where: { id: round.id },
              data: { status: GameStatus.void, ended_at: new Date() },
            });
            console.log(`[Scheduler] Voided empty round ${round.id} (0 players)`);
            void RoundScheduler.ensureRoundsExist();
          } catch (err) {
            console.error(`[Scheduler] Failed to void empty round ${round.id}:`, err);
          }
        } else {
          try {
            await GameRoundService.start(round.id);
            console.log(`[Scheduler] Round ${round.id} auto-started (${round._count.round_entries} players)`);
            void RoundScheduler.ensureRoundsExist();
          } catch (err) {
            console.error(`[Scheduler] Failed to start round ${round.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('[Scheduler] expireEmptyRounds error:', err);
    }
  },

  async ensureRoundsExist(): Promise<void> {
    if (ensureLock) return;
    ensureLock = true;
    try {
      const [pendingRounds, activeRounds] = await Promise.all([
        prisma.gameRound.findMany({
          where: { status: GameStatus.pending },
          select: { id: true, stake: true, start_time: true },
          orderBy: { start_time: 'asc' },
        }),
        prisma.gameRound.findMany({
          where: { status: GameStatus.active },
          select: { id: true, stake: true },
        }),
      ]);

      const byStake = new Map<number, typeof pendingRounds>();
      for (const r of pendingRounds) {
        const stakeNum = Number(r.stake);
        if (!byStake.has(stakeNum)) byStake.set(stakeNum, []);
        byStake.get(stakeNum)!.push(r);
      }

      for (const [, rounds] of byStake) {
        for (let i = 1; i < rounds.length; i++) {
          await prisma.gameRound.update({
            where: { id: rounds[i]!.id },
            data: { status: GameStatus.void, ended_at: new Date() },
          });
          console.log(`[Scheduler] Voided duplicate pending round ${rounds[i]!.id}`);
        }
      }

      const maxPlayersRow = await prisma.config.findUnique({ where: { key: 'auto_round_max_players' } });
      const maxPlayers = maxPlayersRow ? parseInt(maxPlayersRow.value, 10) : DEFAULT_MAX_PLAYERS;

      const pendingStakes = new Set<number>([...byStake.keys()]);
      // FIX Bug 2.1: only skip if the active round also has a live NCE timer.
      const activeStakes = new Set<number>(
        activeRounds.filter((r) => nce.activeTimers.has(r.id)).map((r) => Number(r.stake)),
      );

      // Create missing rounds sequentially to avoid parallel inserts racing into the same stake slot
      const commissionRow = await prisma.config.findUnique({ where: { key: 'platform_commission_pct' } });
      const commissionPct = commissionRow ? parseFloat(commissionRow.value) : 20;

      for (const stake of STAKE_LEVELS) {
        if (pendingStakes.has(stake)) continue;
        if (activeStakes.has(stake)) {
          console.log(`[Scheduler] Skipping round creation for stake=${stake} - a round is still active`);
          continue;
        }
        const startTime = new Date(Date.now() + LEAD_TIME_MS);
        try {
          const round = await prisma.gameRound.create({
            data: {
              stake,
              status: GameStatus.pending,
              max_players: maxPlayers,
              start_time: startTime,
              commission_pct: commissionPct,
              derash: 0,
            },
          });
          console.log(`[Scheduler] Created round ${round.id} | stake=${stake} Birr | starts=${startTime.toISOString()}`);
        } catch (err: unknown) {
          if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
            console.log(`[Scheduler] Skipping stake=${stake} - concurrent insert created pending round first`);
          } else {
            console.error(`[Scheduler] Failed to create round for stake=${stake}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('[Scheduler] ensureRoundsExist error:', err);
    } finally {
      ensureLock = false;
    }
  },
};
