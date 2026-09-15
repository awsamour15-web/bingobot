// Daily Spin Wheel — one spin per player per day (UTC+3)
// GET  /api/spin/status  — check if player can spin today
// POST /api/spin         — perform the spin, returns prize, credits wallet

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { TxType, WalletType } from '@fidel/shared';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import { WalletService } from '../services/wallet.service.js';

const router: RouterType = Router();
router.use(jwtAuthMiddleware);

// ── Spin prize table ──────────────────────────────────────────────────────────
// Each segment: { label, prize (0 = no luck), weight (higher = more likely) }
const SEGMENTS = [
  { label: 'No Luck',  prize: 0,    weight: 35 },
  { label: '5 ETB',    prize: 5,    weight: 25 },
  { label: '10 ETB',   prize: 10,   weight: 18 },
  { label: '20 ETB',   prize: 20,   weight: 12 },
  { label: '50 ETB',   prize: 50,   weight: 6  },
  { label: '100 ETB',  prize: 100,  weight: 3  },
  { label: '200 ETB',  prize: 200,  weight: 1  },
] as const;

const TOTAL_WEIGHT = SEGMENTS.reduce((s, seg) => s + seg.weight, 0);

function pickSegment(): typeof SEGMENTS[number] {
  let rand = Math.random() * TOTAL_WEIGHT;
  for (const seg of SEGMENTS) {
    rand -= seg.weight;
    if (rand <= 0) return seg;
  }
  return SEGMENTS[0];
}

function getAddisToday(): string {
  const ADDIS_OFFSET_MS = 3 * 60 * 60 * 1000;
  const nowAddis = new Date(Date.now() + ADDIS_OFFSET_MS);
  return nowAddis.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─── GET /api/spin/status ────────────────────────────────────────────────────

router.get('/status', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;
  const today = getAddisToday();

  const existing = await prisma.dailySpinLog.findUnique({
    where: { player_id_spun_date: { player_id: playerId, spun_date: today } },
  });

  res.json({
    canSpin: !existing,
    spunToday: !!existing,
    prize: existing ? Number(existing.prize) : null,
    prizeType: existing ? existing.prize_type : null,
  });
});

// ─── POST /api/spin ───────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;
  const today = getAddisToday();

  // Idempotency: already spun today?
  const existing = await prisma.dailySpinLog.findUnique({
    where: { player_id_spun_date: { player_id: playerId, spun_date: today } },
  });

  if (existing) {
    res.status(409).json({
      error: 'ALREADY_SPUN',
      message: 'You have already spun today. Come back tomorrow!',
      prize: Number(existing.prize),
      prizeType: existing.prize_type,
    });
    return;
  }

  const segment = pickSegment();
  const prize = segment.prize;
  const prizeType = prize > 0 ? 'bonus' : 'no_luck';
  const segmentIndex = SEGMENTS.indexOf(segment as any);

  // Record the spin log first (unique constraint prevents race condition)
  try {
    await prisma.dailySpinLog.create({
      data: {
        player_id: playerId,
        prize,
        prize_type: prizeType,
        spun_date: today,
      },
    });
  } catch {
    // Unique constraint violation = already spun (race condition)
    res.status(409).json({
      error: 'ALREADY_SPUN',
      message: 'You have already spun today. Come back tomorrow!',
    });
    return;
  }

  // Credit prize to play wallet if won
  if (prize > 0) {
    await WalletService.credit(
      playerId,
      WalletType.play,
      prize,
      TxType.bonus,
      undefined,
      `Daily Spin Prize: ${segment.label}`,
    );
  }

  res.json({
    segmentIndex,
    label: segment.label,
    prize,
    prizeType,
    canSpin: false,
  });
});

export default router;
