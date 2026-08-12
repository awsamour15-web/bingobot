// GET /api/system/state — returns the current "global" game state so clients
// can sync to the correct screen on open.
// The system operates one shared game at a time:
//   • If there's an active round → all users must watch it
//   • If there's a pending round → all users must be on cartela selection
//   • Otherwise → no active game

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import { GameStatus } from '@fidel/shared';

const router: RouterType = Router();

export interface SystemState {
  phase: 'cartela' | 'live' | 'idle';
  roundId: string | null;
  stake: number | null;
}

// GET /api/system/stats — total players registered and total completed games
// Public endpoint - no auth required
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  const [totalPlayers, totalGames] = await Promise.all([
    prisma.player.count({ where: { phone_verified: true } }),
    prisma.gameRound.count({ where: { status: 'completed' } }),
  ]);

  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  res.json({ totalPlayers, totalGames });
});

// All routes below require authentication
router.use(jwtAuthMiddleware);

// Priority: active > pending (earliest start_time)
router.get('/state', async (_req: Request, res: Response): Promise<void> => {
  const [activeRound, pendingRound] = await Promise.all([
    prisma.gameRound.findFirst({
      where: { status: GameStatus.active },
      orderBy: { start_time: 'asc' },
      select: { id: true, stake: true },
    }),
    prisma.gameRound.findFirst({
      where: { status: GameStatus.pending },
      orderBy: { start_time: 'asc' },
      select: { id: true, stake: true },
    }),
  ]);

  if (activeRound) {
    const state: SystemState = { phase: 'live', roundId: activeRound.id, stake: Number(activeRound.stake) };
    res.json(state);
    return;
  }

  if (pendingRound) {
    const state: SystemState = { phase: 'cartela', roundId: pendingRound.id, stake: Number(pendingRound.stake) };
    res.json(state);
    return;
  }

  const state: SystemState = { phase: 'idle', roundId: null, stake: null };
  res.json(state);
});

export default router;
