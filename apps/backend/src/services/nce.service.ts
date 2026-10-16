// Number Calling Engine (NCE)
// Requirements: 16.1, 16.2, 16.3, 16.4

import { GameStatus, TxType, WalletType, WinPattern } from '@fidel/shared';
import prisma from '../lib/prisma.js';
import { getConfigInt } from '../lib/config-cache.js';
import { seededShuffle } from '../lib/shuffle.js';
import { WalletService } from './wallet.service.js';
import { checkWin, parseWinPatterns } from './win-detection.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NumberCalledPayload {
  number: number;
  sequenceIndex: number;
}

/**
 * Callback invoked after each number is called.
 * The WebSocket layer subscribes here to fan-out to connected clients.
 */
export type OnNumberCalled = (
  roundId: string,
  payload: NumberCalledPayload,
) => void | Promise<void>;

export type OnRoundVoid = (roundId: string) => void | Promise<void>;

export type OnRoundStarted = (
  roundId: string,
  payload: { playerCount: number; derash: number; winningPattern: WinPattern },
) => void | Promise<void>;

// ─── NCE ─────────────────────────────────────────────────────────────────────

/**
 * NumberCallingEngine manages the per-round timer loop that:
 *  1. Generates a shuffled 1–75 sequence at game start.
 *  2. Persists and broadcasts each number at the configured interval.
 *  3. Triggers the void refund flow when all 75 numbers are called with no winner.
 *
 * One instance is shared across all rounds; active timers are tracked by roundId.
 */
export class NumberCallingEngine {
  /** Map of roundId → active NodeJS timeout handle */
  readonly activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Per-round in-memory set of called numbers — avoids re-querying DB on every tick */
  readonly calledSets = new Map<string, Set<number>>();

  /** Per-round cached round entries — fetched once at start, cleared when round ends */
  private readonly entriesCache = new Map<string, Array<{ player_id: string; cartela_number: number }>>();

  /** Rounds known to be active — avoids a DB status check on every number call */
  private readonly activeRoundIds = new Set<string>();

  /** Rounds currently being stopped — prevents callNext re-entry during async stop */
  readonly stoppingRounds = new Set<string>();

  /** Rounds currently being started — synchronous guard against concurrent start() calls */
  readonly startingRounds = new Set<string>();

  /** Per-round cartela grid cache — populated once at game start, cleared when round ends */
  private readonly gridCache = new Map<string, Map<number, number[]>>();

  /** Cached call interval — refreshed every 10 s to pick up live config changes without a DB hit per number */
  private cachedCallInterval: number = 3_000;
  private callIntervalCachedAt: number = 0;
  private static readonly INTERVAL_CACHE_TTL_MS = 10_000;

  /** Optional callbacks registered by the WebSocket layer */
  private onNumberCalled?: OnNumberCalled;
  private onRoundVoid?: OnRoundVoid;
  private onRoundStarted?: OnRoundStarted;

  setOnNumberCalled(cb: OnNumberCalled): void { this.onNumberCalled = cb; }
  setOnRoundVoid(cb: OnRoundVoid): void { this.onRoundVoid = cb; }
  setOnRoundStarted(cb: OnRoundStarted): void { this.onRoundStarted = cb; }

  /** Invalidate the grid cache for a round so next win-check re-reads from DB */
  clearGridCache(roundId: string): void {
    this.gridCache.delete(roundId);
    this.calledSets.delete(roundId);
    this.entriesCache.delete(roundId);
    this.activeRoundIds.delete(roundId);
  }

  /**
   * Inject an override grid for a specific cartela within a round's cache.
   * Used by the mock bot to set a winning grid WITHOUT mutating the global
   * cartelaDefinition table (which would corrupt grids for real players).
   */
  setGridOverride(roundId: string, cartelaNumber: number, grid: number[]): void {
    let gridMap = this.gridCache.get(roundId);
    if (!gridMap) {
      gridMap = new Map();
      this.gridCache.set(roundId, gridMap);
    }
    gridMap.set(cartelaNumber, grid);
  }

