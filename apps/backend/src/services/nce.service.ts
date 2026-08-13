// Number Calling Engine (NCE)
// Requirements: 16.1, 16.2, 16.3, 16.4

import { GameStatus, TxType, WalletType } from '@fidel/shared';
import prisma from '../lib/prisma.js';
import { shuffle } from '../lib/shuffle.js';
import { WalletService } from './wallet.service.js';
import { ReferralService } from './referral.service.js';

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
  payload: { playerCount: number; derash: number },
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

  /** Rounds currently being stopped — prevents callNext re-entry during async stop */
  readonly stoppingRounds = new Set<string>();

  /** Rounds currently being started — synchronous guard against concurrent start() calls */
  readonly startingRounds = new Set<string>();

  /** Optional callbacks registered by the WebSocket layer */
  private onNumberCalled?: OnNumberCalled;
  private onRoundVoid?: OnRoundVoid;
  private onRoundStarted?: OnRoundStarted;

  setOnNumberCalled(cb: OnNumberCalled): void { this.onNumberCalled = cb; }
  setOnRoundVoid(cb: OnRoundVoid): void { this.onRoundVoid = cb; }
  setOnRoundStarted(cb: OnRoundStarted): void { this.onRoundStarted = cb; }

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
    // Reduce call interval for smoother game flow (3s instead of 4s)
    const callIntervalMs = await this.readCallInterval();

    // Load already-called numbers from DB (ordered by sequence_index)
    const existingCalled = await prisma.calledNumber.findMany({
      where: { round_id: roundId },
      orderBy: { sequence_index: 'asc' },
    });

    let sequence: number[];
    let sequenceIndex: number;

    if (existingCalled.length === 0) {
      // Fresh start — generate new shuffle
      sequence = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));
      sequenceIndex = 0;
    } else {
      // Resume — reconstruct sequence from what was already called,
      // then append a fresh shuffle of the remaining numbers
      const calledNums = existingCalled.map((c) => c.number);
      const calledSet = new Set(calledNums);
      const remaining = shuffle(
        Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !calledSet.has(n)),
      );
      sequence = [...calledNums, ...remaining];
      sequenceIndex = existingCalled.length; // resume from next uncalled slot
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
        });
      }
    }

    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    const callNext = async (): Promise<void> => {
      // Stop if the round was cancelled externally or is being stopped
      if (!this.activeTimers.has(roundId) || this.stoppingRounds.has(roundId)) return;

      try {
        const number = sequence[sequenceIndex];
        if (number === undefined) {
          console.log(`[NCE] Round ${roundId} exhausted all numbers at index ${sequenceIndex} — triggering void`);
          await this.triggerVoid(roundId);
          this.activeTimers.delete(roundId);
          return;
        }

        // Persist to DB — upsert is idempotent against duplicate (round_id, sequence_index)
        await prisma.calledNumber.upsert({
          where: { round_id_sequence_index: { round_id: roundId, sequence_index: sequenceIndex } },
          update: {},
          create: { round_id: roundId, number, sequence_index: sequenceIndex },
        });

        const payload: NumberCalledPayload = { number, sequenceIndex };

        // Fan-out to WebSocket layer
        if (this.onNumberCalled) {
          await this.onNumberCalled(roundId, payload);
        }

        consecutiveErrors = 0;
        sequenceIndex += 1;

        // ── Server-side win detection — inline, no claim window delay ─────
        const stopped = await this.detectAndHandleWin(roundId);
        if (stopped) {
          this.activeTimers.delete(roundId);
          return;
        }

        // Also stop if round status changed externally (admin cancel etc.)
        const currentRound = await prisma.gameRound.findUnique({
          where: { id: roundId },
          select: { status: true },
        });
        if (!currentRound || currentRound.status !== GameStatus.active) {
          this.activeTimers.delete(roundId);
          return;
        }

        if (sequenceIndex >= 75) {
          // Exhausted all numbers — check for winner one last time
          const finalRound = await prisma.gameRound.findUnique({ where: { id: roundId } });
          if (!finalRound || finalRound.status !== GameStatus.active) {
            // Winner was claimed during the last call
            this.activeTimers.delete(roundId);
            return;
          }
          // No winner — void flow
          await this.triggerVoid(roundId);
          this.activeTimers.delete(roundId);
          return;
        }

        // Schedule next call — re-read interval so live config changes take effect
        const nextInterval = await this.readCallInterval();
        const handle = setTimeout(() => {
          void callNext();
        }, nextInterval);
        this.activeTimers.set(roundId, handle);
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

        // Retry after a short back-off
        const retryDelay = Math.min(callIntervalMs * consecutiveErrors, 30_000);
        const handle = setTimeout(() => {
          void callNext();
        }, retryDelay);
        this.activeTimers.set(roundId, handle);
      }
    };

    // Call the first number immediately, then let callNext()
    // take over (it re-reads the configured interval for subsequent calls).
    const initialHandle = setTimeout(() => {
      void callNext();
    }, 0);
    this.activeTimers.set(roundId, initialHandle);
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
  }

  /**
   * Server-side win detection after each number.
   * Checks every active entry's cartela, distributes winnings directly if found.
   * Returns true if a winner was found (NCE should stop).
   */
  private async detectAndHandleWin(roundId: string): Promise<boolean> {
    try {
      const calledRows = await prisma.calledNumber.findMany({
        where: { round_id: roundId },
        select: { number: true },
      });
      const calledSet = new Set(calledRows.map((r) => r.number));

      const entries = await prisma.roundEntry.findMany({
        where: { round_id: roundId, is_watching: false },
        select: { player_id: true, cartela_number: true },
      });
      if (!entries.length) return false;

      const cartelaNumbers = [...new Set(entries.map((e) => e.cartela_number))];
      const cartelas = await prisma.cartelaDefinition.findMany({
        where: { cartela_number: { in: cartelaNumbers } },
        select: { cartela_number: true, grid: true },
      });
      const gridMap = new Map(cartelas.map((c) => [c.cartela_number, c.grid as number[]]));

      const winnerMap = new Map<string, { cartelaNumber: number }>();
      for (const entry of entries) {
        const grid = gridMap.get(entry.cartela_number);
        if (!grid) continue;
        if (this.gridHasWin(grid, calledSet)) {
          winnerMap.set(entry.player_id, { cartelaNumber: entry.cartela_number });
        }
      }

      if (winnerMap.size === 0) return false;

      console.log(`[NCE] Win detected round=${roundId} winners=${winnerMap.size} — distributing immediately`);

      // Mark as stopping FIRST — prevents any concurrent callNext from proceeding
      this.stoppingRounds.add(roundId);

      // Stop NCE timer
      this.stop(roundId);

      // Call distributeWinnings directly — bypass validateClaim/claim-window entirely
      const { distributeWinningsDirectly } = await import('./win-detection.service.js');
      await distributeWinningsDirectly(roundId, winnerMap);
      // Keep roundId in stoppingRounds until after distribution so recoverStaleActiveRounds
      // does not restart NCE for a round that is mid-distribution (still active in DB)
      this.stoppingRounds.delete(roundId);
      return true;
    } catch (err) {
      console.error(`[NCE] detectAndHandleWin error round=${roundId}:`, err);
      this.stoppingRounds.delete(roundId);
      return false;
    }
  }

  private gridHasWin(grid: number[], calledSet: Set<number>): boolean {
    const LINES = [
      // rows
      [0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24],
      // columns
      [0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24],
      // diagonals
      [0,6,12,18,24],[4,8,12,16,20],
      // 4 corners
      [0,4,20,24],
    ];
    for (const line of LINES) {
      if (line.every((i) => {
        if (i === 12) return true; // free space
        const v = grid[i] ?? 0;
        return v !== 0 && calledSet.has(v);
      })) {
        return true;
      }
    }
    return false;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Execute the void flow:
   * 1. Mark the round as void.
   * 2. Refund every RoundEntry's stake to the player's source wallet.
   * 3. Invoke the onRoundVoid callback for WebSocket broadcast.
   */
  private async triggerVoid(roundId: string): Promise<void> {
    await prisma.gameRound.update({
      where: { id: roundId },
      data: { status: GameStatus.void, ended_at: new Date() },
    });

    // Fetch all entries with stake
    const entries = await prisma.roundEntry.findMany({
      where: { round_id: roundId, is_watching: false },
    });

    const round = await prisma.gameRound.findUnique({ where: { id: roundId } });
    if (!round) return;

    const stake = Number(round.stake);

    // Refund each player and credit referral commissions
    await Promise.all(
      entries.map(async (entry) => {
        await WalletService.credit(
          entry.player_id,
          WalletType.main,
          stake,
          TxType.refund,
          roundId,
          'Round voided — no winner after all 75 numbers called',
        );
        // Credit referral commission for each paying entry
        await ReferralService.creditCommission(entry.player_id, roundId);
      }),
    );

    if (this.onRoundVoid) {
      await this.onRoundVoid(roundId);
    }

    // Immediately create the next pending round for this stake so clients
    // don't have to wait up to 15s for the scheduler tick
    import('./round-scheduler.service.js').then(({ RoundScheduler }) => {
      void RoundScheduler.ensureRoundsExist();
    }).catch(() => {});
  }

  /** Read call_interval_ms from Config, falling back to 1 000 ms. Enforces a 1 000 ms floor. */
  private async readCallInterval(): Promise<number> {
    const row = await prisma.config.findUnique({
      where: { key: 'call_interval_ms' },
    });
    const parsed = row ? parseInt(row.value, 10) : 1_000;
    const value = isNaN(parsed) ? 1_000 : parsed;
    return Math.max(value, 1_000); // never faster than 1 number/second
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/** Shared NCE instance — import this from GameRoundService and WebSocket layer. */
export const nce = new NumberCallingEngine();
