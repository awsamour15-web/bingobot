// Admin financial management endpoints
// Requirements: 14.2, 14.3, 14.4, 14.5

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { TxType, WalletType } from '@fidel/shared';
import prisma from '../../lib/prisma.js';
import { WalletService } from '../../services/wallet.service.js';

const router: RouterType = Router();

// GET /api/admin/withdrawals — list pending withdrawal requests
router.get('/withdrawals', async (_req: Request, res: Response): Promise<void> => {
  const withdrawals = await prisma.pendingWithdrawal.findMany({
    where: { status: 'pending' },
    orderBy: { created_at: 'desc' },
    include: {
      player: { select: { id: true, username: true, phone: true } },
    },
  });

  const result = withdrawals.map((w) => ({
    id: w.id,
    player_id: w.player.id,
    username: w.player.username,
    phone: w.phone,
    amount: Number(w.amount),
    created_at: w.created_at.toISOString(),
    status: w.status,
  }));

  res.json(result);
});

// POST /api/admin/withdrawals/:id/approve — admin paid, submits Telebirr tx number or full SMS to verify
router.post('/withdrawals/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  const { tx_number } = req.body as { tx_number?: string };

  if (!tx_number || typeof tx_number !== 'string' || tx_number.trim() === '') {
    res.status(400).json({ error: 'TX_NUMBER_REQUIRED', message: 'Telebirr transaction number or SMS message is required' });
    return;
  }

  // Try to parse as a full Telebirr SMS first, fall back to treating as a raw tx number
  const { parseTelebirrReceipt } = await import('../../bot/index.js');
  const parsed = parseTelebirrReceipt(tx_number);
  const txNumber = (parsed?.txNumber ?? tx_number.trim()).toUpperCase();

  if (!txNumber || txNumber.length < 6) {
    res.status(400).json({ error: 'INVALID_TX', message: 'Could not extract a valid transaction number from the input' });
    return;
  }

  const withdrawal = await prisma.pendingWithdrawal.findUnique({
    where: { id },
    include: { player: { select: { id: true } } },
  });

  if (!withdrawal || withdrawal.status !== 'pending') {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Pending withdrawal not found' });
    return;
  }

  // Prevent duplicate tx number across all withdrawals
  const duplicate = await prisma.pendingWithdrawal.findUnique({ where: { tx_number: txNumber } });
  if (duplicate && duplicate.id !== id) {
    res.status(409).json({ error: 'DUPLICATE_TX', message: 'This transaction number has already been used' });
    return;
  }

  try {
    await prisma.pendingWithdrawal.update({
      where: { id },
      data: { status: 'approved', tx_number: txNumber },
    });

    // Notify player via Telegram (non-blocking)
    import('../../bot/notifications.js').then(({ notifyWithdrawalApproved }) => {
      void notifyWithdrawalApproved(withdrawal.player.id, Number(withdrawal.amount), withdrawal.phone);
    }).catch(() => {});

    res.json({ success: true, tx_number: txNumber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Approval failed';
    res.status(422).json({ error: 'APPROVAL_FAILED', message: msg });
  }
});

// POST /api/admin/withdrawals/:id/reject — reject and refund
router.post('/withdrawals/:id/reject', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  const withdrawal = await prisma.pendingWithdrawal.findUnique({
    where: { id },
    include: { player: { select: { id: true } } },
  });

  if (!withdrawal || withdrawal.status !== 'pending') {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Pending withdrawal not found' });
    return;
  }

  // Mark rejected
  await prisma.pendingWithdrawal.update({
    where: { id },
    data: { status: 'rejected' },
  });

  // Refund: the funds were already debited when the bot request was created
  await WalletService.credit(
    withdrawal.player.id,
    WalletType.main,
    Number(withdrawal.amount),
    TxType.refund,
    id,
    'Withdrawal rejected by admin — funds returned',
  );

  // Notify player via Telegram (non-blocking)
  import('../../bot/notifications.js').then(({ notifyWithdrawalRejected }) => {
    void notifyWithdrawalRejected(withdrawal.player.id, Number(withdrawal.amount));
  }).catch(() => {});

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
