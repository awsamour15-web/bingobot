// AS Tech API — Seamless Wallet Callback Handler
// POST /api/astech/callback
//
// AS Tech POSTs here for every wallet event (signed with HMAC-SHA256).
// Commands: getBalance | writeBet | rollback
//
// Critical rules (from AS Tech docs):
//  - Verify X-Signature on every request before touching the DB
//  - Respond within 3 seconds with HTTP 200 + the JSON envelope
//  - writeBet is ONE call per finished round (bet + win combined)
//  - Idempotent on transaction_id — return stored balance on duplicate
//  - rollback for an unknown tx_id → succeed and return current balance
//  - Always return balance as a decimal string, no thousands separators

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { WalletService } from '../services/wallet.service.js';
import { TxType, WalletType } from '@fidel/shared';
import { verifySignature } from '../services/astech.service.js';

const router: RouterType = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallbackPayload {
  cmd:            string;
  // AS Tech sends every field in both snake_case and camelCase
  user_login?:    string;
  login?:         string;
  currency?:      string;
  game_id?:       string;
  gameId?:        string;
  session_id?:    string;
  sessionid?:     string;
  bet?:           number;
  win?:           number;
  amount?:        number;   // win - bet (pre-computed by AS Tech)
  transaction_id?: string;
  transactionId?:  string;
  round_id?:      string;
  roundId?:       string;
  round_finished?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(res: Response, cash: number): void {
  res.status(200).json({
    status:  'success',
    error:   '',
    content: { cash: cash.toFixed(2) },
  });
}

function fail(res: Response, error: string, cash?: number): void {
  res.status(200).json({
    status:  'fail',
    error,
    content: cash !== undefined ? { cash: cash.toFixed(2) } : null,
  });
}

/** Read the player's main-wallet balance as a plain number. */
async function getBalance(playerId: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({
    where: { player_id_type: { player_id: playerId, type: WalletType.main } },
  });
  return wallet ? parseFloat(wallet.balance.toString()) : 0;
}

/** Find player by their AS Tech login (= our internal player UUID). */
async function findPlayer(login: string) {
  return prisma.player.findUnique({
    where:  { id: login },
    select: { id: true, username: true, is_suspended: true },
  });
}

// ─── Signature middleware ─────────────────────────────────────────────────────
// The router is mounted with express.raw() so req.body is a Buffer.
// We must NOT use express.json() for this route — we need the raw bytes for HMAC.

function requireSignature(req: Request, res: Response, next: () => void): void {
  const rawBody: string = (req.body as Buffer).toString('utf8');
  const signature = (req.headers['x-signature'] as string | undefined) ?? '';

  if (!verifySignature(rawBody, signature)) {
    console.warn('[ASTech Callback] Invalid signature from', req.ip);
    fail(res, 'Invalid signature');
    return;
  }

  // Attach the parsed body for handlers
  (req as Request & { rawBody: string }).rawBody = rawBody;
  next();
}

// ─── Main callback endpoint ───────────────────────────────────────────────────

router.post(
  '/',
  // Must be mounted with express.raw() in index.ts — see registration note
  requireSignature,
  async (req: Request, res: Response): Promise<void> => {
    const raw = (req as Request & { rawBody: string }).rawBody;
    let p: CallbackPayload;

    try {
      p = JSON.parse(raw) as CallbackPayload;
    } catch {
      fail(res, 'Invalid JSON');
      return;
    }

    const cmd      = (p.cmd ?? '').trim();
    const login    = (p.user_login ?? p.login ?? '').trim();
    const txId     = (p.transaction_id ?? p.transactionId ?? '').trim();
    const roundId  = (p.round_id ?? p.roundId ?? '').trim();
    const gameId   = (p.game_id ?? p.gameId ?? '').trim();
    const sessionId = (p.session_id ?? p.sessionid ?? '').trim();
    const bet      = Math.max(0, Number(p.bet ?? 0));
    const win      = Math.max(0, Number(p.win ?? 0));

    if (!login) {
      fail(res, 'user_login required');
      return;
    }

    const player = await findPlayer(login);
    if (!player) {
      fail(res, 'Player not found');
      return;
    }

    const balance = await getBalance(player.id);

    // ── getBalance ─────────────────────────────────────────────────────────────
    if (cmd === 'getBalance') {
      console.log(`[ASTech] getBalance player=${login} balance=${balance}`);
      ok(res, balance);
      return;
    }

    // ── writeBet ───────────────────────────────────────────────────────────────
    if (cmd === 'writeBet') {
      if (!txId) {
        fail(res, 'transaction_id required', balance);
        return;
      }

      // Idempotency: same transaction_id received again → return stored balance
      const existing = await prisma.asTechTransaction.findUnique({
        where: { transaction_id: txId },
      });
      if (existing) {
        console.log(`[ASTech] writeBet duplicate txId=${txId}`);
        ok(res, parseFloat(existing.balance_after.toString()));
        return;
      }

      if (bet === 0 && win === 0) {
        fail(res, 'bet or win must be greater than 0', balance);
        return;
      }

      if (bet > 0 && balance < bet) {
        console.warn(`[ASTech] Insufficient funds player=${login} balance=${balance} bet=${bet}`);
        fail(res, 'INSUFFICIENT_FUNDS', balance);
        return;
      }

      try {
        // Apply bet deduction + win credit atomically
        await prisma.$transaction(async (tx) => {
          // Debit bet
          if (bet > 0) {
            const wallet = await tx.wallet.findUniqueOrThrow({
              where: { player_id_type: { player_id: player.id, type: WalletType.main } },
            });
            await tx.wallet.update({
              where: { id: wallet.id },
              data:  { balance: { decrement: bet } },
            });
            await tx.transaction.create({
              data: {
                wallet_id:    wallet.id,
                type:         TxType.ext_game_bet,
                amount:       bet,
                reference_id: txId,
                note:         `ASTech bet round=${roundId}`,
              },
            });
          }

          // Credit win
          if (win > 0) {
            const wallet = await tx.wallet.findUniqueOrThrow({
              where: { player_id_type: { player_id: player.id, type: WalletType.main } },
            });
            await tx.wallet.update({
              where: { id: wallet.id },
              data:  { balance: { increment: win } },
            });
            await tx.transaction.create({
              data: {
                wallet_id:    wallet.id,
                type:         TxType.ext_game_win,
                amount:       win,
                reference_id: txId,
                note:         `ASTech win round=${roundId}`,
              },
            });
          }
        });

        const newBalance = await getBalance(player.id);

        // Record in audit log
        await prisma.asTechTransaction.create({
          data: {
            transaction_id: txId,
            session_id:     sessionId,
            player_id:      player.id,
            player_login:   login,
            cmd:            'writeBet',
            bet:            bet,
            win:            win,
            balance_before: balance,
            balance_after:  newBalance,
            game_id:        gameId || null,
            round_id:       roundId || null,
          },
        });

        console.log(`[ASTech] writeBet ok player=${login} ${balance} -> ${newBalance} (bet=${bet} win=${win})`);
        ok(res, newBalance);
      } catch (err) {
        console.error('[ASTech] writeBet error:', err);
        const currentBalance = await getBalance(player.id);
        fail(res, 'Balance update failed', currentBalance);
      }
      return;
    }

    // ── rollback ───────────────────────────────────────────────────────────────
    if (cmd === 'rollback') {
      if (!txId) {
        fail(res, 'transaction_id required', balance);
        return;
      }

      const rollbackTxId = `${txId}:rollback`;

      // Already rolled back — idempotency
      const alreadyRolledBack = await prisma.asTechTransaction.findUnique({
        where: { transaction_id: rollbackTxId },
      });
      if (alreadyRolledBack) {
        ok(res, parseFloat(alreadyRolledBack.balance_after.toString()));
        return;
      }

      // Find the original transaction
      const original = await prisma.asTechTransaction.findUnique({
        where: { transaction_id: txId },
      });

      // Unknown tx → spec says succeed with current balance
      if (!original) {
        console.log(`[ASTech] rollback unknown txId=${txId}, returning current balance`);
        ok(res, balance);
        return;
      }

      const origBet = parseFloat(original.bet.toString());
      const origWin = parseFloat(original.win.toString());
      // Net to reverse: refund bet, take back win
      const delta = origBet - origWin;

      try {
        await prisma.$transaction(async (tx) => {
          const wallet = await tx.wallet.findUniqueOrThrow({
            where: { player_id_type: { player_id: player.id, type: WalletType.main } },
          });
          await tx.wallet.update({
            where: { id: wallet.id },
            data:  { balance: { increment: delta } },
          });
          await tx.transaction.create({
            data: {
              wallet_id:    wallet.id,
              type:         TxType.ext_game_rollback,
              amount:       Math.abs(delta),
              reference_id: rollbackTxId,
              note:         `ASTech rollback of txId=${txId}`,
            },
          });
        });

        const newBalance = await getBalance(player.id);

        await prisma.asTechTransaction.create({
          data: {
            transaction_id: rollbackTxId,
            session_id:     original.session_id,
            player_id:      player.id,
            player_login:   login,
            cmd:            'rollback',
            bet:            0,
            win:            0,
            balance_before: balance,
            balance_after:  newBalance,
            game_id:        original.game_id,
            round_id:       original.round_id,
          },
        });

        console.log(`[ASTech] rollback ok txId=${txId} player=${login} ${balance} -> ${newBalance}`);
        ok(res, newBalance);
      } catch (err) {
        console.error('[ASTech] rollback error:', err);
        const currentBalance = await getBalance(player.id);
        fail(res, 'Rollback failed', currentBalance);
      }
      return;
    }

    fail(res, `Unknown cmd: ${cmd}`, balance);
  },
);

export default router;
