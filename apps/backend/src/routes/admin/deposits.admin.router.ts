// Admin deposit management endpoints
// Requirements: 1.1, 1.2, 1.3, 1.4, 5.1, 5.2, 5.3

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';
import { processDepositClaim, logDepositAttempt } from '../../bot/index.js';

const router: RouterType = Router();

// ─── GET /api/admin/deposits ─────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const deposits = await prisma.pendingDeposit.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      player: { select: { username: true } },
    },
  });

  const items = deposits.map((d) => ({
    id: d.id,
    tx_number: d.tx_number,
    amount: Number(d.amount),
    status: d.status,
    player_username: d.player?.username ?? null,
    claimed_at: d.claimed_at?.toISOString() ?? null,
    created_at: d.created_at.toISOString(),
  }));

  const summary = {
    pending: items.filter((d) => d.status === 'pending').length,
    claimed: items.filter((d) => d.status === 'claimed').length,
    cancelled: items.filter((d) => d.status === 'cancelled').length,
  };

  res.json({ summary, items });
});

// ─── POST /api/admin/deposits ─────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { tx_number, amount } = req.body as { tx_number?: string; amount?: number };

  if (!tx_number || typeof tx_number !== 'string' || tx_number.trim() === '') {
    res.status(400).json({ error: 'INVALID_TX_NUMBER', message: 'tx_number is required' });
    return;
  }

  if (typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ error: 'INVALID_AMOUNT', message: 'amount must be a positive number' });
    return;
  }

  try {
    const deposit = await prisma.pendingDeposit.create({
      data: {
        tx_number: tx_number.trim(),
        amount,
        status: 'pending',
      },
    });

    res.status(201).json({
      id: deposit.id,
      tx_number: deposit.tx_number,
      amount: Number(deposit.amount),
      status: deposit.status,
      created_at: deposit.created_at.toISOString(),
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2002') {
      res.status(409).json({ error: 'DUPLICATE_TX_NUMBER', message: 'This transaction number already exists' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to create deposit';
    res.status(500).json({ error: 'CREATE_FAILED', message: msg });
  }
});

// ─── POST /api/admin/deposits/:id/approve ────────────────────────────────────

router.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  const deposit = await prisma.pendingDeposit.findUnique({ where: { id } });

  if (!deposit) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Deposit record not found' });
    return;
  }

  if (deposit.status !== 'pending') {
    res.status(422).json({ error: 'CANNOT_APPROVE', message: `Cannot approve a deposit with status '${deposit.status}'` });
    return;
  }

  if (!deposit.player_id) {
    res.status(422).json({ error: 'NO_PLAYER', message: 'No player linked to this deposit. Player must submit their receipt first.' });
    return;
  }

  const result = await processDepositClaim(deposit.player_id, deposit.tx_number, { source: 'admin' });

  if (!result.success) {
    const messageMap = {
      NOT_FOUND: 'Deposit record not found during claim.',
      CLAIMED: 'This deposit has already been claimed.',
      CANCELLED: 'This deposit has been cancelled.',
    } as const;
    // logDepositAttempt already called inside processDepositClaim
    res.status(409).json({ error: result.reason, message: messageMap[result.reason] });
    return;
  }

  res.json({ success: true, amount: result.amount });
});

// ─── POST /api/admin/deposits/:id/cancel ─────────────────────────────────────

router.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  const deposit = await prisma.pendingDeposit.findUnique({ where: { id } });

  if (!deposit) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Deposit record not found' });
    return;
  }

  if (deposit.status !== 'pending') {
    res.status(422).json({ error: 'CANNOT_CANCEL', message: `Cannot cancel a deposit with status '${deposit.status}'` });
    return;
  }

  await prisma.pendingDeposit.update({
    where: { id },
    data: { status: 'cancelled' },
  });

  res.json({ success: true });
});

// ─── GET /api/admin/deposits/:id/attempts ────────────────────────────────────

router.get('/:id/attempts', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;

  const attempts = await prisma.depositAttempt.findMany({
    where: { deposit_id: id },
    orderBy: { created_at: 'desc' },
    include: { player: { select: { username: true } } },
  });

  res.json(attempts.map((a) => ({
    id:               a.id,
    player_username:  a.player?.username ?? null,
    tx_number_parsed: a.tx_number_parsed,
    outcome:          a.outcome,
    failure_reason:   a.failure_reason,
    amount_expected:  a.amount_expected !== null ? Number(a.amount_expected) : null,
    amount_parsed:    a.amount_parsed   !== null ? Number(a.amount_parsed)   : null,
    raw_sms:          a.raw_sms,
    source:           a.source,
    created_at:       a.created_at.toISOString(),
  })));
});

export default router;
