/**
 * CashbackService
 *
 * Reads per-game cashback config from the DB and credits a percentage
 * of the bet amount back to the player's play wallet on a net loss.
 *
 * Config keys (stored in the `config` table):
 *   cashback_<game>_enabled  — "true" | "false"
 *   cashback_<game>_pct      — "0"–"50" (percentage of bet returned)
 *
 * Supported game keys: bingo | crash | slots | keno | plinko | royal_drop
 *
 * Cashback is credited to the play wallet so it cannot be withdrawn directly.
 * The transaction type is TxType.cashback for easy reporting.
 */

import prisma from '../lib/prisma.js';
import { WalletService } from './wallet.service.js';
import { TxType, WalletType } from '@fidel/shared';

export type CashbackGame = 'bingo' | 'crash' | 'slots' | 'keno' | 'plinko' | 'royal_drop';

export const CashbackService = {
  /**
   * Maybe credit cashback for a loss.
   * @param playerId  - The player who lost
   * @param game      - Which game they played
   * @param betAmount - The amount they bet (gross, before any win)
   * @param netLoss   - How much they actually lost (bet - payout). Pass betAmount if total bust.
   * @param referenceId - Optional round/bet ID for the transaction note
   */
  async maybeCreditCashback(
    playerId: string,
    game: CashbackGame,
    betAmount: number,
    netLoss: number,
    referenceId?: string,
  ): Promise<void> {
    if (netLoss <= 0) return; // no loss, no cashback

    const [enabledCfg, pctCfg] = await Promise.all([
      prisma.config.findUnique({ where: { key: `cashback_${game}_enabled` } }),
      prisma.config.findUnique({ where: { key: `cashback_${game}_pct` } }),
    ]);

    const enabled = enabledCfg?.value === 'true';
    if (!enabled) return;

    const pct = Math.min(50, Math.max(0, parseFloat(pctCfg?.value ?? '0')));
    if (pct <= 0) return;

    const cashback = parseFloat(((netLoss * pct) / 100).toFixed(2));
    if (cashback <= 0) return;

    await WalletService.credit(
      playerId,
      WalletType.play,
      cashback,
      TxType.cashback,
      referenceId,
      `${game} cashback ${pct}% of ${netLoss.toFixed(2)} loss`,
    );
  },
};
