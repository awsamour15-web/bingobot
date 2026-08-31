// Referral Service — commission attribution and crediting
// Requirements: 9.2, 9.3

import { TxType, WalletType } from '@fidel/shared';
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
   * Credit a 5 ETB invite bonus to the referrer's play wallet the first time
   * the invited player either makes a deposit OR places a game bet.
   *
   * Idempotent — safe to call multiple times; the bonus is only ever paid once
   * per invited player (guarded by checking for an existing referral_commission
   * transaction with reference_id = newPlayerId on the referrer's wallets).
   *
   * Requirements: 9.3
   */
  async maybeCreditInviteBonus(newPlayerId: string): Promise<void> {
    const player = await prisma.player.findUnique({
      where: { id: newPlayerId },
      select: { referrer_id: true },
    });

    if (!player?.referrer_id) return;

    // Check if bonus was already paid (idempotency guard)
    const referrerWallets = await prisma.wallet.findMany({
      where: { player_id: player.referrer_id },
      select: { id: true },
    });
    const walletIds = referrerWallets.map((w) => w.id);

    const existing = await prisma.transaction.findFirst({
      where: {
        wallet_id: { in: walletIds },
        type: 'referral_commission',
        reference_id: newPlayerId,
      },
      select: { id: true },
    });

    if (existing) return; // Already paid

    await WalletService.credit(
      player.referrer_id,
      WalletType.play,
      5,
      TxType.referral_commission,
      newPlayerId,
      `Invite bonus for referring player ${newPlayerId}`,
    );
  },

  /**
   * @deprecated Use maybeCreditInviteBonus instead.
   * Kept for backwards compatibility — now a no-op alias.
   */
  async creditInviteBonus(newPlayerId: string): Promise<void> {
    return ReferralService.maybeCreditInviteBonus(newPlayerId);
  },
};
