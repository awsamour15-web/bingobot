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
const STAKE_LEVELS = [10, 20, 50, 100];

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
        if (round._count.round_entries === 0) {
          // No one joined — void without calling any numbers
          await prisma.gameRound.update({
            where: { id: round.id },
            data: { status: GameStatus.void, ended_at: new Date() },
          });
          console.log(`[Scheduler] Round ${round.id} voided — no players joined`);

          // Notify WebSocket layer
          if (GameRoundService._onRoundVoidEmpty) {
            await GameRoundService._onRoundVoidEmpty(round.id);
          }
        } else {
          // Players joined but round wasn't started yet — start it now
          try {
            await GameRoundService.start(round.id);
            console.log(`[Scheduler] Round ${round.id} auto-started with ${round._count.round_entries} players`);
          } catch (err) {
            console.error(`[Scheduler] Failed to start round ${round.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('[Scheduler] expireEmptyRounds error:', err);
    }
  },

  /**
   * For each stake level, create a pending round if none currently exists.
   */
  async ensureRoundsExist(): Promise<void> {
    try {
      const pendingRounds = await prisma.gameRound.findMany({
        where: { status: GameStatus.pending },
        select: { stake: true },
      });

      const pendingStakes = new Set(pendingRounds.map((r) => Number(r.stake)));

      const maxPlayersRow = await prisma.config.findUnique({
        where: { key: 'auto_round_max_players' },
      });
      const maxPlayers = maxPlayersRow
        ? parseInt(maxPlayersRow.value, 10)
        : DEFAULT_MAX_PLAYERS;

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
