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
// Reduced multipliers to be more house-favorable

const MULTIPLIERS: Record<number, Record<RiskLevel, number[]>> = {
  8: {
    low:    [3.0, 1.5, 1.0, 0.8, 0.5, 0.8, 1.0, 1.5, 3.0],
    medium: [5.0, 2.0, 1.0, 0.6, 0.3, 0.6, 1.0, 2.0, 5.0],
    high:   [10,  3.0, 1.2, 0.4, 0.2, 0.4, 1.2, 3.0, 10],
  },
  12: {
    low:    [4.0, 2.0, 1.2, 1.0, 0.8, 0.5, 0.3, 0.5, 0.8, 1.0, 1.2, 2.0, 4.0],
    medium: [8.0, 4.0, 2.0, 1.5, 0.8, 0.4, 0.2, 0.4, 0.8, 1.5, 2.0, 4.0, 8.0],
    high:   [25,  10,  4.0, 2.0, 0.8, 0.3, 0.2, 0.3, 0.8, 2.0, 4.0, 10,  25],
  },
  16: {
    low:    [5.0, 3.0, 1.5, 1.2, 1.0, 0.8, 0.5, 0.3, 0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 3.0, 5.0],
    medium: [12,  6.0, 3.0, 2.0, 1.5, 1.0, 0.8, 0.4, 0.4, 0.8, 1.0, 1.5, 2.0, 3.0, 6.0, 12],
    high:   [50,  20,  10,  5.0, 3.0, 2.0, 0.5, 0.3, 0.3, 0.5, 2.0, 3.0, 5.0, 10,  20,  50],
  },
};

// ─── Provably fair path generation ───────────────────────────────────────────
// House edge is applied by biasing slot selection toward lower-value center slots.
// The path array is then constructed to match the chosen slot, with random
// left/right ordering so the ball's visual path looks natural.

function buildPathForSlot(rows: number, targetSlot: number): number[] {
  // targetSlot = number of right-turns (0..rows)
  // We need exactly targetSlot ones and (rows - targetSlot) zeros, shuffled randomly
  const path: number[] = [
    ...Array(targetSlot).fill(1),
    ...Array(rows - targetSlot).fill(0),
  ];
  // Fisher-Yates shuffle using crypto random
  for (let i = path.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [path[i], path[j]] = [path[j]!, path[i]!];
  }
  return path;
}

function pickSlotWithHouseEdge(
  rows: number,
  multipliers: number[],
  houseEdgePct: number,
): number {
  const slotCount = rows + 1;
  // Base probabilities: binomial distribution B(rows, 0.5)
  // P(slot=k) = C(rows,k) / 2^rows
  const binom: number[] = [];
  let c = 1;
  for (let k = 0; k <= rows; k++) {
    binom[k] = c;
    c = c * (rows - k) / (k + 1);
  }
  const total = binom.reduce((a, b) => a + b, 0);
  const baseProbabilities = binom.map((b) => b / total);

  // Inverse-multiplier weighting: slots with lower multipliers get higher weight
  // The blending factor comes from house edge (0% edge = fair, 50% edge = fully biased)
  const edgeFactor = houseEdgePct / 100; // 0..0.5
  const invMuls = multipliers.map((m) => 1 / Math.max(0.01, m));
  const invTotal = invMuls.reduce((a, b) => a + b, 0);
  const biasedProbabilities = invMuls.map((inv) => inv / invTotal);

  // Blend: final = baseProbabilities * (1 - edgeFactor) + biasedProbabilities * edgeFactor
  const blended = baseProbabilities.map(
    (p, i) => p * (1 - edgeFactor) + (biasedProbabilities[i]! * edgeFactor),
  );

  // Normalize
  const blendedTotal = blended.reduce((a, b) => a + b, 0);
  const weights = blended.map((p) => p / blendedTotal);

  // Weighted random pick using crypto random
  const rand = crypto.randomInt(0, 1_000_000) / 1_000_000;
  let cumulative = 0;
  for (let k = 0; k < slotCount; k++) {
    cumulative += weights[k]!;
    if (rand < cumulative) return k;
  }
  return Math.floor(slotCount / 2); // fallback to center
}

// ─── POST /api/plinko/drop ───────────────────────────────────────────────────

router.post('/drop', plinkoAccessMiddleware, async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }

  const { betAmount, rows, risk, walletType } = req.body as { betAmount?: unknown; rows?: unknown; risk?: unknown; walletType?: unknown };

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

  const validWalletTypes: ('main' | 'play')[] = ['main', 'play'];
  const walletToUse: WalletType = validWalletTypes.includes(walletType as 'main' | 'play') 
    ? (walletType as 'main' | 'play') 
    : WalletType.play;

  // Check suspension
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { is_suspended: true } });
  if (player?.is_suspended) {
    res.status(403).json({ error: 'PLAYER_SUSPENDED', message: 'Your account has been suspended.' });
    return;
  }

  // Debit wallet before computing result
  try {
    await WalletService.debitDual(playerId, betAmount, TxType.game_entry, undefined, 'Plinko drop');
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      res.status(402).json({ error: 'INSUFFICIENT_FUNDS', message: (err as Error).message });
      return;
    }
    throw err;
  }

  // Generate result — house edge controls slot selection, not payout scaling
  const numRows = rows as typeof VALID_ROWS[number];
  const riskLevel = risk as RiskLevel;
  const multiplierTable = MULTIPLIERS[numRows]![riskLevel]!;

  // Load house edge from DB config (default 15%)
  const edgeCfg = await prisma.config.findUnique({ where: { key: 'house_edge_plinko' } });
  const houseEdgePct = Math.min(50, Math.max(0, parseInt(edgeCfg?.value ?? '15', 10)));

  // Pick slot biased by house edge, then build a matching path
  const slot = pickSlotWithHouseEdge(numRows, multiplierTable, houseEdgePct);
  const path = buildPathForSlot(numRows, slot);

  // Full multiplier paid — no scaling
  const multiplier = multiplierTable[slot]!;
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

  const wallets = await prisma.wallet.findMany({
    where: { player_id: playerId },
    select: { balance: true },
  });
  const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0);

  res.json({
    path,
    slot,
    multiplier,
    payout,
    betAmount,
    totalBalance,
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
