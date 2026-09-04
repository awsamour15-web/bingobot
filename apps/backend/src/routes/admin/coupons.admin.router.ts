// Admin coupon management — CRUD on the active_coupons system setting

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

const SETTING_KEY = 'active_coupons';

interface CouponDef {
  code: string;
  amount: number;
  wallet: 'main' | 'play';
  maxUses: number | null;
  description: string;
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

// GET /api/admin/coupons — list all coupons with usage counts
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const coupons = await loadCoupons();

  // Attach usage count for each coupon from transactions
  const usageCounts = await Promise.all(
    coupons.map((c) =>
      prisma.transaction.count({
        where: { type: 'bonus' as any, note: { contains: `COUPON:${c.code}` } },
      }),
    ),
  );

  res.json(
    coupons.map((c, i) => ({ ...c, usedCount: usageCounts[i] ?? 0 })),
  );
});

// POST /api/admin/coupons — create a new coupon
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { code, amount, wallet = 'play', maxUses = null, description = '' } =
    req.body as Partial<CouponDef>;

  if (!code || typeof code !== 'string' || code.trim() === '') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'code is required' });
    return;
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'amount must be > 0' });
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
  };

  coupons.push(newCoupon);
  await saveCoupons(coupons);
  res.status(201).json(newCoupon);
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

export default router;
