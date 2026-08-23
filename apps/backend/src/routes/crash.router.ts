// Crash game REST routes
// POST /api/crash/bet   — place a bet on the current waiting round
// GET  /api/crash/state — current round state + player's bet

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import { WalletService, InsufficientFundsError } from '../services/wallet.service.js';
import { TxType, WalletType } from '@fidel/shared';
import { crashEngine } from '../services/crash-engine.service.js';

const router: RouterType = Router();
router.use(jwtAuthMiddleware);

// ─── GET /api/crash/state ─────────────────────────────────────────────────────

router.get('/state', async (req: Request, res: Response): Promise<void> => {
  const playerId = (req as Request & { playerId: string }).playerId;

  const round = await prisma.crashRound.findFirst({
    where: { status: { in: ['waiting', 'running'] } },
    orderBy: { created_at: 'desc' },
    include: {
      bets: {
        select: {
          player_id: true,
          bet_amount: true,
          cashout_at: true,
          payout: true,
          player: { select: { username: true } },
        },
      },
    },
  });

  if (!round) {
    res.json({ phase: 'idle', round: null, myBet: null });
    return;
  }

  const myBet = round.bets.find((b) => b.player_id === playerId) ?? null;

  res.json({
    phase: round.status,
    round: {
      id: round.id,
      status: round.status,
      startedAt: round.started_at,
      crashPoint: round.status === 'crashed' ? round.crash_point : null,
    },
    myBet: myBet
      ? {
          betAmount: Number(myBet.bet_amount),
          cashoutAt: myBet.cashout_at,
          payout: myBet.payout ? Number(myBet.payout) : null,
        }
      : null,
    bets: round.bets.map((b) => ({
      username: b.player.username,
      betAmount: Number(b.bet_amount),
      cashoutAt: b.cashout_at,
      payout: b.payout ? Number(b.payout) : null,
    })),
  });
});

// ─── POST /api/crash/bet ──────────────────────────────────────────────────────

router.post('/bet', async (req: Request, res: Response): Promise<void> => {
  const playerId = (req as Request & { playerId: string }).playerId;
  const { betAmount } = req.body as { betAmount?: unknown };

  if (typeof betAmount !== 'number' || betAmount < 5 || betAmount > 10_000) {
    res.status(400).json({ error: 'betAmount must be a number between 5 and 10000' });
    return;
  }

  // Find current waiting round
  const round = await prisma.crashRound.findFirst({
    where: { status: 'waiting' },
    orderBy: { created_at: 'desc' },
  });

  if (!round) {
    res.status(409).json({ error: 'No round open for betting right now' });
    return;
  }

  // Check for duplicate bet
  const existing = await prisma.crashBet.findUnique({
    where: { round_id_player_id: { round_id: round.id, player_id: playerId } },
  });
  if (existing) {
    res.status(409).json({ error: 'You already have a bet in this round' });
    return;
  }

  // Debit wallet
  try {
    await WalletService.debit(playerId, WalletType.main, betAmount, TxType.game_entry, round.id, 'Crash bet');
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      res.status(402).json({ error: err.message });
      return;
    }
    throw err;
  }

  // Record bet
  await prisma.crashBet.create({
    data: { round_id: round.id, player_id: playerId, bet_amount: betAmount },
  });

  // Notify via WebSocket (handled by crashEngine callbacks wired in websocket/index.ts)
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { username: true } });
  // Emit via io — accessed through the module-level ref wired in websocket setup
  const { getCrashIo } = await import('../websocket/index.js');
  getCrashIo()?.emit('CRASH_BET_PLACED', { playerId, betAmount });
  void player; // silence unused warning

  res.json({ roundId: round.id, betAmount });
});

// ─── GET /api/crash/history ───────────────────────────────────────────────────

router.get('/history', async (_req: Request, res: Response): Promise<void> => {
  const rounds = await prisma.crashRound.findMany({
    where: { status: 'crashed' },
    orderBy: { created_at: 'desc' },
    take: 50,
    select: { id: true, crash_point: true, crashed_at: true },
  });
  res.json(rounds.map((r) => ({ id: r.id, crashPoint: r.crash_point, crashedAt: r.crashed_at })));
});

export default router;
