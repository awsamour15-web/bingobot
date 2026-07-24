// Admin player management endpoints
// Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 14.1

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { WalletType, TxType } from '@beteseb/shared';
import prisma from '../../lib/prisma.js';
import { WalletService } from '../../services/wallet.service.js';

const router: RouterType = Router();

// GET /api/admin/players — paginated list with optional search
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
  const limit = Math.min(100, parseInt(req.query['limit'] as string) || 20);
  const search = (req.query['search'] as string | undefined) ?? '';

  const where = search
    ? {
        OR: [
          { username: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search } },
        ],
      }
    : {};

  const [players, total] = await Promise.all([
    prisma.player.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: { wallets: { select: { type: true, balance: true } } },
    }),
    prisma.player.count({ where }),
  ]);

  res.json({ players, total, page, limit });
});

// GET /api/admin/players/:id — full player detail
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      wallets: {
        include: {
          transactions: {
            orderBy: { created_at: 'desc' },
            take: 50,
          },
        },
      },
      round_entries: {
        orderBy: { joined_at: 'desc' },
        take: 50,
        include: { game_round: true },
      },
    },
  });

  if (!player) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
    return;
  }

  res.json(player);
});

// PATCH /api/admin/players/:id/suspend
router.patch('/:id/suspend', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  const player = await prisma.player.update({
    where: { id },
    data: { is_suspended: true },
  }).catch(() => null);

  if (!player) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
    return;
  }

  res.json({ success: true });
});

// PATCH /api/admin/players/:id/restore
router.patch('/:id/restore', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  const player = await prisma.player.update({
    where: { id },
    data: { is_suspended: false },
  }).catch(() => null);

  if (!player) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
    return;
  }

  res.json({ success: true });
});

// POST /api/admin/players/:id/credit — manual wallet adjustment
router.post('/:id/credit', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  const { walletType, amount, note } = req.body as {
    walletType?: string;
    amount?: number;
    note?: string;
  };

  if (!walletType || amount === undefined || !note) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'walletType, amount, and note are required' });
    return;
  }

  if (!Object.values(WalletType).includes(walletType as WalletType)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid walletType' });
    return;
  }

  const adminId = req.admin?.adminId ?? 'unknown';
  const refId = `admin_adjust_${adminId}_${Date.now()}`;

  try {
    if (amount >= 0) {
      await WalletService.credit(id, walletType as WalletType, amount, TxType.admin_credit, refId, note);
    } else {
      await WalletService.debit(id, walletType as WalletType, Math.abs(amount), TxType.admin_debit, refId, note);
    }
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Adjustment failed';
    res.status(422).json({ error: 'ADJUSTMENT_FAILED', message: msg });
  }
});

export default router;
