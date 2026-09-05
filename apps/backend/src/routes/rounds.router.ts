// GET  /api/rounds             — list pending rounds
// GET  /api/rounds/:id          — round detail
// GET  /api/rounds/:id/cartelas — available cartela numbers
// POST /api/rounds/:id/join     — join a round
// Requirements: 2.1, 3.1, 3.2, 3.3, 3.4, 3.7, 12.3

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import {
  GameRoundService,
  CartelaTakenError,
  RoundNotPendingError,
  PlayerSuspendedError,
  RoundNotFoundError,
} from '../services/game-round.service.js';
import { CartelaReservationService, CartelaAlreadyReservedError, MaxCartelaLimitExceededError, ReservationNotFoundError } from '../services/cartela-reservation.service.js';
import { InsufficientFundsError } from '../services/wallet.service.js';
import { WalletType } from '@fidel/shared';
import type { RoundListItem, RoundDetail, JoinRoundResponse, CartelaAvailability } from '@fidel/shared';

const router: RouterType = Router();
export const TOTAL_CARTELAS = 800;

// All rounds routes require a valid JWT
router.use(jwtAuthMiddleware);

// ─── GET /api/rounds ─────────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const [rounds, activeCartelaRow] = await Promise.all([
    prisma.gameRound.findMany({
      where: { status: { in: ['pending', 'active'] } },
      include: {
        _count: { select: { round_entries: true } },
      },
      orderBy: { start_time: 'asc' },
    }),
    prisma.config.findUnique({ where: { key: 'active_cartela_count' } }),
  ]);

  const activeCartelaCount = (activeCartelaRow && parseInt(activeCartelaRow.value, 10) >= 1)
    ? Math.min(parseInt(activeCartelaRow.value, 10), TOTAL_CARTELAS)
    : TOTAL_CARTELAS;

  const items: RoundListItem[] = rounds.map((r) => ({
    id: r.id,
    stake: Number(r.stake),
    status: r.status,
    player_count: r._count.round_entries,
    max_players: r.max_players,
    active_cartela_count: activeCartelaCount,
    derash: Number(r.derash),
    start_time: r.start_time.toISOString(),
    winning_pattern: (r.winning_pattern ?? 'any_line') as import('@fidel/shared').WinPattern,
  }));

  // Short cache — stale-while-revalidate lets the client show instantly on revisit
  res.setHeader('Cache-Control', 'public, max-age=3, stale-while-revalidate=10');
  res.status(200).json(items);
});

// ─── GET /api/rounds/:id ─────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  const round = await prisma.gameRound.findUnique({
    where: { id },
    include: {
      _count: {
        select: { round_entries: true, called_numbers: true },
      },
    },
  });

  if (!round) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Round not found' });
    return;
  }

  const maxCartelasRow = await prisma.config.findUnique({ where: { key: 'max_cartelas_per_player' } });
  const maxCartelasPerPlayer = maxCartelasRow ? parseInt(maxCartelasRow.value, 10) : 2;

  const activeCartelaRow = await prisma.config.findUnique({ where: { key: 'active_cartela_count' } });
  const activeCartelaCount = (activeCartelaRow && parseInt(activeCartelaRow.value, 10) >= 1)
    ? parseInt(activeCartelaRow.value, 10)
    : TOTAL_CARTELAS;

  const detail: RoundDetail = {
    id: round.id,
    stake: Number(round.stake),
    status: round.status,
    player_count: round._count.round_entries,
    max_players: round.max_players,
    derash: Number(round.derash),
    commission_pct: Number(round.commission_pct),
    start_time: round.start_time.toISOString(),
    called_numbers_count: round._count.called_numbers,
    ended_at: round.ended_at?.toISOString(),
    winner_player_id: round.winner_player_id ?? undefined,
    winner_cartela_number: round.winner_cartela_number ?? undefined,
    max_cartelas_per_player: maxCartelasPerPlayer,
    active_cartela_count: activeCartelaCount,
    winning_pattern: (round.winning_pattern ?? 'any_line') as import('@fidel/shared').WinPattern,
  };

  res.status(200).json(detail);
});

// ─── GET /api/rounds/:id/called-numbers ──────────────────────────────────────

