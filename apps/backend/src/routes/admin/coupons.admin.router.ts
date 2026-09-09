// Admin coupon management — CRUD on the active_coupons system setting

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import { TxType } from '@fidel/shared';
import { CouponScheduler } from '../../services/coupon-scheduler.service.js';

const router: RouterType = Router();

const SETTING_KEY = 'active_coupons';

interface WithdrawalRequirements {
  minDepositToday?: number;       // min deposit amount today
  minTotalDeposit?: number;       // min total deposits ever
  minGamesToday?: number;         // min games played today (bingo rounds + instant games)
  minInvitations?: number;        // min referrals (invited players)
}

interface CouponDef {
  code: string;
  amount: number;
  wallet: 'main' | 'play';
  maxUses: number | null;
  description: string;
  claimRequirements?: WithdrawalRequirements;
}

async function loadCoupons(): Promise<CouponDef[]> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!setting?.value) return [];
  try { return JSON.parse(setting.value as string) as CouponDef[]; } catch { return []; }
}

async function saveCoupons(coupons: CouponDef[]): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(coupons) },
    create: { key: SETTING_KEY, value: JSON.stringify(coupons) },
  });
}
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const coupons = await loadCoupons();

  // Attach usage count for each coupon from transactions
  const usageCounts = await Promise.all(
    coupons.map((c) =>
      prisma.transaction.count({
        where: { type: TxType.bonus, note: { contains: `COUPON:${c.code}` } },
      }),
    ),
  );

  res.json(
    coupons.map((c, i) => ({ ...c, usedCount: usageCounts[i] ?? 0 })),
  );
});

// POST /api/admin/coupons — create a new coupon
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { code, amount, wallet = 'play', maxUses = null, description = '', claimRequirements } =
    req.body as Partial<CouponDef>;

  if (!code || typeof code !== 'string' || code.trim() === '') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'code is required' });
    return;
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'amount must be > 0' });
    return;
  }
  if (amount > 10_000) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Coupon amount cannot exceed 10,000 ETB' });
    return;
  }

  const normalized = code.trim().toUpperCase();
  const coupons = await loadCoupons();

  if (coupons.some((c) => c.code === normalized)) {
    res.status(409).json({ error: 'DUPLICATE_CODE', message: 'A coupon with this code already exists' });
    return;
  }

  const newCoupon: CouponDef = {
    code: normalized,
    amount,
    wallet: wallet === 'main' ? 'main' : 'play',
    maxUses: maxUses === null || maxUses === undefined ? null : Number(maxUses),
    description: String(description),
    claimRequirements: claimRequirements ?? undefined,
  };

  coupons.push(newCoupon);
  await saveCoupons(coupons);
  res.status(201).json(newCoupon);
});

// GET /api/admin/coupons/:code/redemptions — list every player who redeemed this coupon
router.get('/:code/redemptions', async (req: Request, res: Response): Promise<void> => {
  const code = (req.params['code'] as string).toUpperCase();

  const transactions = await prisma.transaction.findMany({
    where: { type: TxType.bonus, note: { contains: `COUPON:${code}` } },
    orderBy: { created_at: 'desc' },
    include: {
      wallet: {
        include: { player: { select: { id: true, username: true, phone: true } } },
      },
    },
  });

  res.json(
    transactions.map((t) => ({
      transactionId: t.id,
      playerId: t.wallet.player.id,
      playerName: t.wallet.player.username,
      playerPhone: t.wallet.player.phone ?? '—',
      amount: Number(t.amount),
      walletType: t.wallet.type,
      redeemedAt: t.created_at.toISOString(),
    })),
  );
});

// DELETE /api/admin/coupons/:code — remove a coupon
router.delete('/:code', async (req: Request, res: Response): Promise<void> => {
  const code = (req.params['code'] as string).toUpperCase();
  const coupons = await loadCoupons();
  const filtered = coupons.filter((c) => c.code !== code);
  if (filtered.length === coupons.length) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Coupon not found' });
    return;
  }
  await saveCoupons(filtered);
  res.json({ success: true });
});

// ── Coupon Schedules ──────────────────────────────────────────────────────────

// GET /schedules — list all coupon announcement schedules
router.get('/schedules', async (_req: Request, res: Response): Promise<void> => {
  res.json(await CouponScheduler.loadSchedules());
});

// POST /schedules — create a new coupon announcement schedule
router.post('/schedules', async (req: Request, res: Response): Promise<void> => {
  const { coupon_code, target_ids, send_at } = req.body as {
    coupon_code?: string;
    target_ids?: string[];
    send_at?: string;
  };
  if (!coupon_code || typeof coupon_code !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'coupon_code is required' }); return;
  }
  if (!Array.isArray(target_ids) || target_ids.length === 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'target_ids must be a non-empty array' }); return;
  }
  if (!send_at || isNaN(Date.parse(send_at))) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'send_at must be a valid ISO date' }); return;
  }
  const normalized = coupon_code.trim().toUpperCase();
  const coupons = await loadCoupons();
  const coupon = coupons.find(c => c.code === normalized);
  if (!coupon) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Coupon "${normalized}" not found` }); return;
  }
  const schedules = await CouponScheduler.loadSchedules();
  const newSchedule = {
    id: randomUUID(),
    coupon_code: normalized,
    coupon_amount: coupon.amount,
    coupon_description: coupon.description ?? '',
    target_ids,
    send_at,
    sent: false,
  };
  schedules.push(newSchedule);
  await CouponScheduler.saveSchedules(schedules);
  res.status(201).json(newSchedule);
});

// DELETE /schedules/:id — remove a schedule
router.delete('/schedules/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  const schedules = await CouponScheduler.loadSchedules();
  const filtered = schedules.filter(s => s.id !== id);
  if (filtered.length === schedules.length) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Schedule not found' }); return;
  }
  await CouponScheduler.saveSchedules(filtered);
  res.json({ success: true });
});

export default router;
