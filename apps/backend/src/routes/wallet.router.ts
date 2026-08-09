// Wallet endpoints — transaction history, deposit, withdraw
// Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 8.3

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import rateLimit from 'express-rate-limit';
import { TxType, WalletType } from '@fidel/shared';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import { getPaymentGateway } from '../services/payment.service.js';
import { WalletService, InsufficientFundsError } from '../services/wallet.service.js';
import type { TransactionListItem, PaginatedResponse } from '@fidel/shared';

const router: RouterType = Router();

router.use(jwtAuthMiddleware);

// ─── Rate limiter — 3 req/min per player for deposit ─────────────────────────

const depositRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  keyGenerator: (req: Request) => req.player?.playerId ?? req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many deposit requests. Please try again in a minute.',
    });
  },
});

// ─── GET /api/wallet/transactions ────────────────────────────────────────────

router.get('/transactions', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;
  const query = req.query as Record<string, string | undefined>;

  const page = Math.max(1, parseInt(query['page'] ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query['pageSize'] ?? '20', 10) || 20));
  const skip = (page - 1) * pageSize;

  // Fetch both wallets for the player
  const wallets = await prisma.wallet.findMany({
    where: { player_id: playerId },
    select: { id: true, type: true },
  });

  const walletIds = wallets.map((w) => w.id);
  const walletTypeMap = new Map(wallets.map((w) => [w.id, w.type]));

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { wallet_id: { in: walletIds } },
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.transaction.count({ where: { wallet_id: { in: walletIds } } }),
  ]);

  const items: TransactionListItem[] = transactions
    .filter((tx) => walletTypeMap.has(tx.wallet_id))
    .map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount ?? 0),
      walletType: walletTypeMap.get(tx.wallet_id)!,
      note: tx.note ?? undefined,
      reference_id: tx.reference_id ?? undefined,
      created_at: tx.created_at.toISOString(),
    }));

  const response: PaginatedResponse<TransactionListItem> = {
    items,
    total,
    page,
    pageSize,
  };

  res.status(200).json(response);
});

// ─── POST /api/wallet/deposit ─────────────────────────────────────────────────

router.post(
  '/deposit',
  depositRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.player!.playerId;
    const { amount } = req.body as { amount?: number };

    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: 'amount must be a positive number',
      });
      return;
    }

    try {
      const gateway = getPaymentGateway();
      const { checkoutUrl } = await gateway.initiateDeposit(playerId, amount);
      res.status(200).json({ checkoutUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment gateway error';
      res.status(502).json({ error: 'PAYMENT_GATEWAY_ERROR', message });
    }
  },
);

// ─── POST /api/wallet/deposit/webhook ────────────────────────────────────────
// Placeholder webhook — called by the payment gateway after a successful deposit.
// Protected by PAYMENT_WEBHOOK_SECRET header check.

router.post('/deposit/webhook', async (req: Request, res: Response): Promise<void> => {
  const webhookSecret = process.env['PAYMENT_WEBHOOK_SECRET'];
  const providedSecret = req.headers['x-webhook-secret'] as string | undefined;

  if (webhookSecret && providedSecret !== webhookSecret) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid webhook secret' });
    return;
  }

  // Expected body shape: { playerId, amount, txRef }
  const { playerId, amount, txRef } = req.body as {
    playerId?: string;
    amount?: number;
    txRef?: string;
  };

  if (!playerId || typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'playerId and positive amount are required' });
    return;
  }

  try {
    await WalletService.credit(
      playerId,
      WalletType.play,
      amount,
      TxType.deposit,
      txRef ?? undefined,
      'Deposit via payment gateway',
    );
    res.status(200).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Credit failed';
    res.status(500).json({ error: 'CREDIT_FAILED', message });
  }
});

// ─── POST /api/wallet/withdraw ────────────────────────────────────────────────

router.post('/withdraw', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;
  const { amount, phone } = req.body as { amount?: number; phone?: string };

  if (typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({
      error: 'INVALID_AMOUNT',
      message: 'amount must be a positive number',
    });
    return;
  }

  if (amount < 100) {
    res.status(422).json({
      error: 'BELOW_MINIMUM',
      message: 'Minimum withdrawal amount is ETB 100',
    });
    return;
  }

  if (!phone || typeof phone !== 'string' || phone.trim() === '') {
    res.status(400).json({
      error: 'PHONE_REQUIRED',
      message: 'Phone number is required for withdrawal',
    });
    return;
  }

  try {
    // Debit atomically at request time — prevents double-spend across concurrent requests
    await WalletService.debit(
      playerId,
      WalletType.main,
      amount,
      TxType.withdrawal,
      undefined,
      `PENDING: Awaiting admin approval — phone: ${phone.trim()}`,
    );

    res.status(200).json({
      success: true,
      message: 'Withdrawal request submitted for approval',
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'InsufficientFundsError') {
      res.status(422).json({ error: 'INSUFFICIENT_BALANCE', message: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Withdrawal request failed';
    res.status(500).json({ error: 'WITHDRAW_FAILED', message });
  }
});

export default router;
