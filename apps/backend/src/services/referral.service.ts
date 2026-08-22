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
   * Credit a 5 ETB invite bonus to the referrer's main wallet when a new
   * player they invited completes registration.
   *
   * Requirements: 9.3
   */
  async creditInviteBonus(newPlayerId: string): Promise<void> {
    const player = await prisma.player.findUnique({
      where: { id: newPlayerId },
      select: { referrer_id: true },
    });

    if (!player?.referrer_id) return;

    await WalletService.credit(
      player.referrer_id,
      WalletType.play,
      5,
      TxType.referral_commission,
      newPlayerId,
      `Invite bonus for referring player ${newPlayerId}`,
    );
  },
};
