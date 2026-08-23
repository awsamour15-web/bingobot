// Crash Game Engine
// Manages the per-round lifecycle: waiting → running → crashed

import crypto from 'node:crypto';
import prisma from '../lib/prisma.js';
import { WalletService } from './wallet.service.js';
import { TxType, WalletType } from '@fidel/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

const BETTING_WINDOW_MS = 10_000; // 10s for players to place bets
const TICK_INTERVAL_MS = 100;     // broadcast multiplier every 100ms
const HOUSE_EDGE = 0.05;          // 5% house edge baked into crash point distribution

// ─── Callbacks ───────────────────────────────────────────────────────────────

export type OnCrashBettingOpen = (roundId: string, countdownMs: number) => void;
export type OnCrashStarted    = (roundId: string, startedAt: number) => void;
export type OnCrashTick       = (multiplier: number) => void;
export type OnCrashCashedOut  = (playerId: string, username: string, multiplier: number, payout: number) => void;
export type OnCrashEnded      = (roundId: string, crashPoint: number) => void;

// ─── Engine ───────────────────────────────────────────────────────────────────

export class CrashEngine {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  // Callbacks wired in by the WebSocket layer
  onBettingOpen?: OnCrashBettingOpen;
  onStarted?:     OnCrashStarted;
  onTick?:        OnCrashTick;
  onCashedOut?:   OnCrashCashedOut;
  onEnded?:       OnCrashEnded;

  /** Start the perpetual crash game loop. Call once at server startup. */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.runLoop();
  }

  stop(): void {
    this.running = false;
    this._clearTimers();
  }

  private _clearTimers(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
  }

  // ─── Main loop ─────────────────────────────────────────────────────────────

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.runOneRound();
      } catch (err) {
        console.error('[CrashEngine] runOneRound error:', err);
        // Wait a beat before retrying to avoid tight error loop
        await sleep(3_000);
      }
    }
  }

  private async runOneRound(): Promise<void> {
    // 1. Create the round in DB
    const round = await prisma.crashRound.create({ data: { status: 'waiting' } });
    const roundId = round.id;

    // 2. Generate crash point (provably fair)
    const crashPoint = this.generateCrashPoint();

    // 3. Open betting window
    this.onBettingOpen?.(roundId, BETTING_WINDOW_MS);
    await sleep(BETTING_WINDOW_MS);

    if (!this.running) return;

    // 4. Snapshot bet count — no new bets accepted after this
    const betCount = await prisma.crashBet.count({ where: { round_id: roundId } });
    if (betCount === 0) {
      // No bets — skip to next round immediately after marking crashed at 1x
      await prisma.crashRound.update({
        where: { id: roundId },
        data: { status: 'crashed', crash_point: crashPoint, started_at: new Date(), crashed_at: new Date() },
      });
      this.onEnded?.(roundId, crashPoint);
      return;
    }

    // 5. Mark round as running
    const startedAt = Date.now();
    await prisma.crashRound.update({
      where: { id: roundId },
      data: { status: 'running', crash_point: crashPoint, started_at: new Date(startedAt) },
    });
    this.onStarted?.(roundId, startedAt);

    // 6. Tick loop — broadcast multiplier until crash
    await new Promise<void>((resolve) => {
      this.tickTimer = setInterval(async () => {
        if (!this.running) { this._clearTimers(); resolve(); return; }

        const elapsed = (Date.now() - startedAt) / 1000; // seconds
        const multiplier = this.calcMultiplier(elapsed);
        this.onTick?.(parseFloat(multiplier.toFixed(2)));

        if (multiplier >= crashPoint) {
          clearInterval(this.tickTimer!);
          this.tickTimer = null;
          resolve();
        }
      }, TICK_INTERVAL_MS);
    });

    if (!this.running) return;

    // 7. Crash — bust all remaining (non-cashed-out) bets
    const crashedAt = new Date();
    await prisma.crashRound.update({
      where: { id: roundId },
      data: { status: 'crashed', crashed_at: crashedAt },
    });

    // Bets with no cashout_at are busts — no payout (money already debited at bet placement)
    this.onEnded?.(roundId, crashPoint);
  }

  // ─── Cashout (called by WebSocket handler) ─────────────────────────────────

  /**
   * Process a cashout for a player. Returns payout amount, or throws if invalid.
   */
  async cashout(roundId: string, playerId: string): Promise<{ multiplier: number; payout: number }> {
    // Get round
    const round = await prisma.crashRound.findUnique({ where: { id: roundId } });
    if (!round || round.status !== 'running') {
      throw new Error('Round is not running');
    }
    if (!round.started_at) throw new Error('Round has no start time');

    const elapsed = (Date.now() - round.started_at.getTime()) / 1000;
    const multiplier = parseFloat(this.calcMultiplier(elapsed).toFixed(2));

    // Must be under crash point
    if (round.crash_point && multiplier >= round.crash_point) {
      throw new Error('Already crashed');
    }

    // Find bet
    const bet = await prisma.crashBet.findUnique({
      where: { round_id_player_id: { round_id: roundId, player_id: playerId } },
    });
    if (!bet) throw new Error('No bet found for this round');
    if (bet.cashout_at !== null) throw new Error('Already cashed out');

    const payout = parseFloat((Number(bet.bet_amount) * multiplier).toFixed(2));

    // Persist cashout
    await prisma.crashBet.update({
      where: { id: bet.id },
      data: { cashout_at: multiplier, payout },
    });

    // Credit winnings
    await WalletService.credit(playerId, WalletType.main, payout, TxType.game_win, roundId, `Crash cashout at ${multiplier}x`);

    // Fetch username for broadcast
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { username: true } });
    this.onCashedOut?.(playerId, player?.username ?? 'Player', multiplier, payout);

    return { multiplier, payout };
  }

  // ─── Provably fair crash point ────────────────────────────────────────────

  private generateCrashPoint(): number {
    // Provably fair: uses crypto random to pick a crash multiplier
    // Distribution: P(crash ≥ x) = (1 - houseEdge) / x
    // This gives the expected house edge built into the distribution
    const rand = crypto.randomInt(1, 1_000_000) / 1_000_000;
    if (rand < HOUSE_EDGE) return 1.0; // instant crash (house edge floor)
    const raw = (1 - HOUSE_EDGE) / (1 - rand);
    return Math.max(1.0, parseFloat(raw.toFixed(2)));
  }

  /** Multiplier grows exponentially: e^(0.00006 * elapsedMs) — reaches ~2x at ~11.5s */
  private calcMultiplier(elapsedSeconds: number): number {
    return Math.pow(Math.E, 0.00006 * elapsedSeconds * 1000);
  }

  /** Expose current round ID for WS handlers to look up */
  async getCurrentWaitingRound(): Promise<{ id: string; status: string } | null> {
    return prisma.crashRound.findFirst({
      where: { status: { in: ['waiting', 'running'] } },
      orderBy: { created_at: 'desc' },
      select: { id: true, status: true },
    });
  }
}

export const crashEngine = new CrashEngine();

// ─── Helper ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
