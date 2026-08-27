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
  const playerId = req.player?.playerId;

  const round = await prisma.crashRound.findFirst({
    where: { status: { in: ['waiting', 'running'] } },
    orderBy: { created_at: 'desc' },
    include: {
      bets: {
        select: {
          player_id: true,
          slot: true,
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
  const myBets = round.bets.filter((b) => b.player_id === playerId);
  const myBet1 = myBets.find((b) => b.slot === 1) ?? null;
  const myBet2 = myBets.find((b) => b.slot === 2) ?? null;

  // For running rounds, calculate the live multiplier so clients can sync immediately
  let currentMultiplier = 1.0;
  if (round.status === 'running' && round.started_at) {
    const elapsed = (Date.now() - round.started_at.getTime()) / 1000;
    currentMultiplier = parseFloat(Math.pow(Math.E, 0.00006 * elapsed * 1000).toFixed(2));
  }

  res.json({
    phase: round.status,
    round: {
      id: round.id,
      status: round.status,
      startedAt: round.started_at,
      crashPoint: round.status === 'crashed' ? round.crash_point : null,
      currentMultiplier: round.status === 'running' ? currentMultiplier : null,
    },
    myBet: myBet1
      ? {
          betAmount: Number(myBet1.bet_amount),
          cashoutAt: myBet1.cashout_at,
          payout: myBet1.payout ? Number(myBet1.payout) : null,
        }
      : null,
    myBet2: myBet2
      ? {
          betAmount: Number(myBet2.bet_amount),
          cashoutAt: myBet2.cashout_at,
          payout: myBet2.payout ? Number(myBet2.payout) : null,
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
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
  const { betAmount, slot } = req.body as { betAmount?: unknown; slot?: unknown };

  if (typeof betAmount !== 'number' || betAmount < 5 || betAmount > 10_000) {
    res.status(400).json({ error: 'betAmount must be a number between 5 and 10000' });
    return;
  }

  const slotIdx = slot === 2 ? 2 : 1;

  // Check suspension
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { is_suspended: true } });
  if (player?.is_suspended) {
    res.status(403).json({ error: 'PLAYER_SUSPENDED', message: 'Your account has been suspended.' });
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

  // Check for duplicate bet on this slot
  const existing = await prisma.crashBet.findUnique({
    where: { round_id_player_id_slot: { round_id: round.id, player_id: playerId, slot: slotIdx } },
  });
  if (existing) {
    res.status(409).json({ error: 'You already have a bet in this slot for this round' });
    return;
  }

  // Debit wallet
  try {
    await WalletService.debit(playerId, WalletType.main, betAmount, TxType.game_entry, round.id, `Crash bet slot ${slotIdx}`);
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      res.status(402).json({ error: 'INSUFFICIENT_FUNDS', message: err.message });
      return;
    }
    throw err;
  }

  // Record bet
  try {
    await prisma.crashBet.create({
      data: { round_id: round.id, player_id: playerId, slot: slotIdx, bet_amount: betAmount },
    });
  } catch (dbErr: any) {
    // P2002 = unique constraint violation — already bet (race condition or duplicate request)
    if (dbErr?.code === 'P2002') {
      // Refund the wallet debit
      await WalletService.credit(playerId, WalletType.main, betAmount, TxType.game_entry, round.id, `Crash bet refund slot ${slotIdx}`).catch(() => {});
      res.status(409).json({ error: 'You already have a bet in this round' });
      return;
    }
    throw dbErr;
  }

  // Notify via WebSocket
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { username: true } });
  const { getCrashIo } = await import('../websocket/index.js');
  getCrashIo()?.emit('CRASH_BET_PLACED', { playerId, betAmount, slot: slotIdx });
  void player;

  res.json({ roundId: round.id, betAmount, slot: slotIdx });
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
