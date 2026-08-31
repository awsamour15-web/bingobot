// Plinko game REST routes
// POST /api/plinko/drop   — drop a ball, get instant result
// GET  /api/plinko/history — last 30 bets for the player

import crypto from 'node:crypto';
import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import { WalletService, InsufficientFundsError } from '../services/wallet.service.js';
import { TxType, WalletType } from '@fidel/shared';

const router: RouterType = Router();
router.use(jwtAuthMiddleware);

// ─── Access gate ──────────────────────────────────────────────────────────────
// Config key `plinko_allowed_usernames` — comma-separated usernames, or "all"
// e.g. "kanu_1921" or "kanu_1921,other_user" or "all"

async function isPlinkoAllowed(playerId: string): Promise<boolean> {
  const cfg = await prisma.config.findUnique({ where: { key: 'plinko_allowed_usernames' } });
  if (!cfg?.value?.trim()) return false;
  const raw = cfg.value.trim();
  if (raw === 'all') return true;
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { username: true } });
  return allowed.includes(player?.username ?? '');
}

async function plinkoAccessMiddleware(req: Request, res: Response, next: () => void): Promise<void> {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
  if (!(await isPlinkoAllowed(playerId))) {
    res.status(403).json({ error: 'PLINKO_NOT_AVAILABLE', message: 'Plinko is not available for your account yet.' });
    return;
  }
  next();
}

// GET /api/plinko/access — lets the frontend check without exposing the full game
router.get('/access', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
  res.json({ allowed: await isPlinkoAllowed(playerId) });
});

const MIN_BET = 5;
const MAX_BET = 10_000;
const VALID_ROWS = [8, 12, 16] as const;
type RiskLevel = 'low' | 'medium' | 'high';

// ─── Multiplier tables ───────────────────────────────────────────────────────
// Indexed by slot (left edge = 0, right edge = rows)
// Values roughly mirror popular Plinko implementations

const MULTIPLIERS: Record<number, Record<RiskLevel, number[]>> = {
  8: {
    low:    [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    medium: [13,  3,   1.3, 0.7, 0.4, 0.7, 1.3, 3,   13],
    high:   [29,  4,   1.5, 0.3, 0.2, 0.3, 1.5, 4,   29],
  },
  12: {
    low:    [8.9, 3,   1.4, 1.1, 1.0, 0.5, 0.5, 1.0, 1.1, 1.4, 3,   8.9],
    medium: [33,  11,  4,   2,   1.1, 0.6, 0.6, 1.1, 2,   4,   11,  33],
    high:   [170, 24,  8.1, 2,   0.7, 0.2, 0.2, 0.7, 2,   8.1, 24,  170],
  },
  16: {
    low:    [16,  9,   2,   1.4, 1.1, 1.0, 0.5, 0.3, 0.3, 0.5, 1.0, 1.1, 1.4, 2,   9,   16],
    medium: [110, 41,  10,  5,   3,   1.5, 1.0, 0.5, 0.5, 1.0, 1.5, 3,   5,   10,  41,  110],
    high:   [1000,130, 26,  9,   4,   2,   0.2, 0.2, 0.2, 0.2, 2,   4,   9,   26,  130, 1000],
  },
};

// ─── Provably fair path generation ───────────────────────────────────────────

function generatePath(rows: number): { path: number[]; slot: number } {
  const path: number[] = [];
  let slot = 0;
  for (let i = 0; i < rows; i++) {
    // Each bounce is cryptographically random 0 or 1
    const dir = crypto.randomInt(0, 2); // 0=left, 1=right
    path.push(dir);
    slot += dir;
  }
  return { path, slot };
}

// ─── POST /api/plinko/drop ───────────────────────────────────────────────────

router.post('/drop', plinkoAccessMiddleware, async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }

  const { betAmount, rows, risk } = req.body as { betAmount?: unknown; rows?: unknown; risk?: unknown };

  if (typeof betAmount !== 'number' || betAmount < MIN_BET || betAmount > MAX_BET) {
    res.status(400).json({ error: `betAmount must be between ${MIN_BET} and ${MAX_BET}` });
    return;
  }

  if (!VALID_ROWS.includes(rows as typeof VALID_ROWS[number])) {
    res.status(400).json({ error: 'rows must be 8, 12, or 16' });
    return;
  }

  const validRisks: RiskLevel[] = ['low', 'medium', 'high'];
  if (!validRisks.includes(risk as RiskLevel)) {
    res.status(400).json({ error: 'risk must be low, medium, or high' });
    return;
  }

  // Check suspension
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { is_suspended: true } });
  if (player?.is_suspended) {
    res.status(403).json({ error: 'PLAYER_SUSPENDED', message: 'Your account has been suspended.' });
    return;
  }

  // Debit wallet before computing result
  try {
    await WalletService.debit(playerId, WalletType.play, betAmount, TxType.game_entry, undefined, 'Plinko drop');
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      res.status(402).json({ error: 'INSUFFICIENT_FUNDS', message: (err as Error).message });
      return;
    }
    throw err;
  }

  // Generate result
  const numRows = rows as typeof VALID_ROWS[number];
  const riskLevel = risk as RiskLevel;
  const { path, slot } = generatePath(numRows);
  const multiplierTable = MULTIPLIERS[numRows][riskLevel];
  const multiplier = multiplierTable[slot];
  const payout = parseFloat((betAmount * multiplier).toFixed(2));

  // Credit winnings (if any)
  if (payout > 0) {
    await WalletService.credit(playerId, WalletType.main, payout, TxType.game_win, undefined, `Plinko win x${multiplier}`);
  }

  // Persist
  const bet = await prisma.plinkoBet.create({
    data: {
      player_id: playerId,
      bet_amount: betAmount,
      rows: numRows,
      risk: riskLevel,
      path,
      slot,
      multiplier,
      payout,
    },
  });

  // Credit invite bonus to referrer on first game bet (non-blocking, idempotent)
  const { ReferralService } = await import('../services/referral.service.js');
  void ReferralService.maybeCreditInviteBonus(playerId);

  res.json({
    id: bet.id,
    path,
    slot,
    multiplier,
    payout,
    betAmount,
  });
});

// ─── GET /api/plinko/history ──────────────────────────────────────────────────

router.get('/history', plinkoAccessMiddleware, async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }

  const bets = await prisma.plinkoBet.findMany({
    where: { player_id: playerId },
    orderBy: { created_at: 'desc' },
    take: 30,
    select: { id: true, bet_amount: true, rows: true, risk: true, slot: true, multiplier: true, payout: true, created_at: true },
  });

  res.json(bets.map((b) => ({
    id: b.id,
    betAmount: Number(b.bet_amount),
    rows: b.rows,
    risk: b.risk,
    slot: b.slot,
    multiplier: b.multiplier,
    payout: Number(b.payout),
    createdAt: b.created_at,
  })));
});

export default router;