router.get('/:id/called-numbers', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  const calledNumbers = await prisma.calledNumber.findMany({
    where: { round_id: id },
    select: { number: true, sequence_index: true },
    orderBy: { sequence_index: 'asc' },
  });

  res.status(200).json(calledNumbers.map((cn) => cn.number));
});

// ─── GET /api/rounds/:id/my-cartelas ─────────────────────────────────────────
// Returns the authenticated player's cartela numbers and grids for this round.

router.get('/:id/my-cartelas', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const playerId = req.player!.playerId;

  const entries = await prisma.roundEntry.findMany({
    where: { round_id: id, player_id: playerId, is_watching: false },
    select: { cartela_number: true },
  });

  if (!entries.length) {
    res.status(200).json({ cartelas: [] });
    return;
  }

  const cartelaNumbers = entries.map((e) => e.cartela_number);
  const defs = await prisma.cartelaDefinition.findMany({
    where: { cartela_number: { in: cartelaNumbers } },
  });
  const gridMap = new Map(defs.map((d) => [d.cartela_number, d.grid]));

  res.status(200).json({
    cartelas: cartelaNumbers.map((num) => ({
      cartelaNumber: num,
      cartelaGrid: gridMap.get(num) ?? [],
    })),
  });
});

// ─── GET /api/rounds/:id/cartelas ────────────────────────────────────────────

router.get('/:id/cartelas', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  const round = await prisma.gameRound.findUnique({ where: { id }, select: { id: true } });
  if (!round) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Round not found' });
    return;
  }

  const { taken: takenNums, reserved: reservedNums } = await CartelaReservationService.getTakenAndReserved(id);

  const activeRow = await prisma.config.findUnique({ where: { key: 'active_cartela_count' } });
  const poolSize = (activeRow && parseInt(activeRow.value, 10) >= 1)
    ? Math.min(parseInt(activeRow.value, 10), TOTAL_CARTELAS)
    : TOTAL_CARTELAS;

  const ALL_CARTELAS = Array.from({ length: poolSize }, (_, i) => i + 1);
  const unavailable = new Set([...takenNums, ...reservedNums]);
  const available = ALL_CARTELAS.filter((n) => !unavailable.has(n));

  const response: CartelaAvailability = { available, taken: [...unavailable] };
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.status(200).json(response);
});

// ─── GET /api/rounds/:id/cartelas/:num/grid ──────────────────────────────────

router.get('/:id/cartelas/:num/grid', async (req: Request, res: Response): Promise<void> => {
  const num = parseInt(req.params['num'] as string, 10);
  if (isNaN(num) || num < 1 || num > TOTAL_CARTELAS) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid cartela number' });
    return;
  }
  const def = await prisma.cartelaDefinition.findUnique({ where: { cartela_number: num } });
  if (!def) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Cartela not found' });
    return;
  }
  res.json({ cartela_number: num, grid: def.grid });
});

// ─── POST /api/rounds/:id/join-batch ─────────────────────────────────────────
// Joins up to 3 cartelas in a single request to avoid race conditions
// where sequential joins trigger autoStartCheck between calls.

