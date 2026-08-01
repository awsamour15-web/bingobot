// Win Detection Service
// Requirements: 4.5, 5.1, 5.2, 5.3

import { GameStatus, TxType, WalletType } from '@beteseb/shared';
import prisma from '../lib/prisma.js';
import { WalletService } from './wallet.service.js';
import { ReferralService } from './referral.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CheckWinResult {
  won: boolean;
  winningLine?: number[];
}

// ─── Winning line indices (5×5 grid, row-major) ───────────────────────────────
//
// Grid layout (index):
//   0  1  2  3  4   ← row 0 (B column)
//   5  6  7  8  9   ← row 1 (I column)
//  10 11 12 13 14   ← row 2 (N column, index 12 = free space)
//  15 16 17 18 19   ← row 3 (G column)
//  20 21 22 23 24   ← row 4 (O column)

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
];

// ─── Pure win check ───────────────────────────────────────────────────────────

/**
 * Check whether a cartela has a winning bingo pattern.
 *
 * @param grid        25-element flat array (row-major). Index 12 = free space
 *                    (value 0), which is always treated as marked.
 * @param calledNums  Set of numbers called so far in the round.
 * @returns           `{ won: true, winningLine }` on first complete line found,
 *                    or `{ won: false }` when no line is complete.
 */
export function checkWin(
  grid: number[],
  calledNums: Set<number>,
): CheckWinResult {
  for (const lineIndices of WINNING_LINE_INDICES) {
    const lineValues = lineIndices.map((i) => grid[i] ?? 0);

    const isComplete = lineValues.every(
      (value) =>
        value === 0 || // free space (index 12) is always marked
        calledNums.has(value),
    );

    if (isComplete) {
      return { won: true, winningLine: lineValues };
    }
  }

  return { won: false };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const WinDetectionService = {
  /**
   * Validate a win claim for a given player in a round.
   *
   * 1. Fetches the RoundEntry — rejects if not found or is_watching=true.
   * 2. Fetches the CartelaDefinition for that entry.
   * 3. Fetches all CalledNumbers for the round ordered by sequence_index.
   * 4. Calls checkWin with the actual called numbers at claim time.
   * 5. On valid win: credits Derash to winner's main wallet, updates GameRound.
   *
   * Requirements: 5.1, 5.2, 5.3
   */
  async validateClaim(
    playerId: string,
    roundId: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    // 1. Fetch the round entry
    const entry = await prisma.roundEntry.findUnique({
      where: { round_id_player_id: { round_id: roundId, player_id: playerId } },
    });

    if (!entry) {
      return { valid: false, reason: 'ENTRY_NOT_FOUND' };
    }

    // Watching-only players cannot win (Requirement 4.7)
    if (entry.is_watching) {
      return { valid: false, reason: 'WATCHING_ONLY' };
    }

    // 2. Fetch the round (to get derash and check status)
    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
    });

    if (!round || round.status !== GameStatus.active) {
      return { valid: false, reason: 'ROUND_NOT_ACTIVE' };
    }

    // 3. Fetch the cartela definition
    const cartela = await prisma.cartelaDefinition.findUnique({
      where: { cartela_number: entry.cartela_number },
    });

    if (!cartela) {
      return { valid: false, reason: 'CARTELA_NOT_FOUND' };
    }

    // 4. Fetch all called numbers in order
    const calledNumberRows = await prisma.calledNumber.findMany({
      where: { round_id: roundId },
      orderBy: { sequence_index: 'asc' },
    });

    const calledSet = new Set(calledNumberRows.map((cn) => cn.number));

    // 5. Check win
    const result = checkWin(cartela.grid as number[], calledSet);

    if (!result.won) {
      return { valid: false, reason: 'NO_WINNING_LINE' };
    }

    // Valid win — credit Derash to winner's main wallet and close the round
    const derash = Number(round.derash);

    await WalletService.credit(
      playerId,
      WalletType.main,
      derash,
      TxType.game_win,
      roundId,
    );

    await prisma.gameRound.update({
      where: { id: roundId },
      data: {
        status: GameStatus.completed,
        winner_player_id: playerId,
        winner_cartela_number: entry.cartela_number,
        ended_at: new Date(),
      },
    });

    // Credit referral commission to the winner's referrer (paid entry only;
    // watching-only guard already applied above so entry.is_watching=false here)
    await ReferralService.creditCommission(playerId, roundId);

    // Notify the winner via Telegram bot (non-blocking, errors are swallowed inside)
    import('../bot/notifications.js').then(({ notifyWin }) => {
      void notifyWin(playerId, derash);
    }).catch(() => {});

    // Immediately create the next pending round for this stake so clients
    // don't have to wait up to 15s for the scheduler tick
    import('./round-scheduler.service.js').then(({ RoundScheduler }) => {
      void RoundScheduler.ensureRoundsExist();
    }).catch(() => {});

    return { valid: true };
  },
};
