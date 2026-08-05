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
import { InsufficientFundsError } from '../services/wallet.service.js';
import { WalletType } from '@beteseb/shared';
import type { RoundListItem, RoundDetail, JoinRoundResponse, CartelaAvailability } from '@beteseb/shared';

const router: RouterType = Router();

// All rounds routes require a valid JWT
router.use(jwtAuthMiddleware);

// ─── GET /api/rounds ─────────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const rounds = await prisma.gameRound.findMany({
    where: { status: { in: ['pending', 'active'] } },
    include: {
      _count: { select: { round_entries: true } },
    },
    orderBy: { start_time: 'asc' },
  });

  const items: RoundListItem[] = rounds.map((r) => ({
    id: r.id,
    stake: Number(r.stake),
    status: r.status,
    player_count: r._count.round_entries,
    max_players: r.max_players,
    derash: Number(r.derash),
    start_time: r.start_time.toISOString(),
  }));

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

  const detail: RoundDetail = {
    id: round.id,
    stake: Number(round.stake),
    status: round.status,
    player_count: round._count.round_entries,
    max_players: round.max_players,
    derash: Number(round.derash),
    start_time: round.start_time.toISOString(),
    called_numbers_count: round._count.called_numbers,
    ended_at: round.ended_at?.toISOString(),
    winner_player_id: round.winner_player_id ?? undefined,
    winner_cartela_number: round.winner_cartela_number ?? undefined,
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

// ─── GET /api/rounds/:id/cartelas ────────────────────────────────────────────

router.get('/:id/cartelas', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  // Verify round exists
  const round = await prisma.gameRound.findUnique({ where: { id } });
  if (!round) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Round not found' });
    return;
  }

  // Get taken cartela numbers in this round (paying players only)
  const takenEntries = await prisma.roundEntry.findMany({
    where: { round_id: id, is_watching: false },
    select: { cartela_number: true },
  });

  const takenSet = new Set(takenEntries.map((e) => e.cartela_number));

  // All cartela numbers 1–800
  const ALL_CARTELAS = Array.from({ length: 800 }, (_, i) => i + 1);
  const available = ALL_CARTELAS.filter((n) => !takenSet.has(n));
  const taken = ALL_CARTELAS.filter((n) => takenSet.has(n));

  const response: CartelaAvailability = { available, taken };
  res.status(200).json(response);
});

// ─── GET /api/rounds/:id/cartelas/:num/grid ──────────────────────────────────

router.get('/:id/cartelas/:num/grid', async (req: Request, res: Response): Promise<void> => {
  const num = parseInt(req.params['num'] as string, 10);
  if (isNaN(num) || num < 1 || num > 800) {
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
// Joins up to MAX_SELECT cartelas in a single request to avoid race conditions
// where sequential joins trigger autoStartCheck between calls.

router.post('/:id/join-batch', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const playerId = req.player!.playerId;
  const body = req.body as { cartelaNumbers?: unknown };

  if (
    !Array.isArray(body?.cartelaNumbers) ||
    body.cartelaNumbers.length === 0 ||
    body.cartelaNumbers.length > 2 ||
    !body.cartelaNumbers.every(
      (n) => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 800,
    )
  ) {
    res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'cartelaNumbers must be an array of 1–2 integers between 1 and 800',
    });
    return;
  }

  const cartelaNumbers = body.cartelaNumbers as number[];

  try {
    // Join all cartelas sequentially — scheduler handles round start.
    for (let i = 0; i < cartelaNumbers.length; i++) {
      await GameRoundService.join(id, playerId, cartelaNumbers[i]!, WalletType.main);
    }
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

  const wallets = await prisma.wallet.findMany({ where: { player_id: playerId } });
  const mainWallet = wallets.find((w) => w.type === 'main');
  const playWallet = wallets.find((w) => w.type === 'play');

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
    body.cartelaNumber > 800
  ) {
    res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'cartelaNumber must be an integer between 1 and 800',
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

  const response: JoinRoundResponse = {
    cartelaNumber,
    mainWalletBalance: Number(mainWallet?.balance ?? 0),
    playWalletBalance: Number(playWallet?.balance ?? 0),
  };

  res.status(200).json(response);
});

export default router;
