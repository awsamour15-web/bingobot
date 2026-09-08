// Gregmorn Hub — admin routes
// GET  /api/admin/gregmorn/games              — full game catalog
// GET  /api/admin/gregmorn/sessions           — all sessions (paginated)
// GET  /api/admin/gregmorn/transactions       — all transactions (paginated)
// GET  /api/admin/gregmorn/report             — daily GGR report
// POST /api/admin/gregmorn/launch-for-player  — admin opens a game for a player

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';
import {
  getGameCatalog,
  openGame,
  GREGMORN_CURRENCY,
  GREGMORN_USER_ID,
} from '../../services/gregmorn.service.js';

const router: RouterType = Router();

// ─── GET /api/admin/gregmorn/games ───────────────────────────────────────────

router.get('/games', async (req: Request, res: Response): Promise<void> => {
  const currency = (req.query['currency'] as string | undefined) ?? GREGMORN_CURRENCY;
  try {
    const games = await getGameCatalog(currency);
    res.json(games);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch games';
    res.status(502).json({ error: 'UPSTREAM_ERROR', message: msg });
  }
});

// ─── GET /api/admin/gregmorn/sessions ────────────────────────────────────────

router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10));
  const pageSize = Math.min(100, parseInt(String(req.query['pageSize'] ?? '20'), 10));
  const skip = (page - 1) * pageSize;
  const playerLogin = req.query['playerLogin'] as string | undefined;

  const where = playerLogin ? { player_login: playerLogin } : {};

  const [items, total] = await Promise.all([
    prisma.gregmornSession.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.gregmornSession.count({ where }),
  ]);

  res.json({
    items: items.map((s) => ({
      id: s.id,
      sessionId: s.session_id,
      playerLogin: s.player_login,
      gameId: s.game_id,
      gameTitle: s.game_title,
      currency: s.currency,
      status: s.status,
      createdAt: s.created_at.toISOString(),
      closedAt: s.closed_at?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  });
});

// ─── GET /api/admin/gregmorn/transactions ────────────────────────────────────

router.get('/transactions', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10));
  const pageSize = Math.min(100, parseInt(String(req.query['pageSize'] ?? '20'), 10));
  const skip = (page - 1) * pageSize;
  const playerLogin = req.query['playerLogin'] as string | undefined;

  const where = playerLogin ? { player_login: playerLogin } : {};

  const [items, total] = await Promise.all([
    prisma.gregmornTransaction.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.gregmornTransaction.count({ where }),
  ]);

  res.json({
    items: items.map((t) => ({
      id: t.id,
      transactionId: t.transaction_id,
      sessionId: t.session_id,
      playerLogin: t.player_login,
      cmd: t.cmd,
      bet: parseFloat(t.bet.toString()),
      win: parseFloat(t.win.toString()),
      balanceAfter: parseFloat(t.balance_after.toString()),
      gameId: t.game_id,
      roundId: t.round_id,
      createdAt: t.created_at.toISOString(),
    })),
    total,
    page,
    pageSize,
  });
});

// ─── GET /api/admin/gregmorn/report ──────────────────────────────────────────
// Local GGR summary from our own transaction log

router.get('/report', async (req: Request, res: Response): Promise<void> => {
  const dateStr = req.query['date'] as string | undefined;
  const date = dateStr ? new Date(dateStr) : new Date();
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(date);
  to.setHours(23, 59, 59, 999);

  const txs = await prisma.gregmornTransaction.findMany({
    where: {
      cmd: { in: ['writeBet', 'rollback'] },
      created_at: { gte: from, lte: to },
    },
    select: { cmd: true, bet: true, win: true },
  });

  let totalBet = 0;
  let totalWin = 0;
  let totalRollback = 0;

  for (const t of txs) {
    const bet = parseFloat(t.bet.toString());
    const win = parseFloat(t.win.toString());
    if (t.cmd === 'writeBet') {
      totalBet += bet;
      totalWin += win;
    } else {
      totalRollback += bet; // rollback refunds the bet
    }
  }

  const ggr = totalBet - totalRollback - totalWin;
  const commission = parseFloat((ggr * 0.08).toFixed(2));

  res.json({
    date: dateStr ?? date.toISOString().split('T')[0],
    totalBet: parseFloat(totalBet.toFixed(2)),
    totalWin: parseFloat(totalWin.toFixed(2)),
    totalRollback: parseFloat(totalRollback.toFixed(2)),
    ggr: parseFloat(ggr.toFixed(2)),
    commissionEst: commission, // 8% GGR estimate (Gregmorn deducts from prepaid balance)
  });
});

// ─── POST /api/admin/gregmorn/launch-for-player ───────────────────────────────

router.post('/launch-for-player', async (req: Request, res: Response): Promise<void> => {
  const { playerId, gameId, demo, language, currency } = req.body as {
    playerId?: string;
    gameId?: string;
    demo?: '0' | '1';
    language?: string;
    currency?: string;
  };

  if (!playerId || !gameId) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'playerId and gameId are required' });
    return;
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { username: true, is_suspended: true },
  });

  if (!player) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
    return;
  }

  const sessionCurrency = currency ?? GREGMORN_CURRENCY;

  try {
    const { gameUrl, sessionId } = await openGame({
      gameId,
      playerLogin: player.username,
      currency: sessionCurrency,
      language: language ?? 'en',
      demo: demo ?? '0',
    });

    await prisma.gregmornSession.create({
      data: {
        player_id: playerId,
        session_id: sessionId,
        game_id: gameId,
        game_title: gameId,
        currency: sessionCurrency,
        player_login: player.username,
        status: 'active',
      },
    });

    res.json({ gameUrl, sessionId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to launch game';
    res.status(502).json({ error: 'LAUNCH_FAILED', message: msg });
  }
});

export default router;
