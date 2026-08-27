// Keno game REST routes
// POST /api/keno/bet     — place a bet on the current betting round
// GET  /api/keno/state   — current round state + my bet
// GET  /api/keno/history — last 30 finished rounds
// GET  /api/keno/access  — check if the requesting player has access

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import { WalletService, InsufficientFundsError } from '../services/wallet.service.js';
import { TxType, WalletType } from '@fidel/shared';
import { kenoEngine, getKenoMultiplier } from '../services/keno-engine.service.js';

const router: RouterType = Router();
router.use(jwtAuthMiddleware);

const MIN_BET = 5;
const MAX_BET = 5_000;
const MIN_PICKS = 1;
const MAX_PICKS = 10;

// ─── Keno access gate ─────────────────────────────────────────────────────────
// Keno is restricted by default. Only players whose telegram IDs are listed in
// the config key `keno_allowed_ids` can access it.
// Value format: comma-separated telegram IDs, e.g. "123456789,987654321"
// If key is missing or empty → game is closed to everyone.

async function isKenoAllowed(playerId: string): Promise<boolean> {
  const cfg = await prisma.config.findUnique({ where: { key: 'keno_allowed_ids' } });
  if (!cfg?.value?.trim()) return false; // not configured = closed to all

  const raw = cfg.value.trim();

  // Special value "all" means open to everyone
  if (raw === 'all') return true;

  const allowedIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (allowedIds.length === 0) return false;

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { telegram_id: true },
  });
  if (!player) return false;

  // telegram_id is BigInt — convert safely without the 'n' suffix
  return allowedIds.includes(player.telegram_id?.toString() ?? '');
}

async function kenoAccessMiddleware(req: Request, res: Response, next: () => void): Promise<void> {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
  const allowed = await isKenoAllowed(playerId);
  if (!allowed) {
    res.status(403).json({ error: 'KENO_NOT_AVAILABLE', message: 'Keno is not available for your account yet.' });
    return;
  }
  next();
}

// ─── GET /api/keno/access ─────────────────────────────────────────────────────

router.get('/access', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
  const allowed = await isKenoAllowed(playerId);
  res.json({ allowed });
});

// ─── GET /api/keno/state ──────────────────────────────────────────────────────

router.get('/state', kenoAccessMiddleware, async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;

  // Find current active round (betting or drawing)
  const round = await prisma.kenoRound.findFirst({
    where: { status: { in: ['betting', 'drawing'] } },
    orderBy: { created_at: 'desc' },
    include: {
      bets: {
        select: {
          id: true,
          player_id: true,
          picked_numbers: true,
          bet_amount: true,
          matched: true,
          payout: true,
          player: { select: { username: true } },
        },
      },
    },
  });

  if (!round) {
    res.json({ phase: 'idle', round: null, myBet: null, bets: [] });
    return;
  }

  const myBets = round.bets.filter((b) => b.player_id === playerId);

  res.json({
    phase: round.status,
    round: {
      id: round.id,
      status: round.status,
      bettingEndsAt: round.betting_ends_at,
      drawnNumbers: round.drawn_numbers,
    },
    myBets: myBets.map((b) => ({
      id: b.id,
      pickedNumbers: b.picked_numbers,
      betAmount: Number(b.bet_amount),
      matched: b.matched,
      payout: b.payout ? Number(b.payout) : null,
    })),
    // keep legacy field for backwards compat
    myBet: myBets[0]
      ? {
          id: myBets[0].id,
          pickedNumbers: myBets[0].picked_numbers,
          betAmount: Number(myBets[0].bet_amount),
          matched: myBets[0].matched,
          payout: myBets[0].payout ? Number(myBets[0].payout) : null,
        }
      : null,
    bets: round.bets.map((b) => ({
      username: b.player.username,
      pickedNumbers: b.picked_numbers,
      pickedCount: b.picked_numbers.length,
      betAmount: Number(b.bet_amount),
      matched: b.matched,
      payout: b.payout ? Number(b.payout) : null,
    })),
  });
});

