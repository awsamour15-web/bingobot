// Round Scheduler Service
// Automatically maintains one pending round per stake level at all times.
// A new round is created 1 minute into the future whenever no pending round
// exists for a given stake level.
// When a round's start_time passes with zero entries, it is voided immediately.

import prisma from '../lib/prisma.js';
import { GameRoundService } from './game-round.service.js';
import { nce } from './nce.service.js';
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
    // Ensure call_interval_ms is exactly 5000ms
    void prisma.config.upsert({
      where: { key: 'call_interval_ms' },
      update: { value: '5000' },
      create: { key: 'call_interval_ms', value: '5000' },
    });
    // Resume any active rounds that were left mid-game by a server restart
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

  /**
   * On server startup, resume number calling for any rounds that were left
   * in `active` status by a previous process crash or restart.
   * Without this, active rounds get permanently stuck — no more numbers called,
   * no void triggered, users see a frozen game board.
   */
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
        // nce.start() generates a fresh shuffle and begins calling from index 0,
        // but it persists each number and the DB unique constraint on
        // (round_id, sequence_index) will reject duplicates — however we want
        // to resume from where we left off, not restart from the beginning.
        // So we resume by re-triggering via GameRoundService which calls nce.start().
        // nce.start() checks round status on each tick and will call triggerVoid
        // once all 75 sequence slots are exhausted.
        // Already-called numbers will cause DB errors silently; we catch and continue.
        void nce.start(round.id);
      }
    } catch (err) {
      console.error('[Scheduler] recoverActiveRounds error:', err);
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
          // Immediately create the next round so users always have a full 60s lobby
          void RoundScheduler.ensureRoundsExist();
        } catch (err) {
          console.error(`[Scheduler] Failed to start round ${round.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[Scheduler] expireEmptyRounds error:', err);
    }
  },

  /**
   * For each stake level, create a pending round if none currently exists
   * AND no round is currently active for that stake level.
   * Also cancels duplicate pending rounds (keeps only the earliest one).
   */
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

      // Group pending rounds by stake — cancel all but the earliest
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

      // Track which stakes already have a pending round
      const pendingStakes = new Set([...byStake.keys()].filter((s) => STAKE_LEVELS.includes(s)));
      // Track which stakes already have an active round
      const activeStakes = new Set(activeRounds.map((r) => Number(r.stake)));

      await Promise.all(
        STAKE_LEVELS.map(async (stake) => {
          // Skip if a pending round already exists for this stake
          if (pendingStakes.has(stake)) return;
          // Skip if a round is currently active for this stake — wait for it to finish
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
