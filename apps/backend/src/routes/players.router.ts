// GET /api/players/me         — player profile + wallet balances
// POST /api/players/verify-phone — phone verification
// Requirements: 1.5, 7.1, 9.4

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import type { PlayerProfile } from '@fidel/shared';

const router: RouterType = Router();

// All player routes require a valid JWT
router.use(jwtAuthMiddleware);

// ─── GET /api/players/me ─────────────────────────────────────────────────────

router.get('/me', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: {
      wallets: true,
    },
  });

  if (!player) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
    return;
  }

  const mainWallet = player.wallets.find((w) => w.type === 'main');
  const playWallet = player.wallets.find((w) => w.type === 'play');

  if (!mainWallet || !playWallet) {
    res.status(500).json({ error: 'WALLET_MISSING', message: 'Player wallets not found' });
    return;
  }

  const profile: PlayerProfile = {
    id: player.id,
    username: player.username,
    phone: player.phone ?? undefined,
    phone_verified: player.phone_verified,
    is_suspended: player.is_suspended,
    created_at: player.created_at.toISOString(),
    mainWallet: {
      id: mainWallet.id,
      type: mainWallet.type,
      balance: Number(mainWallet.balance),
    },
    playWallet: {
      id: playWallet.id,
      type: playWallet.type,
      balance: Number(playWallet.balance),
    },
  };

  res.status(200).json(profile);
});

// ─── POST /api/players/verify-phone ──────────────────────────────────────────

router.post('/verify-phone', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;
  const body = req.body as { phone?: string };

  if (!body?.phone || typeof body.phone !== 'string' || body.phone.trim() === '') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'phone is required' });
    return;
  }

  const phone = body.phone.trim();

  await prisma.player.update({
    where: { id: playerId },
    data: { phone, phone_verified: true },
  });

  res.status(200).json({ phone, phone_verified: true });
});

export default router;
