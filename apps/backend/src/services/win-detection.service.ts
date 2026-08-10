// Win Detection Service — multi-winner claim-window support
// Requirements: 1.1–1.5, 2.1–2.4, 3.1–3.5, 4.1–4.4, 5.1–5.3, 9.1–9.4

import { GameStatus, TxType, WalletType } from '@fidel/shared';
import prisma from '../lib/prisma.js';
import { WalletService } from './wallet.service.js';
import { ReferralService } from './referral.service.js';
import { nce } from './nce.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CheckWinResult {
  won: boolean;
  winningLine?: number[];
}

// ─── ClaimWindowState (in-memory, one entry per active claim window) ─────────

interface ClaimWindowState {
  timer: ReturnType<typeof setTimeout>;
  winners: Map<string, { cartelaNumber: number }>; // playerId → winning cartela
  closing: boolean; // true once distribution transaction has started
}

const claimWindows = new Map<string, ClaimWindowState>();

// ─── Callback registered by WebSocket layer ───────────────────────────────────

type OnRoundWonCb = (
  roundId: string,
  payload: {
    winners: Array<{ playerId: string; username: string; cartelaNumber: number; amount: number }>;
    totalDerash: number;
    winnerCount: number;
    calledNumbers?: number[];
  },
) => void | Promise<void>;

let onRoundWonCb: OnRoundWonCb | undefined;

// ─── Winning patterns (5×5 grid, row-major) ──────────────────────────────────
// Valid wins: any single row, any single column, either diagonal, or 4 corners.

const WINNING_LINE_INDICES: number[][] = [
  // 5 rows
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  // 5 columns
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  // 2 diagonals
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
  // 4 corners
  [0, 4, 20, 24],
];

// ─── Pure win check ───────────────────────────────────────────────────────────

export function checkWin(grid: number[], calledNums: Set<number>): CheckWinResult {
  for (const lineIndices of WINNING_LINE_INDICES) {
    const lineValues = lineIndices.map((i) => grid[i] ?? 0);
    // Index 12 is the free space (stored as 0 in DB) — always counts as called.
    // Only index 12 is treated as a free space; other 0-values are NOT free.
    const isComplete = lineValues.every((v, pos) => {
      const idx = lineIndices[pos]!;
      if (idx === 12) return true; // free space — always marked
      return v !== 0 && calledNums.has(v); // non-free cell: must have a valid number that was called
    });
    if (isComplete) return { won: true, winningLine: lineValues };
  }
  return { won: false };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getClaimWindowMs(): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key: 'claim_window_ms' } });
  if (!row) return 5000;
  const parsed = parseInt(row.value, 10);
  return isNaN(parsed) || parsed <= 0 ? 5000 : parsed;
}

// ─── distributeWinnings ───────────────────────────────────────────────────────

