// Round Scheduler Service
// Automatically maintains one pending round per stake level at all times.

import prisma from '../lib/prisma.js';
import { GameRoundService } from './game-round.service.js';
import { nce } from './nce.service.js';
import { GameStatus, WinPattern } from '@fidel/shared';
import { MockPlayerBotService } from './mock-player-bot.service.js';
import { getConfigInt, getConfigFloat, setConfig } from '../lib/config-cache.js';

const STAKE_LEVELS = [10, 20, 50];
const LEAD_TIME_MS = 40_000;
const DEFAULT_MAX_PLAYERS = 800;
const CHECK_INTERVAL_MS = 5_000;

// Prevents concurrent ensureRoundsExist calls from racing to create duplicate rounds
let ensureLock = false;

// Tracks rounds currently being started — prevents re-entry across ticks
const startingRounds = new Set<string>();

// Tracks how many consecutive ticks a round has been timer-less (stuck)
const stuckRoundTicks = new Map<string, number>();
const STUCK_TICK_THRESHOLD = 2; // force-void after 2 ticks (~20s) with no timer

// Purge stuckRoundTicks entries for rounds that are no longer active (runs every 10 min)
setInterval(async () => {
  if (stuckRoundTicks.size === 0) return;
  try {
    const activeIds = new Set(
      (await prisma.gameRound.findMany({ where: { status: GameStatus.active }, select: { id: true } })).map(r => r.id)
    );
    for (const id of stuckRoundTicks.keys()) {
      if (!activeIds.has(id)) stuckRoundTicks.delete(id);
    }
  } catch { /* ignore */ }
}, 10 * 60_000).unref();

