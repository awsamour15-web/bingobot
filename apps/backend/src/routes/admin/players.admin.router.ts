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
  const mockFilter = req.query['mock'] as string | undefined;

  const mockWhere = mockFilter === 'true' ? { is_mock: true } : mockFilter === 'false' ? { is_mock: false } : {};

  const where = search
    ? {
        ...mockWhere,
        OR: [
          { username: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search } },
        ],
      }
    : { ...mockWhere };

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
    is_mock: p.is_mock,
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
  const typeFilter = req.query['type'] as string | undefined;

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

  // Map filter to transaction types
  let typeCondition: object | undefined;
  if (typeFilter === 'deposit') {
    typeCondition = { type: 'deposit' };
  } else if (typeFilter === 'withdrawal') {
    typeCondition = { type: 'withdrawal' };
  } else if (typeFilter === 'game') {
    typeCondition = { type: { in: ['game_entry', 'game_win'] } };
  }

  const where = { wallet_id: { in: walletIds }, ...typeCondition };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
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

// DELETE /api/admin/players/:id/transactions/:txId — delete a transaction and reverse its balance effect
router.delete('/:id/transactions/:txId', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.params['id'] as string;
  const txId = req.params['txId'] as string;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch the transaction with wallet info
      const transaction = await tx.transaction.findUnique({
        where: { id: txId },
        include: { wallet: true },
      });

      if (!transaction) {
        throw Object.assign(new Error('Transaction not found'), { code: 'NOT_FOUND' });
      }

      // Ensure the transaction belongs to this player
      if (transaction.wallet.player_id !== playerId) {
        throw Object.assign(new Error('Transaction does not belong to this player'), { code: 'FORBIDDEN' });
      }

      const amount = Number(transaction.amount);
      const walletType = transaction.wallet.type as WalletType;
      const refId = transaction.reference_id;

      // 2. Determine reversal: credit types need a debit back, debit types need a credit back
      const creditTypes: TxType[] = [TxType.game_win, TxType.admin_credit, TxType.deposit, TxType.bonus, TxType.refund, TxType.referral_commission, TxType.ext_game_win];
      const debitTypes: TxType[] = [TxType.game_entry, TxType.admin_debit, TxType.withdrawal, TxType.ext_game_bet];
      const txType = transaction.type as TxType;

      if (creditTypes.includes(txType)) {
        // Was a credit — debit the amount back (check balance first)
        const wallet = await tx.wallet.findUnique({ where: { id: transaction.wallet_id } });
        if (!wallet) throw new Error('Wallet not found');
        const currentBalance = Number(wallet.balance);
        if (currentBalance < amount) {
          throw Object.assign(
            new Error(`Cannot reverse: player only has ${currentBalance.toFixed(2)} ETB but transaction was for ${amount.toFixed(2)} ETB`),
            { code: 'INSUFFICIENT_BALANCE' },
          );
        }
        await tx.wallet.update({
          where: { id: transaction.wallet_id },
          data: { balance: { decrement: amount } },
        });
      } else if (debitTypes.includes(txType)) {
        // Was a debit — credit the amount back
        await tx.wallet.update({
          where: { id: transaction.wallet_id },
          data: { balance: { increment: amount } },
        });
      }
      // For rollback types or unknown types, just delete without balance change

      // 3. If it's a bingo game_entry, also clean up the RoundEntry
      if (txType === TxType.game_entry && refId) {
        await tx.roundEntry.deleteMany({
          where: { round_id: refId, player_id: playerId },
        });
      }

      // 4. If it's a bingo game_win, also clean up the RoundWinner
      if (txType === TxType.game_win && refId) {
        await tx.roundWinner.deleteMany({
          where: { round_id: refId, player_id: playerId },
        });
        // Also clear winner_player_id on the round if it matches
        await tx.gameRound.updateMany({
          where: { id: refId, winner_player_id: playerId },
          data: { winner_player_id: null, winner_cartela_number: null },
        });
      }

      // 5. Delete the transaction record
      await tx.transaction.delete({ where: { id: txId } });

      return {
        deleted_tx_id: txId,
        type: txType,
        amount,
        wallet_type: walletType,
        reversal: creditTypes.includes(txType) ? 'debited' : debitTypes.includes(txType) ? 'credited' : 'none',
      };
    });

    res.json({ success: true, ...result });
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') {
      res.status(404).json({ error: 'NOT_FOUND', message: e.message });
    } else if (e.code === 'FORBIDDEN') {
      res.status(403).json({ error: 'FORBIDDEN', message: e.message });
    } else if (e.code === 'INSUFFICIENT_BALANCE') {
      res.status(422).json({ error: 'INSUFFICIENT_BALANCE', message: e.message });
    } else {
      console.error('[Admin] Delete transaction error:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message ?? 'Failed to delete transaction' });
    }
  }
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

  // Cap manual adjustments to prevent runaway credits from a compromised admin account
  const MAX_ADMIN_ADJUSTMENT = 100_000; // 100,000 ETB
  if (Math.abs(amount) > MAX_ADMIN_ADJUSTMENT) {
    res.status(400).json({ error: 'BAD_REQUEST', message: `Adjustment amount cannot exceed ${MAX_ADMIN_ADJUSTMENT} ETB` });
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
