// Gregmorn Hub seamless wallet callbacks
// These endpoints are called by Gregmorn (not by the player).
//
// POST /api/gregmorn/callback  — single entry point, dispatches by cmd:
//   • getBalance  — return current player balance in game currency
//   • writeBet    — deduct bet / credit win atomically, idempotent on transactionId
//   • rollback    — refund a previously accepted bet

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { WalletService, InsufficientFundsError } from '../services/wallet.service.js';
import { WalletType } from '@fidel/shared';
import {
  verifySignature,
  GREGMORN_SECRET,
  GREGMORN_CURRENCY,
  etbToGameCurrency,
  gameCurrencyToEtb,
} from '../services/gregmorn.service.js';

// TxType values added via migration — cast as any to avoid Prisma enum mismatch
// until prisma migrate deploy is run in production
const EXT_GAME_BET      = 'ext_game_bet'      as unknown as import('@fidel/shared').TxType;
const EXT_GAME_WIN      = 'ext_game_win'      as unknown as import('@fidel/shared').TxType;
const EXT_GAME_ROLLBACK = 'ext_game_rollback' as unknown as import('@fidel/shared').TxType;

const router: RouterType = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function failResponse(res: Response, login: string, error: string, status = 400): void {
  res.status(status).json({
    balance: 0,
    currency: GREGMORN_CURRENCY,
    error,
    login,
    status: 'fail',
  });
}

async function getPlayerByLogin(login: string) {
  return prisma.player.findFirst({
    where: { username: login },
    select: { id: true, username: true, is_suspended: true },
  });
}

/** Returns combined main+play wallet balance in ETB */
async function getEtbBalance(playerId: string): Promise<number> {
  const wallets = await prisma.wallet.findMany({
    where: { player_id: playerId },
    select: { balance: true },
  });
  return wallets.reduce((sum, w) => sum + parseFloat(w.balance.toString()), 0);
}

// ─── Raw body capture (needed for signature verification) ─────────────────────
// Express parses JSON before we reach the handler. We need the raw bytes.
// Solution: attach raw body via express.json verify callback at mount time.
// The index.ts global parser runs first — we re-read from req.body and
// re-stringify to get a canonical body for HMAC verification.
// This works as long as the body is valid JSON (which it always is here).

function getRawBody(req: Request): string {
  // If raw body was captured upstream (see index.ts rawBody middleware)
  const raw = (req as Request & { rawBody?: string }).rawBody;
  if (raw) return raw;
  // Fallback: re-stringify (may differ in whitespace from original)
  return JSON.stringify(req.body);
}

// ─── Signature middleware for callback routes ─────────────────────────────────

function requireCallbackSignature(req: Request, res: Response, next: () => void): void {
  const sig = req.headers['x-signature'];
  if (typeof sig !== 'string' || !sig) {
    failResponse(res, '', 'missing X-Signature', 400);
    return;
  }
  const rawBody = getRawBody(req);
  if (!verifySignature(rawBody, sig, GREGMORN_SECRET)) {
    failResponse(res, '', 'invalid signature', 400);
    return;
  }
  next();
}

// ─── POST /api/gregmorn/callback ─────────────────────────────────────────────

router.post('/callback', requireCallbackSignature, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const cmd = body['cmd'] as string | undefined;

  switch (cmd) {
    case 'getBalance': return handleGetBalance(req, res);
    case 'writeBet':   return handleWriteBet(req, res);
    case 'rollback':   return handleRollback(req, res);
    default:
      failResponse(res, String(body['login'] ?? ''), `unknown cmd: ${cmd}`, 400);
  }
});

// ─── getBalance ───────────────────────────────────────────────────────────────

