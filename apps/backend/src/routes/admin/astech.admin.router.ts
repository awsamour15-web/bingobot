// AS Tech API — Admin routes
// GET /api/admin/astech/sessions      — all player sessions
// GET /api/admin/astech/transactions  — all transactions with filters
// GET /api/admin/astech/stats         — GGR summary

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

// ─── GET /api/admin/astech/sessions ──────────────────────────────────────────

router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
  const limit  = Math.min(100, parseInt(req.query['limit']  as string ?? '50', 10));
  const offset = Math.max(0,   parseInt(req.query['offset'] as string ?? '0',  10));
  const status = req.query['status'] as string | undefined;

  const sessions = await prisma.asTechSession.findMany({
    where:   status ? { status } : undefined,
    orderBy: { created_at: 'desc' },
    take:    limit,
    skip:    offset,
    include: {
      player: { select: { username: true } },
    },
  });

  res.json(sessions.map((s) => ({
    id:         s.id,
    playerId:   s.player_id,
    username:   s.player.username,
    sessionId:  s.session_id,
    gameId:     s.game_id,
    gameTitle:  s.game_title,
    currency:   s.currency,
    embeddable: s.embeddable,
    status:     s.status,
    createdAt:  s.created_at.toISOString(),
    closedAt:   s.closed_at?.toISOString() ?? null,
  })));
});

// ─── GET /api/admin/astech/transactions ──────────────────────────────────────

router.get('/transactions', async (req: Request, res: Response): Promise<void> => {
  const limit    = Math.min(100, parseInt(req.query['limit']    as string ?? '50',  10));
  const offset   = Math.max(0,   parseInt(req.query['offset']   as string ?? '0',   10));
  const playerId = req.query['playerId'] as string | undefined;
  const cmd      = req.query['cmd']      as string | undefined;

  const txs = await prisma.asTechTransaction.findMany({
    where: {
      ...(playerId ? { player_id: playerId } : {}),
      ...(cmd      ? { cmd }                 : {}),
    },
    orderBy: { created_at: 'desc' },
    take:    limit,
    skip:    offset,
    include: {
      player: { select: { username: true } },
    },
  });

  res.json(txs.map((t) => ({
    id:             t.id,
    transactionId:  t.transaction_id,
    playerId:       t.player_id,
    username:       t.player.username,
    cmd:            t.cmd,
    bet:            Number(t.bet),
    win:            Number(t.win),
    balanceBefore:  Number(t.balance_before),
    balanceAfter:   Number(t.balance_after),
    gameId:         t.game_id,
    roundId:        t.round_id,
    createdAt:      t.created_at.toISOString(),
  })));
});

// ─── GET /api/admin/astech/stats ─────────────────────────────────────────────

router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  const period = (req.query['period'] as string | undefined) ?? 'today';

  const now = new Date();
  let since: Date;

  switch (period) {
    case '1h':    since = new Date(now.getTime() - 60 * 60 * 1000);         break;
    case 'today': since = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case 'week':  since = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000); break;
    case 'month': since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    default:      since = new Date(0); break;
  }

  const [betAgg, winAgg, sessionCount, playerCount] = await Promise.all([
    prisma.asTechTransaction.aggregate({
      where:  { cmd: 'writeBet', created_at: { gte: since } },
      _sum:   { bet: true },
      _count: true,
    }),
    prisma.asTechTransaction.aggregate({
      where:  { cmd: 'writeBet', created_at: { gte: since } },
      _sum:   { win: true },
    }),
    prisma.asTechSession.count({ where: { created_at: { gte: since } } }),
    prisma.asTechTransaction.groupBy({
      by:     ['player_id'],
      where:  { created_at: { gte: since } },
    }),
  ]);

  const totalBet  = Number(betAgg._sum.bet ?? 0);
  const totalWin  = Number(winAgg._sum.win ?? 0);
  const ggr       = totalBet - totalWin;
  const roundsPlayed = betAgg._count;

  res.json({
    period,
    totalBet,
    totalWin,
    ggr,
    roundsPlayed,
    sessions:   sessionCount,
    players:    playerCount.length,
  });
});

export default router;
