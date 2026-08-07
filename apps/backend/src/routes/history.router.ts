// GET /api/history          — paginated player game history
// GET /api/history/:roundId — history detail (called numbers + cartela grid)
// Requirements: 8.1, 8.2, 8.3

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import type { HistoryEntry, HistoryDetail, PaginatedResponse } from '@fidel/shared';

const router: RouterType = Router();

router.use(jwtAuthMiddleware);

// Helper: map round status + winner to result string
function toResult(
  status: string,
  playerId: string,
  winnerPlayerId: string | null,
): HistoryEntry['result'] {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'void') return 'void';
  if (winnerPlayerId === playerId) return 'win';
  return 'loss';
}

// ─── GET /api/history ────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;
  const query = req.query as Record<string, string | undefined>;

  const page = Math.max(1, parseInt(query['page'] ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query['pageSize'] ?? '20', 10) || 20));
  const skip = (page - 1) * pageSize;

  const [entries, total] = await Promise.all([
    prisma.roundEntry.findMany({
      where: { player_id: playerId },
      include: {
        round: true,
      },
      orderBy: { round: { ended_at: 'desc' } },
      skip,
      take: pageSize,
    }),
    prisma.roundEntry.count({ where: { player_id: playerId } }),
  ]);

  const items: HistoryEntry[] = entries.map((entry) => {
    const round = entry.round;
    const result = toResult(round.status, playerId, round.winner_player_id);
    const prize =
      result === 'win' ? Number(round.derash) : 0;

    return {
      roundId: round.id,
      gameId: round.id, // game ID is the round ID in this system
      date: round.ended_at?.toISOString() ?? round.start_time.toISOString(),
      stake: Number(round.stake),
      result,
      prize,
      cartelaNumber: entry.cartela_number,
    };
  });

  const response: PaginatedResponse<HistoryEntry> = {
    items,
    total,
    page,
    pageSize,
  };

  res.status(200).json(response);
});

// ─── GET /api/history/:roundId ───────────────────────────────────────────────

router.get('/:roundId', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;
  const { roundId } = req.params as { roundId: string };

  // Get ALL entries for this player in this round (they may have 2 cartelas)
  const entries = await prisma.roundEntry.findMany({
    where: { round_id: roundId, player_id: playerId, is_watching: false },
    include: {
      round: {
        include: {
          called_numbers: {
            orderBy: { sequence_index: 'asc' },
          },
        },
      },
    },
  });

  if (!entries.length) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'History entry not found' });
    return;
  }

  const entry = entries[0]!;
  const round = entry.round;
  const result = toResult(round.status, playerId, round.winner_player_id);
  const prize = result === 'win' ? Number(round.derash) : 0;

  // Fetch cartela grids for all cartelas the player has in this round
  const cartelaNumbers = entries.map((e) => e.cartela_number);
  const cartelaDefs = await prisma.cartelaDefinition.findMany({
    where: { cartela_number: { in: cartelaNumbers } },
  });
  const gridMap = new Map(cartelaDefs.map((d) => [d.cartela_number, d.grid]));

  const detail: HistoryDetail = {
    roundId: round.id,
    gameId: round.id,
    date: round.ended_at?.toISOString() ?? round.start_time.toISOString(),
    stake: Number(round.stake),
    result,
    prize,
    cartelaNumber: entry.cartela_number,
    calledNumbers: round.called_numbers.map((cn: { number: number; sequence_index: number }) => ({
      number: cn.number,
      sequence_index: cn.sequence_index,
    })),
    cartelaGrid: gridMap.get(entry.cartela_number) ?? [],
    // Extra: all cartelas for multi-cartela support in live game
    allCartelas: cartelaNumbers.map((num) => ({
      cartelaNumber: num,
      cartelaGrid: gridMap.get(num) ?? [],
    })),
  };

  res.status(200).json(detail);
});

export default router;
