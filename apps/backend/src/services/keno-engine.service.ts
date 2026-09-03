/**
 * Keno Engine Service
 *
 * Round lifecycle:
 *   betting (60s) → drawing (20 numbers revealed 1/s) → finished (5s pause) → next round
 *
 * Payout table (picks 1–10):
 *   matched / picked  → multiplier applied to bet
 */

import prisma from '../lib/prisma.js';
import { WalletService } from './wallet.service.js';
import { TxType, WalletType } from '@fidel/shared';

// ─── Payout table ─────────────────────────────────────────────────────────────
// PAYOUT_TABLE[picked][matched] = multiplier (0 = loss)
// Based on official keno rules table (columns = picked, rows = matched)
const PAYOUT_TABLE: Record<number, Record<number, number>> = {
  1:  { 0: 0, 1: 3.5 },
  2:  { 0: 0, 1: 1,   2: 10 },
  3:  { 0: 0, 1: 0,   2: 2,    3: 50 },
  4:  { 0: 0, 1: 0,   2: 1.5,  3: 10,   4: 80 },
  5:  { 0: 0, 1: 0,   2: 1,    3: 3,    4: 30,   5: 150 },
  6:  { 0: 0, 1: 0,   2: 0,    3: 2,    4: 15,   5: 60,   6: 500 },
  7:  { 0: 1, 1: 0,   2: 0,    3: 2,    4: 4,    5: 20,   6: 80,   7: 1000 },
  8:  { 0: 1, 1: 0,   2: 0,    3: 0,    4: 5,    5: 15,   6: 50,   7: 200,  8: 2000 },
  9:  { 0: 2, 1: 0,   2: 0,    3: 0,    4: 2,    5: 10,   6: 25,   7: 125,  8: 1000, 9: 5000 },
  10: { 0: 2, 1: 0,   2: 0,    3: 0,    4: 0,    5: 5,    6: 30,   7: 100,  8: 300,  9: 2000, 10: 10000 },
};

export function getKenoMultiplier(picked: number, matched: number): number {
  return PAYOUT_TABLE[picked]?.[matched] ?? 0;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export type KenoEngineCallbacks = {
  onBettingOpen: (roundId: string, endsAt: number) => void;
  onNumberDrawn: (roundId: string, number: number, drawnSoFar: number[], drawIndex: number) => void;
  onRoundFinished: (roundId: string, drawnNumbers: number[]) => void;
};

export class KenoEngine {
  onBettingOpen: KenoEngineCallbacks['onBettingOpen'] = () => {};
  onNumberDrawn: KenoEngineCallbacks['onNumberDrawn'] = () => {};
  onRoundFinished: KenoEngineCallbacks['onRoundFinished'] = () => {};

  private running = false;
  private currentRoundId: string | null = null;

  // Kick off the perpetual loop
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  getCurrentRoundId(): string | null {
    return this.currentRoundId;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.runRound();
      } catch (err) {
        console.error('[KenoEngine] Round error:', err);
        await sleep(3000);
      }
    }
  }

  private async runRound(): Promise<void> {
    const BETTING_MS = 60_000;
    const DRAW_INTERVAL_MS = 2_000; // one number every 2s → 20 numbers in 40s
    const TOTAL_DRAW = 20;
    const FINISH_PAUSE_MS = 2_000;

    // ── 1. Create a new round in "betting" state ──────────────────────────────
    const bettingEndsAt = new Date(Date.now() + BETTING_MS);
    const round = await prisma.kenoRound.create({
      data: { betting_ends_at: bettingEndsAt },
    });
    this.currentRoundId = round.id;
    this.onBettingOpen(round.id, bettingEndsAt.getTime());

    // ── 2. Wait for betting window ────────────────────────────────────────────
    const bettingRemaining = bettingEndsAt.getTime() - Date.now();
    if (bettingRemaining > 0) await sleep(bettingRemaining);

    // ── 3. Transition to "drawing" ────────────────────────────────────────────
    const drawnNumbers = drawKenoNumbers(TOTAL_DRAW);
    await prisma.kenoRound.update({
      where: { id: round.id },
      data: { status: 'drawing', started_at: new Date() },
    });

    // ── 4. Reveal numbers one by one ──────────────────────────────────────────
    const revealedSoFar: number[] = [];
    for (let i = 0; i < TOTAL_DRAW; i++) {
      await sleep(DRAW_INTERVAL_MS);
      revealedSoFar.push(drawnNumbers[i]!);
      this.onNumberDrawn(round.id, drawnNumbers[i]!, [...revealedSoFar], i);

      // Persist incrementally so late-joining clients can fetch state
      await prisma.kenoRound.update({
        where: { id: round.id },
        data: { drawn_numbers: revealedSoFar },
      });
    }

    // ── 5. Settle all bets ────────────────────────────────────────────────────
    await this.settleBets(round.id, drawnNumbers);

    // ── 6. Mark finished ─────────────────────────────────────────────────────
    await prisma.kenoRound.update({
      where: { id: round.id },
      data: { status: 'finished', finished_at: new Date(), drawn_numbers: drawnNumbers },
    });
    this.currentRoundId = null;
    this.onRoundFinished(round.id, drawnNumbers);

    await sleep(FINISH_PAUSE_MS);
  }

  private async settleBets(roundId: string, drawnNumbers: number[]): Promise<void> {
    const drawnSet = new Set(drawnNumbers);
    const bets = await prisma.kenoBet.findMany({ where: { round_id: roundId } });

    // Read house edge from config (default 15%)
    const edgeCfg = await prisma.config.findUnique({ where: { key: 'house_edge_keno' } });
    const houseEdgePct = Math.min(50, Math.max(5, parseInt(edgeCfg?.value ?? '15', 10)));
    const rtpFactor = 1 - houseEdgePct / 100;

    for (const bet of bets) {
      const matched = bet.picked_numbers.filter((n) => drawnSet.has(n)).length;
      const picked = bet.picked_numbers.length;
      const baseMultiplier = getKenoMultiplier(picked, matched);
      // Apply house edge: scale non-zero payouts by RTP factor
      const multiplier = baseMultiplier > 0 ? baseMultiplier * rtpFactor : 0;
      const payout = multiplier > 0 ? Math.round(Number(bet.bet_amount) * multiplier * 100) / 100 : 0;

      await prisma.kenoBet.update({
        where: { id: bet.id },
        data: { matched, payout },
      });

      if (payout > 0) {
        await WalletService.credit(
          bet.player_id,
          WalletType.main,
          payout,
          TxType.game_win,
          roundId,
          `Keno win: ${matched}/${picked} match x${baseMultiplier}`,
        );
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Draw `count` unique random numbers from 1–80 */
function drawKenoNumbers(count: number): number[] {
  const pool = Array.from({ length: 80 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

export const kenoEngine = new KenoEngine();
