// Royal Drop game routes
// POST /api/royal-drop/spin    — play one round (stateless, like Slots)
// GET  /api/royal-drop/history — last 20 plays
// GET  /api/royal-drop/access  — check if the requesting player has access

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import { WalletService, InsufficientFundsError } from '../services/wallet.service.js';
import { TxType, WalletType } from '@fidel/shared';
import { royalDrop } from '../services/royal-drop-engine.service.js';
import { CashbackService } from '../services/cashback.service.js';

const router: RouterType = Router();
router.use(jwtAuthMiddleware);

const MIN_BET = 1;
const MAX_BET = 15_000;

// ─── Access gate ──────────────────────────────────────────────────────────────
// Config key `royal_drop_allowed_usernames` — comma-separated usernames, or "all"
// e.g. "username1" or "username1,username2" or "all"
// If key is missing or empty → game is closed to everyone.

async function isRoyalDropAllowed(playerId: string): Promise<boolean> {
  const cfg = await prisma.config.findUnique({ where: { key: 'royal_drop_allowed_usernames' } });
  if (!cfg?.value?.trim()) return false;
  const raw = cfg.value.trim();
  if (raw === 'all') return true;
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { username: true } });
  return allowed.includes(player?.username ?? '');
}

async function royalDropAccessMiddleware(req: Request, res: Response, next: () => void): Promise<void> {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
  if (!(await isRoyalDropAllowed(playerId))) {
    res.status(403).json({ error: 'ROYAL_DROP_NOT_AVAILABLE', message: 'Royal Drop is not available for your account yet.' });
    return;
  }
  next();
}

// ─── GET /api/royal-drop/access ───────────────────────────────────────────────

router.get('/access', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
  res.json({ allowed: await isRoyalDropAllowed(playerId) });
});

// ─── POST /api/royal-drop/spin ────────────────────────────────────────────────

router.post('/spin', royalDropAccessMiddleware, async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }

  const { betAmount, walletType } = req.body as { betAmount?: unknown; walletType?: unknown };

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

  // Debit wallet (play wallet first, fall back to main)
  const preferredWallet = walletType === 'main' ? WalletType.main : undefined;
  try {
    await WalletService.debitDual(playerId, betAmount, TxType.game_entry, preferredWallet, 'Royal Drop spin');
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      res.status(402).json({ error: 'INSUFFICIENT_FUNDS', message: err.message });
      return;
    }
    throw err;
  }

  // Load house edge from config (default 15%)
  const edgeConfig = await prisma.config.findUnique({ where: { key: 'house_edge_royal_drop' } });
  const houseEdge = Math.min(50, Math.max(5, parseInt(edgeConfig?.value ?? '15', 10)));

  // Run the game engine
  const result = royalDrop(betAmount, houseEdge);

  // Credit winnings to main wallet
  if (result.totalWin > 0) {
    await WalletService.credit(
      playerId,
      WalletType.main,
      result.totalWin,
      TxType.game_win,
      undefined,
      'Royal Drop win',
    );
  }

  const bonusTriggered = result.bonusSpins.length > 0;
  const multiplier = betAmount > 0 ? parseFloat((result.totalWin / betAmount).toFixed(4)) : 0;

  // Persist the bet
  const record = await prisma.royalDropBet.create({
    data: {
      player_id: playerId,
      bet_amount: betAmount,
      cashout_multiplier: multiplier,
      payout: result.totalWin,
      bonus_triggered: bonusTriggered,
      status: result.totalWin > 0 ? 'won' : 'lost',
    },
  });

  // Cashback on net loss (non-blocking)
  void CashbackService.maybeCreditCashback(playerId, 'royal_drop', betAmount, betAmount - result.totalWin, record.id);

  // Fetch updated balance
  const wallets = await prisma.wallet.findMany({ where: { player_id: playerId } });
  const mainBal = parseFloat(String(wallets.find(w => w.type === 'main')?.balance ?? 0));
  const playBal = parseFloat(String(wallets.find(w => w.type === 'play')?.balance ?? 0));

  res.json({
    id: record.id,
    betAmount,
    baseSpins: result.baseSpins,
    bonusSpins: result.bonusSpins,
    totalWin: result.totalWin,
    multiplier,
    balance: mainBal + playBal,
  });
});

// ─── GET /api/royal-drop/history ─────────────────────────────────────────────

router.get('/history', royalDropAccessMiddleware, async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }

  const bets = await prisma.royalDropBet.findMany({
    where: { player_id: playerId },
    orderBy: { created_at: 'desc' },
    take: 20,
    select: {
      id: true,
      bet_amount: true,
      payout: true,
      cashout_multiplier: true,
      bonus_triggered: true,
      status: true,
      created_at: true,
    },
  });

  res.json(bets.map(b => ({
    id: b.id,
    betAmount: Number(b.bet_amount),
    payout: b.payout !== null ? Number(b.payout) : null,
    multiplier: b.cashout_multiplier,
    bonusTriggered: b.bonus_triggered,
    status: b.status,
    createdAt: b.created_at.toISOString(),
  })));
});

export default router;