async function handleGetBalance(req: Request, res: Response): Promise<void> {
  const { login, sessionid } = req.body as { login: string; sessionid: string };

  if (!login || !sessionid) {
    failResponse(res, login ?? '', 'login and sessionid are required');
    return;
  }

  const player = await getPlayerByLogin(login);
  if (!player) {
    failResponse(res, login, 'player not found');
    return;
  }

  if (player.is_suspended) {
    failResponse(res, login, 'player suspended');
    return;
  }

  // Verify session exists
  const session = await prisma.gregmornSession.findUnique({ where: { session_id: sessionid } });
  if (!session) {
    failResponse(res, login, 'session not found');
    return;
  }

  const etbBalance = await getEtbBalance(player.id);
  const gameBalance = await etbToGameCurrency(etbBalance, session.currency);

  res.json({
    balance: gameBalance,
    currency: session.currency,
    error: '',
    login,
    status: 'success',
  });
}

// ─── writeBet ─────────────────────────────────────────────────────────────────

async function handleWriteBet(req: Request, res: Response): Promise<void> {
  const {
    login,
    sessionid,
    transactionId,
    bet: rawBet,
    win: rawWin,
    round_finished,
    info,
    gameId,
    roundId,
  } = req.body as {
    login: string;
    sessionid: string;
    transactionId: string;
    bet: number | string;
    win: number | string;
    round_finished: boolean;
    info: string;
    gameId?: string;
    roundId?: string;
  };

  const bet = parseFloat(String(rawBet ?? 0));
  const win = parseFloat(String(rawWin ?? 0));

  if (!login || !sessionid || !transactionId) {
    failResponse(res, login ?? '', 'login, sessionid, transactionId are required');
    return;
  }

  // ── Idempotency check ──────────────────────────────────────────────────────
  const existing = await prisma.gregmornTransaction.findUnique({
    where: { transaction_id: transactionId },
  });
  if (existing) {
    // Already processed — return the recorded balance
    res.json({
      balance: parseFloat(existing.balance_after.toString()),
      currency: GREGMORN_CURRENCY,
      error: '',
      login,
      status: 'success',
    });
    return;
  }

  // ── Lookup player & session ────────────────────────────────────────────────
  const player = await getPlayerByLogin(login);
  if (!player) { failResponse(res, login, 'player not found'); return; }
  if (player.is_suspended) { failResponse(res, login, 'player suspended'); return; }

  const session = await prisma.gregmornSession.findUnique({ where: { session_id: sessionid } });
  if (!session) { failResponse(res, login, 'session not found'); return; }

  // ── Convert game-currency amounts → ETB ───────────────────────────────────
  const betEtb = bet > 0 ? await gameCurrencyToEtb(bet, session.currency) : 0;
  const winEtb = win > 0 ? await gameCurrencyToEtb(win, session.currency) : 0;

  // ── Apply wallet operations ────────────────────────────────────────────────
  try {
    if (betEtb > 0) {
      await WalletService.debitDual(
        player.id,
        betEtb,
        EXT_GAME_BET,
        transactionId,
        `Gregmorn bet | game:${gameId ?? session.game_id} | round:${roundId ?? ''}`,
      );
    }
    if (winEtb > 0) {
      await WalletService.credit(
        player.id,
        WalletType.main,
        winEtb,
        EXT_GAME_WIN,
        transactionId,
        `Gregmorn win | game:${gameId ?? session.game_id} | round:${roundId ?? ''}`,
      );
    }
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      const etbBal = await getEtbBalance(player.id);
      const gameBal = await etbToGameCurrency(etbBal, session.currency);
      res.status(400).json({
        balance: gameBal,
        currency: session.currency,
        error: 'insufficient funds',
        login,
        status: 'fail',
      });
      return;
    }
    throw err;
  }

  // ── Get updated balance ────────────────────────────────────────────────────
  const etbBalanceAfter = await getEtbBalance(player.id);
  const gameBalanceAfter = await etbToGameCurrency(etbBalanceAfter, session.currency);

  // ── Persist transaction log ────────────────────────────────────────────────
  await prisma.gregmornTransaction.create({
    data: {
      transaction_id: transactionId,
      session_id: sessionid,
      player_login: login,
      cmd: 'writeBet',
      bet: betEtb,
      win: winEtb,
      balance_after: gameBalanceAfter,
      game_id: gameId ?? session.game_id,
      round_id: roundId ?? null,
      info: info ?? null,
    },
  });

  // Close session if round is finished and this is a final write
  if (round_finished && win >= 0 && bet === 0) {
    await prisma.gregmornSession.update({
      where: { session_id: sessionid },
      data: { status: 'closed', closed_at: new Date() },
    }).catch(() => {}); // non-fatal
  }

  res.json({
    balance: gameBalanceAfter,
    currency: session.currency,
    error: '',
    login,
    status: 'success',
  });
}