export const RoundScheduler = {
  _timer: undefined as ReturnType<typeof setInterval> | undefined,
  _tickRunning: false,
  _tickCount: 0,

  /** Optional callback invoked after ensureRoundsExist creates new pending rounds */
  _onRoundsReplenished: undefined as (() => void) | undefined,

  setOnRoundsReplenished(cb: () => void): void {
    RoundScheduler._onRoundsReplenished = cb;
  },

  start(): void {
    console.log('[Scheduler] Starting round scheduler');
    void setConfig('call_interval_ms', '3000');
    // Run first tick immediately; start recovery after it completes so any rounds
    // it starts aren't double-started by recoverActiveRounds.
    void RoundScheduler.tick().then(() => {
      void RoundScheduler.recoverActiveRounds();
    });
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
        if (nce.activeTimers.has(round.id) || nce.startingRounds.has(round.id) || nce.stoppingRounds.has(round.id)) {
          console.log(`[Scheduler] Skipping recovery of round ${round.id} — NCE already active/starting`);
          continue;
        }
        console.log(`[Scheduler] Resuming NCE for round ${round.id} (stake=${round.stake})`);
        await nce.start(round.id);
      }
    } catch (err) {
      console.error('[Scheduler] recoverActiveRounds error:', err);
    }
  },

  async tick(): Promise<void> {
    if (RoundScheduler._tickRunning) return;
    RoundScheduler._tickRunning = true;
    try {
      RoundScheduler._tickCount++;
      await RoundScheduler.expireEmptyRounds();
      // Run heavy recovery checks every 6 ticks (~30s) to reduce DB pressure
      if (RoundScheduler._tickCount % 6 === 0) {
        await RoundScheduler.recoverStaleActiveRounds();
      }
      await RoundScheduler.ensureRoundsExist();
    } finally {
      RoundScheduler._tickRunning = false;
    }
  },

  async recoverStaleActiveRounds(): Promise<void> {
    try {
      const callIntervalMs = await getConfigInt('call_interval_ms', 4_000);
      const staleThreshold = new Date(Date.now() - (75 * callIntervalMs + 5 * 60_000));

      const activeRounds = await prisma.gameRound.findMany({
        where: { status: GameStatus.active },
        select: { id: true, stake: true, start_time: true },
      });

      for (const round of activeRounds) {
        if (nce.activeTimers.has(round.id)) {
          stuckRoundTicks.delete(round.id);
          continue;
        }
        if (nce.stoppingRounds.has(round.id) || nce.startingRounds.has(round.id)) continue;

        const isStale = round.start_time <= staleThreshold;

        if (isStale) {
          try {
            await nce.start(round.id);
            if (nce.activeTimers.has(round.id) || nce.startingRounds.has(round.id)) {
              stuckRoundTicks.delete(round.id);
              continue;
            }
          } catch {
            // fall through to stuck-tick counting
          }
        }

        const ticks = (stuckRoundTicks.get(round.id) ?? 0) + 1;
        stuckRoundTicks.set(round.id, ticks);
        console.log(`[Scheduler] Timer-less active round ${round.id} (stake=${round.stake}, stale=${isStale}, stuck_ticks=${ticks})`);

        if (ticks >= STUCK_TICK_THRESHOLD) {
          console.warn(`[Scheduler] Round ${round.id} stuck for ${ticks} ticks — force-voiding`);
          stuckRoundTicks.delete(round.id);
          try {
            await prisma.gameRound.update({
              where: { id: round.id },
              data: { status: GameStatus.void, ended_at: new Date() },
            });
            console.log(`[Scheduler] Force-voided stuck round ${round.id}`);
            try {
              const { GameRoundService } = await import('./game-round.service.js');
              if (GameRoundService._onRoundVoidEmpty) {
                await GameRoundService._onRoundVoidEmpty(round.id);
              }
            } catch (notifyErr) {
              console.error(`[Scheduler] Failed to notify clients of force-void for round ${round.id}:`, notifyErr);
            }
          } catch (voidErr) {
            console.error(`[Scheduler] Failed to force-void stuck round ${round.id}:`, voidErr);
          }
        }
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
        orderBy: { start_time: 'asc' },
      });

      // Track which stakes we've already started this tick — prevent double-start
      const startedStakes = new Set<number>();
      // Track whether any round was voided — only call ensureRoundsExist once at the end
      let needsReplenish = false;

      for (const round of overdue) {
        const stake = Number(round.stake);

        if (round._count.round_entries === 0) {
          try {
            await prisma.gameRound.update({
              where: { id: round.id },
              data: { status: GameStatus.void, ended_at: new Date() },
            });
            console.log(`[Scheduler] Voided empty round ${round.id} (0 players)`);
            needsReplenish = true;
          } catch (err) {
            console.error(`[Scheduler] Failed to void empty round ${round.id}:`, err);
          }
        } else if (!startedStakes.has(stake)) {
          // Check for an existing active round for this stake before starting
          const existingActive = await prisma.gameRound.findFirst({
            where: { status: GameStatus.active, stake },
          });
          if (existingActive) {
            console.log(`[Scheduler] Skipping start of ${round.id} — active round ${existingActive.id} already exists for stake=${stake}`);
            await prisma.gameRound.update({
              where: { id: round.id },
              data: { status: GameStatus.void, ended_at: new Date() },
            }).catch(() => {});
            continue;
          }

          if (startingRounds.has(round.id)) {
            console.log(`[Scheduler] Skipping start of ${round.id} — already being started`);
            startedStakes.add(stake);
            continue;
          }

          try {
            startingRounds.add(round.id);
            await GameRoundService.start(round.id);
            startedStakes.add(stake);
            console.log(`[Scheduler] Round ${round.id} auto-started (${round._count.round_entries} players)`);
          } catch (err) {
            console.error(`[Scheduler] Failed to start round ${round.id}:`, err);
          } finally {
            startingRounds.delete(round.id);
          }
        } else {
          // Already started one for this stake this tick — void the duplicate
          try {
            await prisma.gameRound.update({
              where: { id: round.id },
              data: { status: GameStatus.void, ended_at: new Date() },
            });
            console.log(`[Scheduler] Voided duplicate overdue round ${round.id} for stake=${stake}`);
          } catch (err) {
            console.error(`[Scheduler] Failed to void duplicate round ${round.id}:`, err);
          }
        }
      }

      // Trigger a single replenish after processing all voided empty rounds
      if (needsReplenish) {
        void RoundScheduler.ensureRoundsExist();
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

      // Void duplicate pending rounds per stake, keeping the earliest
      for (const [, rounds] of byStake) {
        for (let i = 1; i < rounds.length; i++) {
          await prisma.gameRound.update({
            where: { id: rounds[i]!.id },
            data: { status: GameStatus.void, ended_at: new Date() },
          });
          console.log(`[Scheduler] Voided duplicate pending round ${rounds[i]!.id}`);
        }
      }

      // Read config values once per ensureRoundsExist call
      const [maxPlayers, commissionPct] = await Promise.all([
        getConfigInt('auto_round_max_players', DEFAULT_MAX_PLAYERS),
        getConfigFloat('platform_commission_pct', 20),
      ]);

      const pendingStakes = new Set<number>([...byStake.keys()]);
      // Only treat a stake as blocked when a live NCE timer is active for an active round.
      const activeStakes = new Set<number>(
        activeRounds
          .filter((r) => nce.activeTimers.has(r.id) || nce.startingRounds.has(r.id))
          .map((r) => Number(r.stake)),
      );

      const winning_pattern = JSON.stringify([WinPattern.any_line, WinPattern.corners]);

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
              winning_pattern,
            },
          });
          console.log(`[Scheduler] Created round ${round.id} | stake=${stake} Birr | starts=${startTime.toISOString()}`);
          if (RoundScheduler._onRoundsReplenished) RoundScheduler._onRoundsReplenished();
          void MockPlayerBotService.onRoundPending(round.id);
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
