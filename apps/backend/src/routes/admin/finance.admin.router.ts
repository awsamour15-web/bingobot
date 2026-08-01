// Admin financial management endpoints
// Requirements: 14.2, 14.3, 14.4, 14.5

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { TxType, WalletType } from '@beteseb/shared';
import prisma from '../../lib/prisma.js';
import { WalletService } from '../../services/wallet.service.js';

const router: RouterType = Router();

// GET /api/admin/withdrawals — list pending withdrawal transactions
router.get('/withdrawals', async (_req: Request, res: Response): Promise<void> => {
  const withdrawals = await prisma.transaction.findMany({
    where: { type: TxType.withdrawal, note: { startsWith: 'PENDING:' } },
    orderBy: { created_at: 'desc' },
    include: {
      wallet: {
        select: {
          player: { select: { id: true, username: true, phone: true } },
        },
      },
    },
  });

  const result = withdrawals.map((tx) => ({
    id: tx.id,
    player_id: tx.wallet.player.id,
    username: tx.wallet.player.username,
    phone: tx.wallet.player.phone ?? '',
    amount: Number(tx.amount),
    created_at: tx.created_at.toISOString(),
    status: 'pending' as const,
  }));

  res.json(result);
});

// POST /api/admin/withdrawals/:id/approve — approve withdrawal
router.post('/withdrawals/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  const tx = await prisma.transaction.findUnique({ where: { id } });

  if (!tx || tx.type !== TxType.withdrawal || !tx.note?.startsWith('PENDING:')) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Pending withdrawal not found' });
    return;
  }

  try {
    await prisma.transaction.update({
      where: { id },
      data: { note: tx.note.replace('PENDING:', 'APPROVED:') },
    });
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Approval failed';
    res.status(422).json({ error: 'APPROVAL_FAILED', message: msg });
  }
});

// POST /api/admin/withdrawals/:id/reject — reject withdrawal, credit back funds
router.post('/withdrawals/:id/reject', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  const tx = await prisma.transaction.findUnique({
    where: { id },
  });

  if (!tx || tx.type !== TxType.withdrawal || !tx.note?.startsWith('PENDING:')) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Pending withdrawal not found' });
    return;
  }

  await prisma.transaction.update({
    where: { id },
    data: { note: tx.note.replace('PENDING:', 'REJECTED:') },
  });

  // Credit funds back — fetch wallet to get player_id
  const wallet = await prisma.wallet.findUnique({ where: { id: tx.wallet_id } });
  if (wallet) {
    await WalletService.credit(
      wallet.player_id,
      WalletType.main,
      Number(tx.amount),
      TxType.refund,
      id,
      'Withdrawal rejected by admin — funds returned',
    );

    // Notify the player via Telegram (non-blocking)
    import('../../bot/notifications.js').then(({ notifyWithdrawalRejected }) => {
      void notifyWithdrawalRejected(wallet.player_id);
    }).catch(() => {});
  }

  res.json({ success: true });
});

// GET /api/admin/revenue — revenue summary filterable by date range
router.get('/revenue', async (req: Request, res: Response): Promise<void> => {
  const startDate = req.query['startDate'] as string | undefined;
  const endDate = req.query['endDate'] as string | undefined;

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);

  const rounds = await prisma.gameRound.findMany({
    where: {
      status: { in: ['completed', 'void', 'cancelled'] },
      ...(Object.keys(dateFilter).length > 0 ? { ended_at: dateFilter } : {}),
    },
    select: {
      stake: true,
      derash: true,
      commission_pct: true,
      status: true,
      _count: { select: { round_entries: true } },
    },
  });

  let totalStakes = 0;
  let totalPrizes = 0;
  let totalCommission = 0;

  for (const r of rounds) {
    const players = r._count.round_entries;
    const stake = Number(r.stake);
    const derash = Number(r.derash);
    const commissionPct = Number(r.commission_pct);
    totalStakes += players * stake;
    if (r.status === 'completed') {
      totalPrizes += derash;
      totalCommission += players * stake * (commissionPct / 100);
    }
  }

  res.json({
    totalStakesCollected: totalStakes,
    totalPrizesPaid: totalPrizes,
    platformCommissionEarned: totalCommission,
  });
});

export default router;
