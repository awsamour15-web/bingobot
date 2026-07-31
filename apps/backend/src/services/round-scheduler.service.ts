// Round Scheduler Service
// Automatically maintains one pending round per stake level at all times.
// A new round is created 1 minute into the future whenever no pending round
// exists for a given stake level.
// When a round's start_time passes with zero entries, it is voided immediately.

import prisma from '../lib/prisma.js';
import { GameRoundService } from './game-round.service.js';
import { GameStatus } from '@beteseb/shared';

// ─── Config ──────────────────────────────────────────────────────────────────

/** Stake levels (in Birr) for which rounds are auto-created. */
const STAKE_LEVELS = [10, 20, 50];

/** How far ahead (ms) to schedule the round start_time. */
const LEAD_TIME_MS = 60_000; // 60 second lobby

/** How many players can join each auto-created round. */
const DEFAULT_MAX_PLAYERS = 800;

/** How often to check for missing pending rounds (ms). */
const CHECK_INTERVAL_MS = 15_000; // 15 seconds

// ─── Scheduler ───────────────────────────────────────────────────────────────

export const RoundScheduler = {
  _timer: undefined as ReturnType<typeof setInterval> | undefined,

  start(): void {
    console.log('[Scheduler] Starting round scheduler');
    // Ensure min_players_to_start is 1 so rounds always start
    void prisma.config.upsert({
      where: { key: 'min_players_to_start' },
      update: { value: '1' },
      create: { key: 'min_players_to_start', value: '1' },
    });
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

  async tick(): Promise<void> {
    await RoundScheduler.expireEmptyRounds();
    await RoundScheduler.ensureRoundsExist();
  },

  /**
   * Find pending rounds whose start_time has passed but have zero entries.
   * Mark them void immediately — no number calling, no winner.
   */
  async expireEmptyRounds(): Promise<void> {
    try {
      const overdue = await prisma.gameRound.findMany({
        where: {
          status: GameStatus.pending,
          start_time: { lte: new Date() },
        },
        include: {
          _count: { select: { round_entries: true } },
        },
      });

      for (const round of overdue) {
        // Always start the round when start_time passes — even with 0 players.
        // If no one has a cartela, numbers still get called for watchers.
        // The NCE will trigger void after all 75 numbers if no winner claims.
        try {
          await GameRoundService.start(round.id);
          console.log(`[Scheduler] Round ${round.id} auto-started (${round._count.round_entries} players)`);
        } catch (err) {
          console.error(`[Scheduler] Failed to start round ${round.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[Scheduler] expireEmptyRounds error:', err);
    }
  },

  /**
   * For each stake level, create a pending round if none currently exists.
   * Also cancels duplicate pending rounds (keeps only the earliest one).
   */
  async ensureRoundsExist(): Promise<void> {
    try {
      const pendingRounds = await prisma.gameRound.findMany({
        where: { status: GameStatus.pending },
        select: { id: true, stake: true, start_time: true },
        orderBy: { start_time: 'asc' },
      });

      // Group by stake — cancel all but the earliest
      const byStake = new Map<number, typeof pendingRounds>();
      for (const r of pendingRounds) {
        const stake = Number(r.stake);
        if (!byStake.has(stake)) byStake.set(stake, []);
        byStake.get(stake)!.push(r);
      }

      for (const [, rounds] of byStake) {
        // Keep rounds[0] (earliest), void the rest
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

      // Only create for allowed stakes (10, 20, 50)
      const pendingStakes = new Set([...byStake.keys()].filter((s) => STAKE_LEVELS.includes(s)));

      await Promise.all(
        STAKE_LEVELS.map(async (stake) => {
          if (pendingStakes.has(stake)) return;

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