router.post('/:id/join-batch', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const playerId = req.player!.playerId;
  const body = req.body as { cartelaNumbers?: unknown };

  if (
    !Array.isArray(body?.cartelaNumbers) ||
    body.cartelaNumbers.length === 0 ||
    body.cartelaNumbers.length > 3 ||
    !body.cartelaNumbers.every(
      (n) => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= TOTAL_CARTELAS,
    )
  ) {
    res.status(400).json({
      error: 'BAD_REQUEST',
      message: `cartelaNumbers must be an array of 1–3 integers between 1 and ${TOTAL_CARTELAS}`,
    });
    return;
  }

  const cartelaNumbers = body.cartelaNumbers as number[];

  try {
    // Join all cartelas in a single transaction — prevents the round from starting
    // between sequential joins (which would cause RoundNotPendingError on the 2nd cartela).
    await GameRoundService.joinBatch(id, playerId, cartelaNumbers);
  } catch (err) {
    if (err instanceof CartelaTakenError) {
      res.status(409).json({ error: 'CARTELA_TAKEN', message: err.message });
      return;
    }
    if (err instanceof RoundNotPendingError) {
      res.status(409).json({ error: 'ROUND_NOT_JOINABLE', message: err.message });
      return;
    }
    if (err instanceof InsufficientFundsError) {
      res.status(422).json({ error: 'INSUFFICIENT_BALANCE', message: err.message });
      return;
    }
    if (err instanceof PlayerSuspendedError) {
      res.status(403).json({ error: 'PLAYER_SUSPENDED', message: err.message });
      return;
    }
    if (err instanceof RoundNotFoundError) {
      res.status(404).json({ error: 'NOT_FOUND', message: err.message });
      return;
    }
    const e = err as { code?: string; message?: string };
    if (e.code === 'MAX_CARTELA_LIMIT') {
      res.status(409).json({ error: 'MAX_CARTELA_LIMIT', message: e.message });
      return;
    }
    throw err;
  }

  const wallets = await prisma.wallet.findMany({ where: { player_id: playerId } });
  const mainWallet = wallets.find((w) => w.type === 'main');
  const playWallet = wallets.find((w) => w.type === 'play');

  // Credit invite bonus to referrer on first game bet (non-blocking, idempotent)
  const { ReferralService } = await import('../services/referral.service.js');
  void ReferralService.maybeCreditInviteBonus(playerId);

  res.status(200).json({
    cartelaNumbers,
    mainWalletBalance: Number(mainWallet?.balance ?? 0),
    playWalletBalance: Number(playWallet?.balance ?? 0),
  });
});

// ─── POST /api/rounds/:id/join ────────────────────────────────────────────────

router.post('/:id/join', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const playerId = req.player!.playerId;
  const body = req.body as { cartelaNumber?: unknown };

  if (
    body?.cartelaNumber === undefined ||
    typeof body.cartelaNumber !== 'number' ||
    !Number.isInteger(body.cartelaNumber) ||
    body.cartelaNumber < 1 ||
    body.cartelaNumber > TOTAL_CARTELAS
  ) {
    res.status(400).json({
      error: 'BAD_REQUEST',
      message: `cartelaNumber must be an integer between 1 and ${TOTAL_CARTELAS}`,
    });
    return;
  }

  const cartelaNumber = body.cartelaNumber as number;

  try {
    await GameRoundService.join(id, playerId, cartelaNumber, WalletType.main);
  } catch (err) {
    if (err instanceof CartelaTakenError) {
      res.status(409).json({ error: 'CARTELA_TAKEN', message: err.message });
      return;
    }
    if (err instanceof RoundNotPendingError) {
      res.status(409).json({ error: 'ROUND_NOT_JOINABLE', message: err.message });
      return;
    }
    if (err instanceof InsufficientFundsError) {
      res.status(422).json({ error: 'INSUFFICIENT_BALANCE', message: err.message });
      return;
    }
    if (err instanceof PlayerSuspendedError) {
      res.status(403).json({ error: 'PLAYER_SUSPENDED', message: err.message });
      return;
    }
    if (err instanceof RoundNotFoundError) {
      res.status(404).json({ error: 'NOT_FOUND', message: err.message });
      return;
    }
    throw err;
  }

  // Fetch updated wallet balances
  const wallets = await prisma.wallet.findMany({
    where: { player_id: playerId },
  });

  const mainWallet = wallets.find((w) => w.type === 'main');
  const playWallet = wallets.find((w) => w.type === 'play');

  // Credit invite bonus to referrer on first game bet (non-blocking, idempotent)
  const { ReferralService } = await import('../services/referral.service.js');
  void ReferralService.maybeCreditInviteBonus(playerId);

  const response: JoinRoundResponse = {
    cartelaNumber,
    mainWalletBalance: Number(mainWallet?.balance ?? 0),
    playWalletBalance: Number(playWallet?.balance ?? 0),
  };

  res.status(200).json(response);
});

// ─── DELETE /api/rounds/:id/leave/:cartelaNumber ─────────────────────────────
// Unjoin a cartela from a pending round. No refund — payment is collected at game start.

