// GET /api/players/me         — player profile + wallet balances + streak + stats
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
      _count: {
        select: {
          round_entries: true,
          round_wins: true,
        },
      },
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

  // ── Daily streak logic (UTC+3 / Addis Ababa time) ────────────────────────
  const nowUtc = new Date();
  // UTC+3 offset in ms
  const ADDIS_OFFSET_MS = 3 * 60 * 60 * 1000;
  const nowAddis = new Date(nowUtc.getTime() + ADDIS_OFFSET_MS);
  // Today's date string in Addis time "YYYY-MM-DD"
  const todayStr = nowAddis.toISOString().slice(0, 10);

  let loginStreak = player.login_streak ?? 1;
  let longestStreak = player.longest_streak ?? 1;

  const lastLoginDate = player.last_login_date;
  const lastStr = lastLoginDate
    ? new Date(lastLoginDate.getTime() + ADDIS_OFFSET_MS).toISOString().slice(0, 10)
    : null;

  if (lastStr !== todayStr) {
    if (lastStr) {
      // Check if yesterday
      const yesterday = new Date(nowAddis);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      if (lastStr === yesterdayStr) {
        loginStreak += 1;
      } else {
        loginStreak = 1;
      }
    } else {
      loginStreak = 1;
    }

    longestStreak = Math.max(longestStreak, loginStreak);

    // Update streak in background (non-blocking)
    void prisma.player.update({
      where: { id: playerId },
      data: {
        login_streak: loginStreak,
        longest_streak: longestStreak,
        last_login_date: new Date(todayStr + 'T00:00:00.000Z'),
      },
    }).catch(() => { /* ignore streak update errors */ });
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
    loginStreak,
    longestStreak,
    totalGamesPlayed: player._count.round_entries,
    totalWins: player._count.round_wins,
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

  // Validate Ethiopian phone format (09xxxxxxxx or 07xxxxxxxx)
  if (!/^(09|07)\d{8}$/.test(phone)) {
    res.status(400).json({
      error: 'INVALID_PHONE',
      message: 'Phone must be a valid Ethiopian number (09xxxxxxxx or 07xxxxxxxx)',
    });
    return;
  }

  await prisma.player.update({
    where: { id: playerId },
    data: { phone, phone_verified: true },
  });

  res.status(200).json({ phone, phone_verified: true });
});

export default router;
