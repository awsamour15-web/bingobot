// Round Scheduler Service
// Automatically maintains one pending round per stake level at all times.

import prisma from '../lib/prisma.js';
import { GameRoundService } from './game-round.service.js';
import { nce } from './nce.service.js';
import { GameStatus } from '@beteseb/shared';

const STAKE_LEVELS = [10, 20, 50];
const LEAD_TIME_MS = 60_000;
const DEFAULT_MAX_PLAYERS = 800;
const CHECK_INTERVAL_MS = 15_000;

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

  /** Detect active rounds whose NCE timer died — resume them. */
  async recoverStaleActiveRounds(): Promise<void> {
    try {
      const callIntervalRow = await prisma.config.findUnique({
        where: { key: 'call_interval_ms' },
      });
      const callIntervalMs = callIntervalRow ? parseInt(callIntervalRow.value, 10) : 5_000;
      const maxActiveMs = 75 * callIntervalMs + 5 * 60_000;
      const staleThreshold = new Date(Date.now() - maxActiveMs);

      const staleRounds = await prisma.gameRound.findMany({
        where: { status: GameStatus.active, start_time: { lte: staleThreshold } },
        select: { id: true, stake: true },
      });

      for (const round of staleRounds) {
        if (nce.activeTimers.has(round.id)) continue;
        console.log(`[Scheduler] Stale active round ${round.id} (stake=${round.stake}) — resuming NCE`);
        void nce.start(round.id);
      }
    } catch (err) {
      console.error('[Scheduler] recoverStaleActiveRounds error:', err);
    }
  },

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

      // Group pending rounds by stake — void all but the earliest
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

      const maxPlayersRow = await prisma.config.findUnique({
        where: { key: 'auto_round_max_players' },
      });
      const maxPlayers = maxPlayersRow
        ? parseInt(maxPlayersRow.value, 10)
        : DEFAULT_MAX_PLAYERS;

      const pendingStakes = new Set<number>([...byStake.keys()]);
      const activeStakes = new Set<number>(activeRounds.map((r) => Number(r.stake)));

      await Promise.all(
        STAKE_LEVELS.map(async (stake) => {
          if (pendingStakes.has(stake)) return;
          if (activeStakes.has(stake)) {
            console.log(`[Scheduler] Skipping round creation for stake=${stake} — a round is still active`);
            return;
          }
          const startTime = new Date(Date.now() + LEAD_TIME_MS);
          const roundId = await GameRoundService.create(stake, startTime, maxPlayers);
          console.log(
            `[Scheduler] Created round ${roundId} | stake=${stake} Birr | starts=${startTime.toISOString()}`,
          );
        }),
      );
    } catch (err) {
      console.error('[Scheduler] ensureRoundsExist error:', err);
    }
  },
};
