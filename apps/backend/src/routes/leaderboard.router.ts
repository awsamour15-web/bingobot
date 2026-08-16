// GET /api/leaderboard — top 15 winners by total wins and prize amount
// Public endpoint (requires JWT for player context to highlight current user)

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';

const router: RouterType = Router();

router.use(jwtAuthMiddleware);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const currentPlayerId = req.player?.playerId;

  // Aggregate wins and total prize per player from RoundWinner table
  const topWinners = await prisma.roundWinner.groupBy({
    by: ['player_id'],
    _count: { id: true },
    _sum: { split_amount: true },
    orderBy: [
      { _count: { id: 'desc' } },
      { _sum: { split_amount: 'desc' } },
    ],
    take: 15,
  });

  if (topWinners.length === 0) {
    res.json({ leaderboard: [], currentPlayerRank: null });
    return;
  }

  // Fetch player details for those IDs
  const playerIds = topWinners.map((w) => w.player_id);
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, username: true },
  });

  const playerMap = new Map(players.map((p) => [p.id, p]));

  const leaderboard = topWinners.map((w, idx) => ({
    rank: idx + 1,
    playerId: w.player_id,
    username: playerMap.get(w.player_id)?.username ?? 'Unknown',
    wins: w._count.id,
    totalPrize: Number(w._sum.split_amount ?? 0),
    isCurrentPlayer: w.player_id === currentPlayerId,
  }));

  // Find current player's rank if not in top 15
  let currentPlayerRank: { rank: number; wins: number; totalPrize: number } | null = null;
  if (currentPlayerId && !leaderboard.some((e) => e.isCurrentPlayer)) {
    const allWinners = await prisma.roundWinner.groupBy({
      by: ['player_id'],
      _count: { id: true },
      _sum: { split_amount: true },
      orderBy: [
        { _count: { id: 'desc' } },
        { _sum: { split_amount: 'desc' } },
      ],
    });
    const myIdx = allWinners.findIndex((w) => w.player_id === currentPlayerId);
    if (myIdx !== -1) {
      const me = allWinners[myIdx]!;
      currentPlayerRank = {
        rank: myIdx + 1,
        wins: me._count.id,
        totalPrize: Number(me._sum.split_amount ?? 0),
      };
    }
  }

  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.json({ leaderboard, currentPlayerRank });
});

export default router;