// ─── rollback ─────────────────────────────────────────────────────────────────

async function handleRollback(req: Request, res: Response): Promise<void> {
  const {
    login,
    sessionid,
    transactionId,
    bet: rawBet,
    info,
    gameId,
  } = req.body as {
    login: string;
    sessionid: string;
    transactionId: string;
    bet: number;
    info: string;
    gameId: string;
  };

  const bet = parseFloat(String(rawBet ?? 0));

  if (!login || !sessionid || !transactionId) {
    failResponse(res, login ?? '', 'login, sessionid, transactionId are required');
    return;
  }

  const player = await getPlayerByLogin(login);
  if (!player) { failResponse(res, login, 'player not found'); return; }

  // Check the original bet transaction exists
  const original = await prisma.gregmornTransaction.findUnique({
    where: { transaction_id: transactionId },
  });

  if (!original) {
    // Original never recorded — idempotent success (bet was never applied)
    const etbBal = await getEtbBalance(player.id);
    const session = await prisma.gregmornSession.findUnique({ where: { session_id: sessionid } });
    const currency = session?.currency ?? GREGMORN_CURRENCY;
    const gameBal = await etbToGameCurrency(etbBal, currency);
    res.json({ balance: gameBal, currency, error: '', login, status: 'success' });
    return;
  }

  // Check rollback wasn't already applied
  const rollbackKey = `rollback_${transactionId}`;
  const alreadyRolledBack = await prisma.gregmornTransaction.findUnique({
    where: { transaction_id: rollbackKey },
  });
  if (alreadyRolledBack) {
    const session = await prisma.gregmornSession.findUnique({ where: { session_id: sessionid } });
    const currency = session?.currency ?? GREGMORN_CURRENCY;
    res.status(400).json({
      balance: parseFloat(alreadyRolledBack.balance_after.toString()),
      currency,
      error: 'transaction already rolled back',
      login,
      status: 'fail',
    });
    return;
  }

  const session = await prisma.gregmornSession.findUnique({ where: { session_id: sessionid } });
  const currency = session?.currency ?? GREGMORN_CURRENCY;

  // Refund the bet amount in ETB
  const betEtb = await gameCurrencyToEtb(bet, currency);
  if (betEtb > 0) {
    await WalletService.credit(
      player.id,
      WalletType.main,
      betEtb,
      EXT_GAME_ROLLBACK,
      rollbackKey,
      `Gregmorn rollback | orig:${transactionId} | game:${gameId}`,
    );
  }

  const etbBalanceAfter = await getEtbBalance(player.id);
  const gameBalanceAfter = await etbToGameCurrency(etbBalanceAfter, currency);

  // Record rollback as its own transaction entry
  await prisma.gregmornTransaction.create({
    data: {
      transaction_id: rollbackKey,
      session_id: sessionid,
      player_login: login,
      cmd: 'rollback',
      bet: betEtb,
      win: 0,
      balance_after: gameBalanceAfter,
      game_id: gameId ?? null,
      info: info ?? null,
    },
  });

  res.json({
    balance: gameBalanceAfter,
    currency,
    error: '',
    login,
    status: 'success',
  });
}

export default router;