async function distributeWinnings(
  roundId: string,
  winners: Map<string, { cartelaNumber: number }>,
): Promise<void> {
  // Mark closing early so any concurrent calls bail out
  const state = claimWindows.get(roundId);
  if (state) state.closing = true;

  try {
    // All credits + round update inside a single transaction
    await prisma.$transaction(async (tx) => {
      // 1. Lock the round row
      const rounds = await tx.$queryRaw<Array<{ id: string; status: string; derash: string }>>`
        SELECT id, status, derash FROM game_rounds WHERE id = ${roundId} FOR UPDATE
      `;
      const round = rounds[0];
      if (!round || round.status !== GameStatus.active) return; // already completed/cancelled

      const derash = Math.round(parseFloat(round.derash)); // work in integer birr units
      const winnerCount = winners.size;
      const splitAmount = Math.floor(derash / winnerCount);
      const remainder = derash - splitAmount * winnerCount;

      // Lexicographically smallest player ID receives the remainder
      const sortedIds = [...winners.keys()].sort();
      const smallestId = sortedIds[0]!;

      // 2. Insert RoundWinner rows
      const winnerRows = [...winners.entries()].map(([playerId, { cartelaNumber }]) => ({
        round_id: roundId,
        player_id: playerId,
        cartela_number: cartelaNumber,
        split_amount: playerId === smallestId ? splitAmount + remainder : splitAmount,
      }));

      await tx.roundWinner.createMany({ data: winnerRows });

      // 3. Credit each winner's main wallet (using tx-aware raw updates to stay in transaction)
      for (const [playerId, { cartelaNumber: _c }] of winners.entries()) {
        const amount = playerId === smallestId ? splitAmount + remainder : splitAmount;
        if (amount <= 0) continue;

        // Find main wallet
        const wallets = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM wallets WHERE player_id = ${playerId} AND type = 'main' LIMIT 1
        `;
        const walletId = wallets[0]?.id;
        if (!walletId) continue;

        await tx.wallet.update({
          where: { id: walletId },
          data: { balance: { increment: amount } },
        });
        await tx.transaction.create({
          data: { wallet_id: walletId, type: TxType.game_win, amount, reference_id: roundId },
        });
      }

      // 4. Update GameRound
      const smallestWinner = winners.get(smallestId)!;
      await tx.gameRound.update({
        where: { id: roundId },
        data: {
          status: GameStatus.completed,
          winner_player_id: smallestId,
          winner_cartela_number: smallestWinner.cartelaNumber,
          ended_at: new Date(),
        },
      });
    });

    // ── After commit: stop number calling, emit ROUND_WON, notify, schedule next round ──

    // Stop the NCE FIRST — synchronously — so no more numbers are called after the win
    nce.stop(roundId);

    // Build payload — need usernames
    const playerIds = [...winners.keys()];
    const players = await prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, username: true },
    });
    const usernameMap = new Map(players.map((p) => [p.id, p.username]));

    const round = await prisma.gameRound.findUnique({ where: { id: roundId } });
    const totalDerash = round ? Number(round.derash) : 0;
    const winnerCount = winners.size;

    const sortedIds = [...winners.keys()].sort();
    const smallestId = sortedIds[0]!;
    const splitAmount = Math.floor(totalDerash / winnerCount);
    const remainder = totalDerash - splitAmount * winnerCount;

    const winnersPayload = [...winners.entries()].map(([playerId, { cartelaNumber }]) => ({
      playerId,
      username: usernameMap.get(playerId) ?? 'Unknown',
      cartelaNumber,
      amount: playerId === smallestId ? splitAmount + remainder : splitAmount,
    }));

    if (onRoundWonCb) {
      await onRoundWonCb(roundId, { winners: winnersPayload, totalDerash, winnerCount });
    }

    // Telegram notifications (non-blocking)
    import('../bot/notifications.js').then(({ notifyWin }) => {
      for (const w of winnersPayload) {
        void notifyWin(w.playerId, w.amount, winnerCount);
      }
    }).catch(() => {});

    // Credit referral commissions (non-blocking)
    for (const playerId of playerIds) {
      void ReferralService.creditCommission(playerId, roundId);
    }

    // Replenish pending rounds — wait 5s so clients can see the winner screen first
    setTimeout(() => {
      import('./round-scheduler.service.js').then(({ RoundScheduler }) => {
        void RoundScheduler.ensureRoundsExist();
      }).catch(() => {});
    }, 5_000);

  } catch (err) {
    console.error('[WinDetectionService] distribution error:', err);
  } finally {
    claimWindows.delete(roundId);
  }
}

// ─── Direct export for NCE server-side win detection ─────────────────────────
// Bypasses the claim window — used when NCE detects a winner authoritatively.
export { distributeWinnings as distributeWinningsDirectly };

// ─── Service ─────────────────────────────────────────────────────────────────

export const WinDetectionService = {
  setOnRoundWon(cb: OnRoundWonCb): void {
    onRoundWonCb = cb;
  },

  async validateClaim(
    playerId: string,
    roundId: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    // ── Check existing claim window ──────────────────────────────────────────
    const existing = claimWindows.get(roundId);

    if (existing) {
      if (existing.closing) return { valid: false, reason: 'CLAIM_WINDOW_CLOSED' };
      if (existing.winners.has(playerId)) return { valid: false, reason: 'DUPLICATE_CLAIM' };
    }

    // ── Validate the claim ───────────────────────────────────────────────────

    // 1. Fetch all non-watching entries for this player
    const entries = await prisma.roundEntry.findMany({
      where: { round_id: roundId, player_id: playerId, is_watching: false },
    });
    if (!entries.length) {
      console.log(`[WinDetection] ENTRY_NOT_FOUND player=${playerId} round=${roundId}`);
      return { valid: false, reason: 'ENTRY_NOT_FOUND' };
    }

    // 2. Round must be active
    const round = await prisma.gameRound.findUnique({ where: { id: roundId } });
    if (!round || round.status !== GameStatus.active) {
      console.log(`[WinDetection] ROUND_NOT_ACTIVE player=${playerId} round=${roundId} status=${round?.status}`);
      return { valid: false, reason: 'ROUND_NOT_ACTIVE' };
    }

    // 3. Fetch cartela definitions
    const cartelaNumbers = entries.map((e) => e.cartela_number);
    const cartelas = await prisma.cartelaDefinition.findMany({
      where: { cartela_number: { in: cartelaNumbers } },
    });
    if (!cartelas.length) {
      console.log(`[WinDetection] CARTELA_NOT_FOUND player=${playerId} cartelaNumbers=${cartelaNumbers}`);
      return { valid: false, reason: 'CARTELA_NOT_FOUND' };
    }

    // 4. Fetch called numbers
    const calledRows = await prisma.calledNumber.findMany({
      where: { round_id: roundId },
      orderBy: { sequence_index: 'asc' },
    });
    const calledSet = new Set(calledRows.map((c) => c.number));
    console.log(`[WinDetection] Checking player=${playerId} round=${roundId} cartelas=${cartelaNumbers} calledCount=${calledSet.size}`);

    // 5. Check win on any cartela
    // Grid may contain "FREE"/"Free" string at index 12 — cast safely
    let winningCartelaNumber: number | null = null;
    for (const cartela of cartelas) {
      const grid = (cartela.grid as unknown[]).map((v, i) =>
        i === 12 ? 0 : typeof v === 'number' ? v : 0,
      );
      const result = checkWin(grid, calledSet);
      console.log(`[WinDetection] cartela=${cartela.cartela_number} won=${result.won} winLine=${JSON.stringify(result.winningLine)}`);
      if (result.won) {
        winningCartelaNumber = cartela.cartela_number;
        break;
      }
    }
    if (!winningCartelaNumber) {
      return { valid: false, reason: 'NO_WINNING_LINE' };
    }

    // ── Accept the claim ─────────────────────────────────────────────────────

    if (existing) {
      // Window already open — add to winners set
      existing.winners.set(playerId, { cartelaNumber: winningCartelaNumber });
    } else {
      // Stop NCE immediately on first valid claim — no more numbers after a winner is found
      nce.stop(roundId);

      // Open a new claim window
      const windowMs = await getClaimWindowMs();
      const newState: ClaimWindowState = {
        winners: new Map([[playerId, { cartelaNumber: winningCartelaNumber }]]),
        closing: false,
        timer: setTimeout(() => {
          void distributeWinnings(roundId, claimWindows.get(roundId)?.winners ?? new Map([[playerId, { cartelaNumber: winningCartelaNumber! }]]));
        }, windowMs),
      };
      claimWindows.set(roundId, newState);
    }

    return { valid: true };
  },
};
