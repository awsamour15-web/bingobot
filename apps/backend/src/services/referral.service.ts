// Referral Service — commission attribution and crediting
// Requirements: 9.2, 9.3

import { TxType, WalletType } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { WalletService } from './wallet.service.js';

export const ReferralService = {
  /**
   * Attribute a referral by setting Player.referrer_id on creation.
   *
   * NOTE: In practice, referrer_id is already set in the login upsert
   * (task 3.4). This method is provided as a documented entry point and
   * for use in non-upsert creation flows.
   *
   * Requirements: 9.2
   */
  async attributeReferral(newPlayerId: string, referrerId: string): Promise<void> {
    await prisma.player.update({
      where: { id: newPlayerId },
      data: { referrer_id: referrerId },
    });
  },

  /**
   * Credit a referral commission to the referrer's main wallet after a paid
   * round completes (win, cancel, or void) for `playerId`.
   *
   * Steps:
   *  1. Look up the player's referrer_id. If none, return immediately.
   *  2. Fetch the round stake amount.
   *  3. Read `referral_commission_pct` from Config (default 2).
   *  4. Call WalletService.credit on the referrer's main wallet with
   *     type = referral_commission.
   *
   * Requirements: 9.3
   */
  async creditCommission(playerId: string, roundId: string): Promise<void> {
    // 1. Fetch the player and their referrer_id
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { referrer_id: true },
    });

    if (!player?.referrer_id) {
      // No referrer — nothing to credit
      return;
    }

    const referrerId = player.referrer_id;

    // 2. Fetch the round stake
    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
      select: { stake: true },
    });

    if (!round) {
      return;
    }

    const stake = Number(round.stake);

    // 3. Read referral commission rate from Config
    const configRow = await prisma.config.findUnique({
      where: { key: 'referral_commission_pct' },
    });
    const commissionPct = configRow ? parseFloat(configRow.value) : 2;

    const commissionAmount = stake * (commissionPct / 100);

    if (commissionAmount <= 0) {
      return;
    }

    // 4. Credit the referrer's main wallet
    await WalletService.credit(
      referrerId,
      WalletType.main,
      commissionAmount,
      TxType.referral_commission,
      roundId,
      `Referral commission for player ${playerId} round ${roundId}`,
    );
  },
};
