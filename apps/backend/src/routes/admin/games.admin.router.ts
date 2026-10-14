// Admin games stats endpoint
// GET /api/admin/games/stats -- bingo transaction totals, profit/loss

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

// GET /api/admin/games/stats
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  const [bingoStats, recentBingo] = await Promise.all([
    // Bingo
    prisma.gameRound.aggregate({
      where: { status: 'completed' },
      _sum: { derash: true },
      _count: { id: true },
    }),
    // Recent bingo rounds (last 50)
    prisma.gameRound.findMany({
      where: { status: { in: ['completed', 'cancelled', 'void'] } },
      orderBy: { ended_at: 'desc' },
      take: 50,
      select: {
        id: true,
        stake: true,
        derash: true,
        status: true,
        ended_at: true,
        start_time: true,
        _count: { select: { round_entries: true } },
      },
    }),
  ]);

  // Bingo totals
  const bingoTotalIn = await prisma.gameRound.findMany({
    where: { status: 'completed' },
    select: { stake: true, _count: { select: { round_entries: true } } },
  });
  let bingoTotalBets = 0;
  for (const r of bingoTotalIn) {
    bingoTotalBets += Number(r.stake) * r._count.round_entries;
  }
  const bingoPrizesPaid = Number(bingoStats._sum.derash ?? 0);

  res.json({
    games: [
      {
        key: 'bingo', name: 'Bingo', icon: '🎯',
        totalRounds: bingoStats._count.id,
        totalBets: bingoTotalBets, totalPaid: bingoPrizesPaid,
        profit: bingoTotalBets - bingoPrizesPaid,
      },
    ],
    transactions: {
      bingo: recentBingo.map((r) => ({
        id: r.id,
        type: r.status,
        totalBet: Number(r.stake) * r._count.round_entries,
        paid: Number(r.derash),
        profit: Number(r.stake) * r._count.round_entries - Number(r.derash),
        players: r._count.round_entries,
        date: (r.ended_at ?? r.start_time).toISOString(),
      })),
    },
  });
});

export default router;
