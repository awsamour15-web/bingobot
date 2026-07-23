// Wallet endpoints — transaction history, deposit, withdraw
// Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 8.3

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import rateLimit from 'express-rate-limit';
import { TxType, WalletType } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import { getPaymentGateway } from '../services/payment.service.js';
import { WalletService } from '../services/wallet.service.js';
import type { TransactionListItem, PaginatedResponse } from '@beteseb/shared';

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

  const items: TransactionListItem[] = transactions.map((tx) => ({
    id: tx.id,
    type: tx.type,
    amount: Number(tx.amount),
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
      WalletType.main,
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

  // Fetch the player's main wallet
  const wallet = await prisma.wallet.findUnique({
    where: { player_id_type: { player_id: playerId, type: WalletType.main } },
  });

  if (!wallet) {
    res.status(404).json({ error: 'WALLET_NOT_FOUND', message: 'Main wallet not found' });
    return;
  }

  // Block play wallet withdrawals (guard at request level — main wallet is always fetched above,
  // but enforce WalletType invariant if somehow a play wallet is targeted)
  if (wallet.type === WalletType.play) {
    res.status(422).json({
      error: 'PLAY_WALLET_NOT_WITHDRAWABLE',
      message: 'Play wallet credits cannot be withdrawn as real money',
    });
    return;
  }

  const balance = Number(wallet.balance);

  if (amount > balance) {
    res.status(422).json({
      error: 'INSUFFICIENT_BALANCE',
      message: `Requested amount ${amount} exceeds available balance ${balance}`,
    });
    return;
  }

  // Create a pending withdrawal transaction (do NOT debit yet — debit on admin approval)
  await prisma.transaction.create({
    data: {
      wallet_id: wallet.id,
      type: TxType.withdrawal,
      amount,
      note: `PENDING: Awaiting admin approval${phone ? ` — phone: ${phone}` : ''}`,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Withdrawal request submitted for approval',
  });
});

export default router;