  /** Per-round pre-generated number sequences set by the mock bot pre-simulation */
  private readonly preGeneratedSequences = new Map<string, number[]>();

  /** Per-round active sequence — stored on first start so concurrent/recovery starts use the same order */
  private readonly activeSequences = new Map<string, number[]>();

  /**
   * Store a pre-generated 1–75 sequence for a round.
   * When NCE starts this round it will use this sequence instead of generating a new one.
   */
  setPreGeneratedSequence(roundId: string, sequence: number[]): void {
    this.preGeneratedSequences.set(roundId, sequence);
    this.activeSequences.set(roundId, sequence);
  }

  /** Retrieve and consume the pre-generated sequence for a round (one-time use). */
  takePreGeneratedSequence(roundId: string): number[] | undefined {
    const seq = this.preGeneratedSequences.get(roundId);
    this.preGeneratedSequences.delete(roundId);
    return seq;
  }

  /**
   * Start (or resume) calling numbers for a round.
   *
   * - On fresh start: generates a shuffled 1–75 sequence from scratch.
   * - On resume (server restart recovery): loads the already-called sequence
   *   from DB and continues from the next uncalled index.
   * - Reads `call_interval_ms` from the Config table.
   * - Calls one number per interval, persisting to DB and invoking callbacks.
   * - After all 75 numbers, triggers the void flow if the round has no winner.
   */
  async start(roundId: string): Promise<void> {
    // Guard against double-start — checked synchronously before any await
    if (this.activeTimers.has(roundId) || this.startingRounds.has(roundId)) {
      console.log(`[NCE] Round ${roundId} already running/starting — skipping duplicate start`);
      return;
    }
    this.startingRounds.add(roundId);

    try {
      const callIntervalMs = await this.readCallInterval();

      // Load already-called numbers from DB (ordered by sequence_index)
      const existingCalled = await prisma.calledNumber.findMany({
        where: { round_id: roundId },
        orderBy: { sequence_index: 'asc' },
      });

      let sequence: number[];
      let sequenceIndex: number;

      if (existingCalled.length === 0) {
        const preGen = this.takePreGeneratedSequence(roundId);
        const existing = this.activeSequences.get(roundId);
        sequence = preGen ?? existing ?? seededShuffle(Array.from({ length: 75 }, (_, i) => i + 1), roundId);
        this.activeSequences.set(roundId, sequence);
        sequenceIndex = 0;
        this.calledSets.set(roundId, new Set<number>());
      } else {
        // Resume — reconstruct sequence from what was already called,
        // then append a deterministic seeded shuffle of the remaining numbers.
        const calledNums = existingCalled.map((c) => c.number);
        const calledSet = new Set(calledNums);
        const remaining = seededShuffle(
          Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !calledSet.has(n)),
          roundId,
        );
        sequence = [...calledNums, ...remaining];
        sequenceIndex = existingCalled.length;
        this.calledSets.set(roundId, calledSet);
        console.log(
          `[NCE] Resuming round ${roundId} from index ${sequenceIndex} (${75 - sequenceIndex} numbers remaining)`,
        );
      }

      // Broadcast ROUND_STARTED only on fresh start (not resume)
      if (sequenceIndex === 0 && this.onRoundStarted) {
        const round = await prisma.gameRound.findUnique({
          where: { id: roundId },
          include: { _count: { select: { round_entries: true } } },
        });
        if (round) {
          await this.onRoundStarted(roundId, {
            playerCount: round._count.round_entries,
            derash: Number(round.derash),
            winningPattern: (round.winning_pattern ?? 'any_line') as WinPattern,
          });
        }
      }

      // Pre-fetch winning pattern once — avoids a DB query per number
      const roundMeta = await prisma.gameRound.findUnique({
        where: { id: roundId },
        select: { winning_pattern: true },
      });
      const patterns = parseWinPatterns(roundMeta?.winning_pattern ?? 'any_line') as WinPattern[];

      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 5;

      const callNext = async (): Promise<void> => {
        if (!this.activeTimers.has(roundId) || this.stoppingRounds.has(roundId)) return;

        try {
          const number = sequence[sequenceIndex];
          if (number === undefined) {
            console.log(`[NCE] Round ${roundId} exhausted all numbers at index ${sequenceIndex} — triggering void`);
            await this.triggerVoid(roundId);
            this.activeTimers.delete(roundId);
            return;
          }

          // If this slot was already written (e.g. concurrent resume), skip broadcast but still check win
          const alreadyCalled = this.calledSets.get(roundId)?.has(number);
          if (alreadyCalled) {
            console.log(`[NCE] Slot index=${sequenceIndex} number=${number} already in calledSet for round=${roundId} — skipping broadcast, checking win`);
            sequenceIndex += 1;
            const stopped = await this.detectAndHandleWin(roundId, patterns);
            if (stopped) { this.activeTimers.delete(roundId); return; }
            const nextInterval = await this.readCallInterval();
            this.activeTimers.set(roundId, setTimeout(() => { void callNext(); }, nextInterval));
            return;
          }

          // Persist atomically; ON CONFLICT DO NOTHING handles duplicate inserts from concurrent instances
          let alreadyPersistedByConcurrentInstance = false;
          try {
            const result = await prisma.$executeRaw`
              INSERT INTO called_numbers (id, round_id, number, sequence_index, called_at)
              VALUES (gen_random_uuid(), ${roundId}, ${number}, ${sequenceIndex}, now())
              ON CONFLICT DO NOTHING
            `;
            if (result === 0) alreadyPersistedByConcurrentInstance = true;
          } catch (insertErr: any) {
            if (insertErr?.meta?.code === '23505' || insertErr?.code === 'P2002') {
              alreadyPersistedByConcurrentInstance = true;
            } else {
              throw insertErr;
            }
          }

          // Always update in-memory calledSet
          if (!this.calledSets.has(roundId)) this.calledSets.set(roundId, new Set<number>());
          this.calledSets.get(roundId)!.add(number);

          if (!alreadyPersistedByConcurrentInstance) {
            if (this.onNumberCalled) {
              await this.onNumberCalled(roundId, { number, sequenceIndex });
            }
            // Guard: stop may have been triggered while awaiting onNumberCalled
            if (!this.activeTimers.has(roundId) || this.stoppingRounds.has(roundId)) return;
          }

          consecutiveErrors = 0;
          sequenceIndex += 1;

          // Server-side win detection — uses in-memory calledSet (fast path)
          const stopped = await this.detectAndHandleWin(roundId, patterns);
          if (stopped) {
            this.activeTimers.delete(roundId);
            return;
          }

          if (sequenceIndex >= 75) {
            // All numbers called — final status check then void if still active
            const finalRound = await prisma.gameRound.findUnique({
              where: { id: roundId },
              select: { status: true },
            });
            if (!finalRound || finalRound.status !== GameStatus.active) {
              this.activeTimers.delete(roundId);
              return;
            }
            await this.triggerVoid(roundId);
            this.activeTimers.delete(roundId);
            return;
          }

          const nextInterval = await this.readCallInterval();
          this.activeTimers.set(roundId, setTimeout(() => { void callNext(); }, nextInterval));
        } catch (err) {
          consecutiveErrors += 1;
          console.error(`[NCE] Error calling number for round ${roundId} (attempt ${consecutiveErrors}):`, err);

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            console.error(`[NCE] Round ${roundId} exceeded ${MAX_CONSECUTIVE_ERRORS} consecutive errors — triggering void`);
            this.activeTimers.delete(roundId);
            try {
              await this.triggerVoid(roundId);
            } catch (voidErr) {
              console.error(`[NCE] Failed to void round ${roundId} after error threshold:`, voidErr);
            }
            return;
          }

          const retryDelay = Math.min(callIntervalMs * consecutiveErrors, 30_000);
          this.activeTimers.set(roundId, setTimeout(() => { void callNext(); }, retryDelay));
        }
      };

