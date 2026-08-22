// Admin game management endpoints
// Requirements: 13.1, 13.2, 13.3, 13.4, 13.5

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';
import { GameRoundService } from '../../services/game-round.service.js';

const router: RouterType = Router();

// GET /api/admin/rounds — all rounds with status, player count, derash, called numbers count
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  // Fetch active/pending rounds (no limit) + last 100 completed/cancelled/void rounds
  // to avoid fetching the entire table which causes timeouts as data grows
  const [activeRounds, doneRounds] = await Promise.all([
    prisma.gameRound.findMany({
      where: { status: { in: ['pending', 'active'] } },
      orderBy: { start_time: 'desc' },
      include: {
        _count: { select: { round_entries: true, called_numbers: true } },
        round_winners: { include: { player: { select: { username: true } } } },
      },
    }),
    prisma.gameRound.findMany({
      where: { status: { in: ['completed', 'cancelled', 'void'] } },
      orderBy: { start_time: 'desc' },
      take: 100,
      include: {
        _count: { select: { round_entries: true, called_numbers: true } },
        round_winners: { include: { player: { select: { username: true } } } },
      },
    }),
  ]);
  const rounds = [...activeRounds, ...doneRounds];

  const items = rounds.map((r) => ({
    id: r.id,
    stake: Number(r.stake),
    status: r.status,
    player_count: r._count.round_entries,
    max_players: r.max_players,
    derash: Number(r.derash),
    called_numbers_count: r._count.called_numbers,
    start_time: r.start_time.toISOString(),
    ended_at: r.ended_at?.toISOString() ?? undefined,
    winner_player_id: r.winner_player_id ?? undefined,
    winner_cartela_number: r.winner_cartela_number ?? undefined,
    commission_pct: r.commission_pct,
    winners: r.round_winners.map((w) => ({
      playerId: w.player_id,
      username: w.player.username,
      cartelaNumber: w.cartela_number,
      splitAmount: Number(w.split_amount),
    })),
  }));

  res.json({ items, total: items.length, page: 1, pageSize: items.length });
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

  const round = await prisma.gameRound.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      _count: { select: { round_entries: true, called_numbers: true } },
      round_winners: { include: { player: { select: { username: true } } } },
    },
  });

  res.status(201).json({
    id: round.id,
    stake: Number(round.stake),
    status: round.status,
    player_count: round._count.round_entries,
    max_players: round.max_players,
    derash: Number(round.derash),
    called_numbers_count: round._count.called_numbers,
    start_time: round.start_time.toISOString(),
    ended_at: round.ended_at?.toISOString() ?? undefined,
    winner_player_id: round.winner_player_id ?? undefined,
    winner_cartela_number: round.winner_cartela_number ?? undefined,
    commission_pct: round.commission_pct,
    winners: round.round_winners.map((w) => ({
      playerId: w.player_id,
      username: w.player.username,
      cartelaNumber: w.cartela_number,
      splitAmount: Number(w.split_amount),
    })),
  });
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
