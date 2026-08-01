// Number Calling Engine (NCE)
// Requirements: 16.1, 16.2, 16.3, 16.4

import { GameStatus, TxType, WalletType } from '@beteseb/shared';
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
  private readonly activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    // Guard against double-start (e.g. concurrent resume calls on server restart)
    if (this.activeTimers.has(roundId)) {
      console.log(`[NCE] Round ${roundId} already running — skipping duplicate start`);
      return;
    }

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

    const callNext = async (): Promise<void> => {
      // Stop if the round was cancelled externally
      if (!this.activeTimers.has(roundId)) return;

      // Re-fetch round status to check for an already-confirmed winner
      const round = await prisma.gameRound.findUnique({ where: { id: roundId } });
      if (!round || round.status !== GameStatus.active) {
        this.activeTimers.delete(roundId);
        return;
      }

      const number = sequence[sequenceIndex];
      if (number === undefined) {
        // All 75 numbers called — should not happen given array length, but guard anyway
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

      sequenceIndex += 1;

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

      // Schedule next call
      const handle = setTimeout(() => {
        void callNext();
      }, callIntervalMs);

      this.activeTimers.set(roundId, handle);
    };

    // Call the first number immediately (0ms delay), then every callIntervalMs after
    const handle = setTimeout(() => {
      void callNext();
    }, 0);

    this.activeTimers.set(roundId, handle);
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

  /** Read call_interval_ms from Config, falling back to 5 000 ms. */
  private async readCallInterval(): Promise<number> {
    const row = await prisma.config.findUnique({
      where: { key: 'call_interval_ms' },
    });
    const parsed = row ? parseInt(row.value, 10) : NaN;
    return isNaN(parsed) ? 5_000 : parsed;
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/** Shared NCE instance — import this from GameRoundService and WebSocket layer. */
export const nce = new NumberCallingEngine();
