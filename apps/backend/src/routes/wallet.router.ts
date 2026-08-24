// Wallet endpoints — transaction history, deposit, withdraw
// Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 8.3

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import rateLimit from 'express-rate-limit';
import { TxType, WalletType } from '@fidel/shared';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import { getPaymentGateway } from '../services/payment.service.js';
import { WalletService, InsufficientFundsError } from '../services/wallet.service.js';
import { processDepositClaim, validateDepositReceipt } from '../bot/index.js';
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

router.get('/deposit/accounts', async (_req: Request, res: Response): Promise<void> => {
  const accounts = await prisma.depositAccount.findMany({
    where: { is_active: true },
    orderBy: { created_at: 'desc' },
  });

  if (accounts.length > 0) {
    res.json({
      accounts: accounts.map((a) => ({ phone: a.phone, name: a.name })),
    });
    return;
  }

  const [phoneConfig, nameConfig] = await Promise.all([
    prisma.config.findUnique({ where: { key: 'deposit_telebirr_number' } }),
    prisma.config.findUnique({ where: { key: 'deposit_receiver_name' } }),
  ]);

  res.json({
    accounts: phoneConfig ? [{ phone: phoneConfig.value, name: nameConfig?.value ?? 'Telebirr' }] : [],
  });
});

router.post('/deposit/manual', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;
  const { amount, receipt } = req.body as { amount?: number; receipt?: string };

  if (typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ error: 'INVALID_AMOUNT', message: 'amount must be a positive number' });
    return;
  }

  if (amount < 50) {
    res.status(422).json({ error: 'BELOW_MINIMUM', message: 'Minimum deposit amount is ETB 50' });
    return;
  }

  if (typeof receipt !== 'string' || receipt.trim() === '') {
    res.status(400).json({ error: 'RECEIPT_REQUIRED', message: 'receipt message is required' });
    return;
  }

  const accounts = await prisma.depositAccount.findMany({
    where: { is_active: true },
    orderBy: { created_at: 'desc' },
  });

  const selectedAccount = accounts.length > 0
    ? accounts[Math.floor(Math.random() * accounts.length)]
    : null;

  const validation = validateDepositReceipt({
    receipt,
    expectedAmount: amount,
    accountPhone: selectedAccount?.phone ?? null,
    accountName: selectedAccount?.name ?? null,
  });

  if (!validation.ok) {
    const messageMap = {
      NO_RECEIPT: 'We could not read a valid Telebirr transaction from your message. Please paste the full SMS receipt.',
      PHONE_MISMATCH: 'The receipt does not match the configured Telebirr account. Please paste the correct transfer SMS.',
      NAME_MISMATCH: 'The receiver name does not match the configured account. Please paste the correct transfer SMS.',
      AMOUNT_MISMATCH: `The receipt amount does not match your entered amount (${amount} ETB).`,
    } as const;

    res.status(422).json({
      error: validation.reason,
      message: messageMap[validation.reason],
    });
    return;
  }

  let result = await processDepositClaim(playerId, validation.txNumber);

  if (!result.success && result.reason === 'NOT_FOUND') {
    try {
      await prisma.pendingDeposit.create({
        data: {
          tx_number: validation.txNumber,
          amount,
          status: 'pending',
        },
      });
    } catch {
      // Ignore duplicate tx_number race conditions and retry claim.
    }

    result = await processDepositClaim(playerId, validation.txNumber);
  }

  if (!result.success) {
    const messageMap = {
      NOT_FOUND: 'This transaction was not found. Please contact support.',
      CLAIMED: 'This transaction has already been claimed. Please contact support.',
      CANCELLED: 'This transaction was cancelled. Please contact support.',
    } as const;

    res.status(409).json({
      error: result.reason,
      message: messageMap[result.reason],
    });
    return;
  }

  const bonusMsg = result.bonusAmount ? ` +${result.bonusAmount} ETB deposit bonus added!` : '';
  res.status(200).json({
    success: true,
    amount: result.amount,
    bonusAmount: result.bonusAmount ?? 0,
    txNumber: validation.txNumber,
    message: `✅ Your deposit of ${result.amount} ETB is approved.${bonusMsg}`,
  });
});

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

  // ── Deposit requirement checks ───────────────────────────────────────────
  const playerWallets = await prisma.wallet.findMany({
    where: { player_id: playerId },
    select: { id: true },
  });
  const playerWalletIds = playerWallets.map((w) => w.id);

  // Sum of all real deposits the player has ever made
  const depositAgg = await prisma.transaction.aggregate({
    where: {
      wallet_id: { in: playerWalletIds },
      type: TxType.deposit,
    },
    _sum: { amount: true },
  });
  const totalDeposited = Number(depositAgg._sum.amount ?? 0);

  if (totalDeposited < 200) {
    res.status(403).json({
      error: 'DEPOSIT_REQUIRED',
      message: `You must deposit at least ETB 200 in total before requesting a withdrawal. You have deposited ETB ${totalDeposited.toFixed(0)} so far.`,
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
