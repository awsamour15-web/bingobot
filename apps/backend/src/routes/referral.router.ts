// GET /api/referral/link — referral URL and stats
// Requirements: 9.1, 9.4

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import type { ReferralStats } from '@fidel/shared';

const router: RouterType = Router();

router.use(jwtAuthMiddleware);

// ─── GET /api/referral/link ──────────────────────────────────────────────────

router.get('/link', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { telegram_id: true },
  });

  if (!player) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
    return;
  }

  const botUsername = process.env['BOT_USERNAME'] ?? 'FidelBingoBot';
  const referralLink = `https://t.me/${botUsername}?start=ref_${player.telegram_id}`;

  // Count active referrals — only players who have deposited or played (bonus was paid)
  const wallets = await prisma.wallet.findMany({
    where: { player_id: playerId },
    select: { id: true },
  });
  const walletIds = wallets.map((w) => w.id);

  const paidBonusTxs = await prisma.transaction.findMany({
    where: {
      wallet_id: { in: walletIds },
      type: 'referral_commission',
    },
    select: { reference_id: true },
    distinct: ['reference_id'],
  });

  const totalReferrals = paidBonusTxs.length;

  // Sum all referral_commission transactions credited to this player's wallets
  const earningsResult = await prisma.transaction.aggregate({
    where: {
      wallet_id: { in: walletIds },
      type: 'referral_commission',
    },
    _sum: { amount: true },
  });

  const totalEarnings = Number(earningsResult._sum.amount ?? 0);

  const stats: ReferralStats = {
    referralLink,
    totalReferrals,
    totalEarnings,
  };

  res.status(200).json(stats);
});

export default router;