router.delete('/:id/leave/:cartelaNumber', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const playerId = req.player!.playerId;
  const cartelaNumber = parseInt(req.params['cartelaNumber'] as string, 10);

  if (isNaN(cartelaNumber) || cartelaNumber < 1 || cartelaNumber > TOTAL_CARTELAS) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid cartela number' });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const rounds = await tx.$queryRaw<Array<{ id: string; status: string; stake: string; commission_pct: number }>>`
        SELECT id, status, stake, commission_pct FROM game_rounds WHERE id = ${id} FOR UPDATE
      `;
      const round = rounds[0];
      if (!round) { res.status(404).json({ error: 'NOT_FOUND', message: 'Round not found' }); return; }
      if (round.status !== 'pending') { res.status(409).json({ error: 'ROUND_NOT_PENDING', message: 'Round has already started — cannot leave' }); return; }

      const entry = await tx.roundEntry.findUnique({
        where: { round_id_cartela_number: { round_id: id, cartela_number: cartelaNumber } },
      });
      if (!entry || entry.player_id !== playerId) {
        res.status(404).json({ error: 'ENTRY_NOT_FOUND', message: 'Cartela entry not found' }); return;
      }

      // Remove entry — no payment was taken yet so no refund needed
      await tx.roundEntry.delete({
        where: { round_id_cartela_number: { round_id: id, cartela_number: cartelaNumber } },
      });

      // Recalculate derash preview
      const stake = parseFloat(round.stake);
      const entryCount = await tx.roundEntry.count({ where: { round_id: id, is_watching: false } });
      const newDerash = entryCount * stake * (1 - round.commission_pct / 100);
      await tx.gameRound.update({ where: { id }, data: { derash: newDerash } });
    });

    if (!res.headersSent) {
      // Broadcast so other clients see this cartela as available again
      if (GameRoundService._onCartelaUnreserved) {
        void GameRoundService._onCartelaUnreserved(id, [cartelaNumber]);
      }
      const wallets = await prisma.wallet.findMany({ where: { player_id: playerId } });
      const main = wallets.find(w => w.type === 'main');
      const play = wallets.find(w => w.type === 'play');
      res.status(200).json({ ok: true, mainWalletBalance: Number(main?.balance ?? 0), playWalletBalance: Number(play?.balance ?? 0) });
    }
  } catch (err) {
    if (!res.headersSent) {
      console.error('[rounds] leave error:', err);
      res.status(500).json({ error: 'INTERNAL', message: 'Failed to leave round' });
    }
  }
});

// ─── POST /api/rounds/:id/reserve ────────────────────────────────────────────
// Reserve a cartela for the current player during the selection window.

router.post('/:id/reserve', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const playerId = req.player!.playerId;
  const body = req.body as { cartelaNumber?: unknown };

  const cartelaNumber = body?.cartelaNumber;
  if (typeof cartelaNumber !== 'number' || !Number.isInteger(cartelaNumber) || cartelaNumber < 1 || cartelaNumber > TOTAL_CARTELAS) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid cartelaNumber' });
    return;
  }

  try {
    await CartelaReservationService.reserve(id, playerId, cartelaNumber);
    // Broadcast to other players in this round room
    if (GameRoundService._onCartelaReserved) {
      void GameRoundService._onCartelaReserved(id, [cartelaNumber]);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof CartelaAlreadyReservedError) {
      res.status(409).json({ error: 'CARTELA_RESERVED', message: err.message });
      return;
    }
    if (err instanceof MaxCartelaLimitExceededError) {
      res.status(409).json({ error: 'MAX_CARTELA_LIMIT', message: err.message });
      return;
    }
    throw err;
  }
});

// ─── DELETE /api/rounds/:id/reserve/:num ─────────────────────────────────────
// Release a reservation when the player deselects a cartela.

router.delete('/:id/reserve/:num', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const playerId = req.player!.playerId;
  const cartelaNumber = parseInt(req.params['num'] as string, 10);

  if (isNaN(cartelaNumber) || cartelaNumber < 1 || cartelaNumber > TOTAL_CARTELAS) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid cartela number' });
    return;
  }

  try {
    await CartelaReservationService.release(id, playerId, cartelaNumber);
    if (GameRoundService._onCartelaUnreserved) {
      void GameRoundService._onCartelaUnreserved(id, [cartelaNumber]);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof ReservationNotFoundError) {
      // Already gone — treat as success
      res.status(200).json({ ok: true });
      return;
    }
    throw err;
  }
});

export default router;