// Admin player management endpoints
// Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 14.1

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { WalletType, TxType } from '@fidel/shared';
import prisma from '../../lib/prisma.js';
import { WalletService } from '../../services/wallet.service.js';

const router: RouterType = Router();

// GET /api/admin/players — paginated list with optional search
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
  const pageSize = Math.min(100, parseInt(req.query['limit'] as string) || 20);
  const search = (req.query['search'] as string | undefined) ?? '';
  const sortBy = (req.query['sortBy'] as string | undefined) ?? 'created_at';

  const where = search
    ? {
        OR: [
          { username: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search } },
        ],
      }
    : {};

  const [allPlayers, total] = await Promise.all([
    prisma.player.findMany({
      where,
      orderBy: { created_at: 'desc' as const },
      include: {
        wallets: { select: { type: true, balance: true } },
        _count: { select: { round_entries: true, referrals: true } },
      },
    }),
    prisma.player.count({ where }),
  ]);

  const mapped = allPlayers.map((p) => ({
    id: p.id,
    username: p.username,
    telegram_id: String(p.telegram_id),
    phone: p.phone ?? undefined,
    phone_verified: p.phone_verified,
    is_suspended: p.is_suspended,
    main_wallet_balance: Number(p.wallets.find((w) => w.type === 'main')?.balance ?? 0),
    play_wallet_balance: Number(p.wallets.find((w) => w.type === 'play')?.balance ?? 0),
    created_at: p.created_at.toISOString(),
    total_games: p._count.round_entries,
    total_referrals: p._count.referrals,
  }));

  if (sortBy === 'balance') {
    mapped.sort((a, b) => (b.main_wallet_balance + b.play_wallet_balance) - (a.main_wallet_balance + a.play_wallet_balance));
  }

  const items = mapped.slice((page - 1) * pageSize, page * pageSize);

  res.json({ items, total, page, pageSize });
});

// GET /api/admin/players/:id/transactions — paginated transaction history
router.get('/:id/transactions', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
  const pageSize = Math.min(100, parseInt(req.query['pageSize'] as string) || 30);

  const wallets = await prisma.wallet.findMany({
    where: { player_id: id },
    select: { id: true, type: true },
  });

  if (!wallets.length) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
    return;
  }

  const walletIds = wallets.map((w) => w.id);
  const walletTypeMap = new Map(wallets.map((w) => [w.id, w.type]));

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { wallet_id: { in: walletIds } },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where: { wallet_id: { in: walletIds } } }),
  ]);

  const items = transactions.map((tx) => ({
    id: tx.id,
    type: tx.type,
    amount: Number(tx.amount),
    walletType: walletTypeMap.get(tx.wallet_id) ?? 'play',
    note: tx.note ?? null,
    reference_id: tx.reference_id ?? null,
    created_at: tx.created_at.toISOString(),
  }));

  res.json({ items, total, page, pageSize });
});

// GET /api/admin/players/:id — full player detail
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      wallets: { select: { type: true, balance: true } },
      _count: { select: { round_entries: true, referrals: true } },
    },
  });

  if (!player) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
    return;
  }

  res.json({
    id: player.id,
    username: player.username,
    telegram_id: String(player.telegram_id),
    phone: player.phone ?? undefined,
    phone_verified: player.phone_verified,
    is_suspended: player.is_suspended,
    main_wallet_balance: Number(player.wallets.find((w) => w.type === 'main')?.balance ?? 0),
    play_wallet_balance: Number(player.wallets.find((w) => w.type === 'play')?.balance ?? 0),
    created_at: player.created_at.toISOString(),
    total_games: player._count.round_entries,
    total_referrals: player._count.referrals,
  });
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
