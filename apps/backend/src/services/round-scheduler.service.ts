// Round Scheduler Service
// Automatically maintains one pending round per stake level at all times.
// A new round is created 1 minute into the future whenever no pending round
// exists for a given stake level.

import prisma from '../lib/prisma.js';
import { GameRoundService } from './game-round.service.js';
import { GameStatus } from '@beteseb/shared';

// ─── Config ──────────────────────────────────────────────────────────────────

/** Stake levels (in Birr) for which rounds are auto-created. */
const STAKE_LEVELS = [10, 20, 50, 100];

/** How far ahead (ms) to schedule the round start_time. */
const LEAD_TIME_MS = 10_000; // 10 seconds

/** How many players can join each auto-created round. */
const DEFAULT_MAX_PLAYERS = 800;

/** How often to check for missing pending rounds (ms). */
const CHECK_INTERVAL_MS = 10_000; // 10 seconds

// ─── Scheduler ───────────────────────────────────────────────────────────────

export const RoundScheduler = {
  _timer: undefined as ReturnType<typeof setInterval> | undefined,

  /**
   * Start the scheduler.
   * Runs an immediate check then polls every CHECK_INTERVAL_MS.
   */
  start(): void {
    console.log('[Scheduler] Starting round scheduler');
    void RoundScheduler.ensureRoundsExist();
    RoundScheduler._timer = setInterval(() => {
      void RoundScheduler.ensureRoundsExist();
    }, CHECK_INTERVAL_MS);
  },

  stop(): void {
    if (RoundScheduler._timer !== undefined) {
      clearInterval(RoundScheduler._timer);
      RoundScheduler._timer = undefined;
    }
  },

  /**
   * For each stake level, create a pending round if none currently exists.
   */
  async ensureRoundsExist(): Promise<void> {
    try {
      // Fetch all pending rounds in one query
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
          if (pendingStakes.has(stake)) return; // already exists

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
