// Admin financial management endpoints
// Requirements: 14.2, 14.3, 14.4, 14.5

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { TxType, WalletType } from '@fidel/shared';
import prisma from '../../lib/prisma.js';
import { WalletService } from '../../services/wallet.service.js';
import { bot } from '../../bot/index.js';

/** Broadcast withdrawal proof to all active channel targets (non-blocking) */
async function broadcastWithdrawalProof(username: string, amount: number, phone: string, txNumber: string): Promise<void> {
  try {
    if (!bot) return;
    const targets = await prisma.broadcastTarget.findMany({ where: { is_active: true, type: 'channel' } });
    if (targets.length === 0) return;

    const maskedPhone = phone.slice(0, 4) + '****' + phone.slice(-2);
    const message =
      `✅ *ክፍያ ተፈጸመ!*\n\n` +
      `👤 ተጠቃሚ: @${username}\n` +
      `💵 መጠን: ${amount} ብር\n` +
      `📱 ስልክ: ${maskedPhone}\n` +
      `🔖 Tx: \`${txNumber}\``;

    await Promise.allSettled(
      targets
        .filter((t) => t.channel_id)
        .map((t) => bot!.api.sendMessage(t.channel_id!, message, { parse_mode: 'Markdown' })),
    );
  } catch (err) {
    console.error('[Finance] Failed to broadcast withdrawal proof:', err);
  }
}

const router: RouterType = Router();

// GET /api/admin/withdrawals — list pending withdrawal requests
router.get('/withdrawals', async (_req: Request, res: Response): Promise<void> => {
  try {
    console.log('[Admin API] Fetching pending withdrawals...');
    
    const withdrawals = await prisma.pendingWithdrawal.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'desc' },
      include: {
        player: { select: { id: true, username: true, phone: true } },
      },
    });

    console.log(`[Admin API] Found ${withdrawals.length} pending withdrawals`);

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
  } catch (err) {
    console.error('[Admin API] Error fetching withdrawals:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch withdrawals' });
  }
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
    include: { player: { select: { id: true, username: true } } },
  });

  if (!withdrawal || withdrawal.status !== 'pending') {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Pending withdrawal not found' });
    return;
  }

  // Prevent duplicate tx number across all withdrawals
  const duplicate = await prisma.pendingWithdrawal.findFirst({ where: { tx_number: txNumber } });
  if (duplicate && duplicate.id !== id) {
    res.status(409).json({ error: 'DUPLICATE_TX', message: 'This transaction number has already been used' });
    return;
  }

  try {
    await prisma.pendingWithdrawal.update({
      where: { id },
      data: { status: 'approved', tx_number: txNumber },
    });

    // Notify player via Telegram DM (non-blocking)
    import('../../bot/notifications.js').then(({ notifyWithdrawalApproved }) => {
      void notifyWithdrawalApproved(withdrawal.player.id, Number(withdrawal.amount), withdrawal.phone);
    }).catch(() => {});

    // Broadcast withdrawal proof to all active group/channel targets (non-blocking)
    void broadcastWithdrawalProof(withdrawal.player.username, Number(withdrawal.amount), withdrawal.phone, txNumber);

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

// GET /api/admin/finance-summary — deposits/withdrawals/profit broken by day/week/month
router.get('/finance-summary', async (_req: Request, res: Response): Promise<void> => {
  const now = new Date();

  function startOf(unit: 'day' | 'week' | 'month'): Date {
    const d = new Date(now);
    if (unit === 'day') {
      d.setHours(0, 0, 0, 0);
    } else if (unit === 'week') {
      const day = d.getDay(); // 0=Sun
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
    } else {
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
    }
    return d;
  }

  async function depositTotal(since: Date): Promise<number> {
    const result = await prisma.pendingDeposit.aggregate({
      where: { status: 'claimed', claimed_at: { gte: since } },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  }

  async function withdrawalTotal(since: Date): Promise<number> {
    const result = await prisma.pendingWithdrawal.aggregate({
      where: { status: 'approved', created_at: { gte: since } },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  }

  const [
    depositDay, depositWeek, depositMonth, depositAll,
    withdrawDay, withdrawWeek, withdrawMonth, withdrawAll,
  ] = await Promise.all([
    depositTotal(startOf('day')),
    depositTotal(startOf('week')),
    depositTotal(startOf('month')),
    depositTotal(new Date(0)),
    withdrawalTotal(startOf('day')),
    withdrawalTotal(startOf('week')),
    withdrawalTotal(startOf('month')),
    withdrawalTotal(new Date(0)),
  ]);

  res.json({
    deposits:    { day: depositDay,  week: depositWeek,  month: depositMonth,  total: depositAll  },
    withdrawals: { day: withdrawDay, week: withdrawWeek, month: withdrawMonth, total: withdrawAll },
    profit: {
      day:   depositDay   - withdrawDay,
      week:  depositWeek  - withdrawWeek,
      month: depositMonth - withdrawMonth,
      total: depositAll   - withdrawAll,
    },
  });
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