      // Start immediately
      this.activeTimers.set(roundId, setTimeout(() => { void callNext(); }, 0));
      this.activeRoundIds.add(roundId);
      this.startingRounds.delete(roundId);
    } catch (err) {
      this.startingRounds.delete(roundId);
      this.activeTimers.delete(roundId);
      throw err;
    }
  }

  /**
   * Stop the active timer for a round.
   * Called by admin cancel flow — no void/refund logic here; the caller handles that.
   */
  stop(roundId: string): void {
    const handle = this.activeTimers.get(roundId);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.activeTimers.delete(roundId);
    }
    this.activeRoundIds.delete(roundId);
    this.gridCache.delete(roundId);
    this.calledSets.delete(roundId);
    this.entriesCache.delete(roundId);
    this.preGeneratedSequences.delete(roundId);
    this.activeSequences.delete(roundId);
  }

  /**
   * Server-side win detection after each number.
   * Uses the in-memory calledSet (fast path) rather than querying DB on every tick.
   * Falls back to DB only when the in-memory set is empty (e.g. after recovery).
   * Returns true if a winner was found (NCE should stop).
   */
  private async detectAndHandleWin(roundId: string, patterns: WinPattern[]): Promise<boolean> {
    if (this.stoppingRounds.has(roundId)) return true;

    try {
      // Fast in-memory check — round is active if we started it (no DB query per number)
      if (!this.activeRoundIds.has(roundId)) {
        // Not in our active set — do a one-time DB check to confirm
        const roundStatus = await prisma.gameRound.findUnique({
          where: { id: roundId },
          select: { status: true },
        });
        if (!roundStatus || roundStatus.status !== GameStatus.active) return true;
        // It's active — add to set so future ticks skip the DB check
        this.activeRoundIds.add(roundId);
      }

      // Prefer in-memory calledSet for speed; fall back to DB only when empty
      let calledSet = this.calledSets.get(roundId);
      if (!calledSet || calledSet.size === 0) {
        const calledRows = await prisma.calledNumber.findMany({
          where: { round_id: roundId },
          select: { number: true },
        });
        calledSet = new Set(calledRows.map((r) => r.number));
        this.calledSets.set(roundId, calledSet);
      }

      // Always fetch fresh entries — players can join after the round starts
      const entries = await prisma.roundEntry.findMany({
        where: { round_id: roundId, is_watching: false },
        select: { player_id: true, cartela_number: true },
      });
      if (entries.length > 0) this.entriesCache.set(roundId, entries);
      if (entries.length === 0) return false;

      // Use cached grid map; fetch only missing cartelas from DB
      let gridMap = this.gridCache.get(roundId);
      if (!gridMap) {
        const cartelaNumbers = [...new Set(entries.map((e) => e.cartela_number))];
        const cartelas = await prisma.cartelaDefinition.findMany({
          where: { cartela_number: { in: cartelaNumbers } },
          select: { cartela_number: true, grid: true },
        });
        gridMap = new Map(cartelas.map((c) => [c.cartela_number, c.grid as number[]]));
        this.gridCache.set(roundId, gridMap);
      } else {
        const missingNums = [...new Set(entries.map((e) => e.cartela_number))].filter((n) => !gridMap!.has(n));
        if (missingNums.length > 0) {
          const cartelas = await prisma.cartelaDefinition.findMany({
            where: { cartela_number: { in: missingNums } },
            select: { cartela_number: true, grid: true },
          });
          for (const c of cartelas) gridMap.set(c.cartela_number, c.grid as number[]);
        }
      }

      const winnerMap = new Map<string, { cartelaNumber: number }>();
      for (const entry of entries) {
        const grid = gridMap.get(entry.cartela_number);
        if (!grid) continue;
        // One winning cartela per player (one share per player)
        if (!winnerMap.has(entry.player_id) && checkWin(grid, calledSet, patterns).won) {
          winnerMap.set(entry.player_id, { cartelaNumber: entry.cartela_number });
        }
      }

      if (winnerMap.size === 0) return false;

      console.log(`[NCE] Win detected round=${roundId} winners=${winnerMap.size} — distributing immediately`);

      // Double-check before locking — another tick may have raced here
      if (this.stoppingRounds.has(roundId)) return true;
      this.stoppingRounds.add(roundId);

      this.stop(roundId);

      try {
        const { distributeWinningsDirectly } = await import('./win-detection.service.js');
        await distributeWinningsDirectly(roundId, winnerMap);
      } catch (distErr) {
        console.error(`[NCE] distributeWinnings error round=${roundId}:`, distErr);
        // If distribution failed and round is still active, force-void to prevent it getting stuck
        try {
          const check = await prisma.gameRound.findUnique({
            where: { id: roundId },
            select: { status: true },
          });
          if (check?.status === GameStatus.active) {
            console.warn(`[NCE] Round ${roundId} still active after failed distribution — force-voiding`);
            await this.triggerVoid(roundId);
          }
        } catch (voidErr) {
          console.error(`[NCE] Failed to force-void round ${roundId} after distribution error:`, voidErr);
        }
      }

      this.stoppingRounds.delete(roundId);
      return true;
    } catch (err) {
      console.error(`[NCE] detectAndHandleWin error round=${roundId}:`, err);
      this.stoppingRounds.delete(roundId);
      return false;
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Execute the void flow:
   * 1. Mark the round as void.
   * 2. Refund every RoundEntry's stake to the player's source wallet.
   *    Processes sequentially to avoid partial failures from DB pool exhaustion.
   * 3. Invoke the onRoundVoid callback for WebSocket broadcast.
   */
  private async triggerVoid(roundId: string): Promise<void> {
    await prisma.gameRound.update({
      where: { id: roundId },
      data: { status: GameStatus.void, ended_at: new Date() },
    });

    // Clear all per-round caches
    this.gridCache.delete(roundId);
    this.calledSets.delete(roundId);
    this.entriesCache.delete(roundId);
    this.activeSequences.delete(roundId);
    this.activeRoundIds.delete(roundId);

    const entries = await prisma.roundEntry.findMany({
      where: { round_id: roundId, is_watching: false },
    });

    const round = await prisma.gameRound.findUnique({ where: { id: roundId } });
    if (!round) return;

    const stake = Number(round.stake);

    // Sequential refunds — safer than Promise.all under DB pool pressure
    for (const entry of entries) {
      try {
        await WalletService.credit(
          entry.player_id,
          WalletType.play,
          stake,
          TxType.refund,
          roundId,
          'Round voided — no winner after all 75 numbers called',
        );
      } catch (err) {
        console.error(`[NCE] Failed to refund player ${entry.player_id} for void round ${roundId}:`, err);
      }
    }

    if (this.onRoundVoid) {
      await this.onRoundVoid(roundId);
    }

    // Immediately create the next pending round for this stake
    import('./round-scheduler.service.js').then(({ RoundScheduler }) => {
      void RoundScheduler.ensureRoundsExist();
    }).catch(() => {});
  }

  /**
   * Read call_interval_ms from Config, falling back to 3 000 ms. Enforces a 1 000 ms floor.
   * Result is cached for 10 s so the DB is not queried on every number call.
   */
  private async readCallInterval(): Promise<number> {
    const now = Date.now();
    if (now - this.callIntervalCachedAt < NumberCallingEngine.INTERVAL_CACHE_TTL_MS) {
      return this.cachedCallInterval;
    }
    const value = await getConfigInt('call_interval_ms', 3_000);
    this.cachedCallInterval = Math.max(value, 1_000);
    this.callIntervalCachedAt = now;
    return this.cachedCallInterval;
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/** Shared NCE instance — import this from GameRoundService and WebSocket layer. */
export const nce = new NumberCallingEngine();
