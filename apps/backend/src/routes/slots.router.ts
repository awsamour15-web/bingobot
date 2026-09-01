// Slots game REST routes
// POST /api/slots/spin    — spin the reels
// POST /api/slots/gamble  — X2 gamble on last win
// GET  /api/slots/history — last 20 spins for player

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import { WalletService, InsufficientFundsError } from '../services/wallet.service.js';
import { TxType, WalletType } from '@fidel/shared';
import { spin, gamble } from '../services/slots-engine.service.js';

const router: RouterType = Router();
router.use(jwtAuthMiddleware);

const MIN_BET = 5;
const MAX_BET = 500;

// ─── POST /api/slots/spin ─────────────────────────────────────────────────────

router.post('/spin', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
  const { betAmount } = req.body as { betAmount?: unknown };

  if (typeof betAmount !== 'number' || betAmount < MIN_BET || betAmount > MAX_BET) {
    res.status(400).json({ error: `betAmount must be between ${MIN_BET} and ${MAX_BET}` });
    return;
  }

  // Check suspension
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { is_suspended: true } });
  if (player?.is_suspended) {
    res.status(403).json({ error: 'PLAYER_SUSPENDED', message: 'Your account has been suspended.' });
    return;
  }

  // Debit wallet first
  try {
    await WalletService.debitDual(playerId, betAmount, TxType.game_entry, undefined, 'Slots spin');
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      res.status(402).json({ error: 'INSUFFICIENT_FUNDS', message: err.message });
      return;
    }
    throw err;
  }

  // Load house edge from config (default 15%)
  const edgeConfig = await prisma.config.findUnique({ where: { key: 'house_edge_slots' } });
  const houseEdgePct = Math.min(50, Math.max(5, parseInt(edgeConfig?.value ?? '35', 10)));

  // Spin
  const result = spin(betAmount, houseEdgePct);

  // Credit win if any
  if (result.totalWin > 0) {
    await WalletService.credit(playerId, WalletType.main, result.totalWin, TxType.game_win, undefined, `Slots win ${result.totalWin}`);
  }

  // Persist spin
  const spinRecord = await prisma.slotSpin.create({
    data: {
      player_id: playerId,
      bet_amount: betAmount,
      reels: result.reels as unknown as object,
      multiplier_reel: result.multiplierReel,
      payline_wins: result.paylineWins as unknown as object,
      total_win: result.totalWin,
      status: result.totalWin > 0 ? 'win' : 'loss',
    },
  });

  // Credit invite bonus to referrer on first game bet (non-blocking, idempotent)
  const { ReferralService } = await import('../services/referral.service.js');
  void ReferralService.maybeCreditInviteBonus(playerId);

  // Get updated balance
  const wallets = await prisma.wallet.findMany({
    where: { player_id: playerId },
    select: { balance: true },
  });
  const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0);

  res.json({
    spinId: spinRecord.id,
    reels: result.reels,
    multiplierReel: result.multiplierReel,
    paylineWins: result.paylineWins,
    totalWin: result.totalWin,
    balance: totalBalance,
    canGamble: result.totalWin > 0,
  });
});

// ─── POST /api/slots/gamble ───────────────────────────────────────────────────

router.post('/gamble', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
  const { spinId, guess } = req.body as { spinId?: string; guess?: unknown };

  if (!spinId || (guess !== 'red' && guess !== 'black')) {
    res.status(400).json({ error: 'spinId and guess (red|black) required' });
    return;
  }

  // Load spin — must belong to this player, must be a win, no gamble yet
  const spinRecord = await prisma.slotSpin.findUnique({ where: { id: spinId } });
  if (!spinRecord || spinRecord.player_id !== playerId) {
    res.status(404).json({ error: 'Spin not found' });
    return;
  }
  if (spinRecord.status !== 'win') {
    res.status(409).json({ error: 'Cannot gamble on a losing spin' });
    return;
  }
  if (spinRecord.gamble_result !== null) {
    res.status(409).json({ error: 'Already gambled on this spin' });
    return;
  }

  const currentWin = Number(spinRecord.total_win);
  const result = gamble(currentWin, guess);

  // Reverse original win credit, then apply gamble result
  await WalletService.debit(playerId, WalletType.main, currentWin, TxType.game_entry, spinId, 'Slots gamble stake');
  if (result.won) {
    await WalletService.credit(playerId, WalletType.main, result.payout, TxType.game_win, spinId, `Slots gamble win ${result.payout}`);
  }

  // Update spin record
  await prisma.slotSpin.update({
    where: { id: spinId },
    data: { gamble_result: result as unknown as object },
  });

  const wallets = await prisma.wallet.findMany({
    where: { player_id: playerId },
    select: { balance: true },
  });
  const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0);

  res.json({ ...result, balance: totalBalance });
});

// ─── GET /api/slots/history ───────────────────────────────────────────────────

router.get('/history', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }

  const spins = await prisma.slotSpin.findMany({
    where: { player_id: playerId },
    orderBy: { created_at: 'desc' },
    take: 20,
    select: {
      id: true,
      bet_amount: true,
      total_win: true,
      multiplier_reel: true,
      status: true,
      created_at: true,
    },
  });

  res.json(spins.map((s: { id: string; bet_amount: { toString(): string }; total_win: { toString(): string }; multiplier_reel: number; status: string; created_at: Date }) => ({
    id: s.id,
    betAmount: Number(s.bet_amount),
    totalWin: Number(s.total_win),
    multiplierReel: s.multiplier_reel,
    status: s.status,
    createdAt: s.created_at,
  })));
});

export default router;