// ─── POST /api/keno/bet ───────────────────────────────────────────────────────

router.post('/bet', kenoAccessMiddleware, async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;
  if (!playerId) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }

  const { betAmount, pickedNumbers } = req.body as { betAmount?: unknown; pickedNumbers?: unknown };

  if (typeof betAmount !== 'number' || betAmount < MIN_BET || betAmount > MAX_BET) {
    res.status(400).json({ error: `betAmount must be between ${MIN_BET} and ${MAX_BET}` });
    return;
  }

  if (
    !Array.isArray(pickedNumbers) ||
    pickedNumbers.length < MIN_PICKS ||
    pickedNumbers.length > MAX_PICKS ||
    !pickedNumbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 80) ||
    new Set(pickedNumbers).size !== pickedNumbers.length
  ) {
    res.status(400).json({ error: `Pick between ${MIN_PICKS} and ${MAX_PICKS} unique numbers from 1–80` });
    return;
  }

  // Check suspension
  const playerRecord = await prisma.player.findUnique({ where: { id: playerId }, select: { is_suspended: true } });
  if (playerRecord?.is_suspended) {
    res.status(403).json({ error: 'PLAYER_SUSPENDED', message: 'Your account has been suspended.' });
    return;
  }

  // Find current betting round
  const round = await prisma.kenoRound.findFirst({
    where: { status: 'betting' },
    orderBy: { created_at: 'desc' },
  });

  if (!round) {
    res.status(409).json({ error: 'No round open for betting right now' });
    return;
  }

  // Debit wallet
  try {
    await WalletService.debit(playerId, WalletType.main, betAmount, TxType.game_entry, round.id, 'Keno bet');
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      res.status(402).json({ error: 'INSUFFICIENT_FUNDS', message: err.message });
      return;
    }
    throw err;
  }

  // Create bet
  const bet = await prisma.kenoBet.create({
    data: {
      round_id: round.id,
      player_id: playerId,
      picked_numbers: pickedNumbers as number[],
      bet_amount: betAmount,
    },
  });

  res.json({
    betId: bet.id,
    roundId: round.id,
    pickedNumbers,
    betAmount,
    bettingEndsAt: round.betting_ends_at,
  });
});

// ─── GET /api/keno/history ────────────────────────────────────────────────────

router.get('/history', kenoAccessMiddleware, async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player?.playerId;

  const rounds = await prisma.kenoRound.findMany({
    where: { status: 'finished' },
    orderBy: { created_at: 'desc' },
    take: 30,
    include: {
      bets: {
        where: playerId ? { player_id: playerId } : { player_id: '' },
        select: { picked_numbers: true, bet_amount: true, matched: true, payout: true },
      },
    },
  });

  res.json(
    rounds.map((r) => ({
      id: r.id,
      drawnNumbers: r.drawn_numbers,
      finishedAt: r.finished_at,
      myBets: r.bets.map((b) => ({
        pickedNumbers: b.picked_numbers,
        betAmount: Number(b.bet_amount),
        matched: b.matched,
        payout: b.payout ? Number(b.payout) : null,
      })),
      // legacy compat
      myBet: r.bets[0]
        ? {
            pickedNumbers: r.bets[0].picked_numbers,
            betAmount: Number(r.bets[0].bet_amount),
            matched: r.bets[0].matched,
            payout: r.bets[0].payout ? Number(r.bets[0].payout) : null,
          }
        : null,
    })),
  );
});

// ─── GET /api/keno/payouts ────────────────────────────────────────────────────

router.get('/payouts', (_req: Request, res: Response): void => {
  // Return the full payout table for the UI to display
  const table: { picked: number; payouts: { matched: number; multiplier: number }[] }[] = [];
  for (let picked = 1; picked <= 10; picked++) {
    const payouts: { matched: number; multiplier: number }[] = [];
    for (let matched = 0; matched <= picked; matched++) {
      const m = getKenoMultiplier(picked, matched);
      if (m > 0) payouts.push({ matched, multiplier: m });
    }
    table.push({ picked, payouts });
  }
  res.json({ table });
});

export default router;
