// Cashier self-service routes — deposit & withdrawal management

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';
import { cashierAuthMiddleware } from '../../middleware/cashier-auth.middleware.js';
import { WalletService } from '../../services/wallet.service.js';
import { TxType, WalletType } from '@fidel/shared';

const router: RouterType = Router();

router.use(cashierAuthMiddleware);

// ─── GET /api/cashier/me ──────────────────────────────────────────────────────
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  const cashier = await prisma.cashier.findUnique({
    where: { id: req.cashier!.cashierId },
    select: { id: true, username: true, display_name: true, is_active: true },
  });
  if (!cashier) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Cashier not found' });
    return;
  }
  res.json(cashier);
});

// ─── GET /api/cashier/deposits ────────────────────────────────────────────────
// Returns pending deposits for the cashier to action
router.get('/deposits', async (_req: Request, res: Response): Promise<void> => {
  const deposits = await prisma.pendingDeposit.findMany({
    where: { status: 'pending' },
    orderBy: { created_at: 'asc' },
    include: { player: { select: { username: true } } },
  });

  res.json({
    deposits: deposits.map((d) => ({
      id: d.id,
      tx_number: d.tx_number,
      amount: Number(d.amount),
      status: d.status,
      player_username: d.player?.username ?? null,
      created_at: d.created_at.toISOString(),
    })),
  });
});

// ─── POST /api/cashier/deposits/:id/approve ───────────────────────────────────
router.post('/deposits/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const deposit = await prisma.pendingDeposit.findUnique({ where: { id } });

  if (!deposit) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Deposit not found' });
    return;
  }
  if (deposit.status !== 'pending') {
    res.status(422).json({ error: 'CANNOT_APPROVE', message: `Deposit is already ${deposit.status}` });
    return;
  }
  if (!deposit.player_id) {
    res.status(422).json({ error: 'NO_PLAYER', message: 'No player linked to this deposit yet' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.pendingDeposit.update({
      where: { id },
      data: { status: 'claimed', claimed_at: new Date() },
    });
    // Credit the player's play wallet
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { player_id_type: { player_id: deposit.player_id!, type: 'play' } },
    });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: deposit.amount } },
    });
    await tx.transaction.create({
      data: {
        wallet_id: wallet.id,
        type: TxType.deposit,
        amount: deposit.amount,
        reference_id: deposit.id,
        note: `Approved by cashier`,
      },
    });
  });

  res.json({ success: true, message: 'Deposit approved and player credited' });
});

// ─── POST /api/cashier/deposits/:id/reject ────────────────────────────────────
router.post('/deposits/:id/reject', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const deposit = await prisma.pendingDeposit.findUnique({ where: { id } });
  if (!deposit) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Deposit not found' });
    return;
  }
  if (deposit.status !== 'pending') {
    res.status(422).json({ error: 'CANNOT_REJECT', message: `Deposit is already ${deposit.status}` });
    return;
  }

  await prisma.pendingDeposit.update({
    where: { id },
    data: { status: 'cancelled' },
  });

  res.json({ success: true, message: 'Deposit rejected' });
});

// ─── GET /api/cashier/withdrawals ─────────────────────────────────────────────
router.get('/withdrawals', async (_req: Request, res: Response): Promise<void> => {
  const withdrawals = await prisma.pendingWithdrawal.findMany({
    where: { status: 'pending' },
    orderBy: { created_at: 'asc' },
    include: { player: { select: { username: true } } },
  });

  res.json({
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      amount: Number(w.amount),
      phone: w.phone,
      status: w.status,
      player_username: w.player?.username ?? null,
      created_at: w.created_at.toISOString(),
    })),
  });
});

// ─── POST /api/cashier/withdrawals/:id/approve ────────────────────────────────
router.post('/withdrawals/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { txNumber } = req.body as { txNumber?: string };

  if (!txNumber?.trim()) {
    res.status(400).json({ error: 'TX_NUMBER_REQUIRED', message: 'Transaction number is required' });
    return;
  }

  const withdrawal = await prisma.pendingWithdrawal.findUnique({ where: { id } });
  if (!withdrawal) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Withdrawal not found' });
    return;
  }
  if (withdrawal.status !== 'pending') {
    res.status(422).json({ error: 'CANNOT_APPROVE', message: `Withdrawal is already ${withdrawal.status}` });
    return;
  }

  await prisma.pendingWithdrawal.update({
    where: { id },
    data: { status: 'approved', tx_number: txNumber.trim() },
  });

  res.json({ success: true, message: 'Withdrawal approved' });
});

// ─── POST /api/cashier/withdrawals/:id/reject ─────────────────────────────────
router.post('/withdrawals/:id/reject', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const withdrawal = await prisma.pendingWithdrawal.findUnique({ where: { id } });
  if (!withdrawal) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Withdrawal not found' });
    return;
  }
  if (withdrawal.status !== 'pending') {
    res.status(422).json({ error: 'CANNOT_REJECT', message: `Withdrawal is already ${withdrawal.status}` });
    return;
  }

  // Refund the player
  await prisma.$transaction(async (tx) => {
    await tx.pendingWithdrawal.update({
      where: { id },
      data: { status: 'rejected' },
    });
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { player_id_type: { player_id: withdrawal.player_id, type: 'main' } },
    });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: withdrawal.amount } },
    });
    await tx.transaction.create({
      data: {
        wallet_id: wallet.id,
        type: TxType.refund,
        amount: withdrawal.amount,
        reference_id: withdrawal.id,
        note: 'Withdrawal rejected by cashier — refunded',
      },
    });
  });

  res.json({ success: true, message: 'Withdrawal rejected and funds refunded' });
});

export default router;
