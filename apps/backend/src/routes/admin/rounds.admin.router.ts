// Admin game management endpoints
// Requirements: 13.1, 13.2, 13.3, 13.4, 13.5

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';
import { GameRoundService } from '../../services/game-round.service.js';

const router: RouterType = Router();

// GET /api/admin/rounds — all rounds with status, player count, derash, called numbers count
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const rounds = await prisma.gameRound.findMany({
    orderBy: { start_time: 'desc' },
    include: {
      _count: { select: { round_entries: true, called_numbers: true } },
    },
  });
  res.json(rounds);
});

// POST /api/admin/rounds — create a new round
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { stake, startTime, maxPlayers } = req.body as {
    stake?: number;
    startTime?: string;
    maxPlayers?: number;
  };

  if (!stake || !startTime || !maxPlayers) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'stake, startTime, and maxPlayers are required' });
    return;
  }

  const roundId = await GameRoundService.create(
    Number(stake),
    new Date(startTime),
    Number(maxPlayers),
  );

  res.status(201).json({ roundId });
});

// POST /api/admin/rounds/:id/start — force-start a round
router.post('/:id/start', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  try {
    await GameRoundService.start(id);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to start round';
    res.status(422).json({ error: 'START_FAILED', message: msg });
  }
});

// DELETE /api/admin/rounds/:id — cancel a round
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  try {
    await GameRoundService.cancel(id);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to cancel round';
    res.status(422).json({ error: 'CANCEL_FAILED', message: msg });
  }
});

export default router;
