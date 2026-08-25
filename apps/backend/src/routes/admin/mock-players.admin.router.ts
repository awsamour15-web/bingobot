// Admin mock players management
// Mock players are bot-controlled players used by admin to fill games

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { WalletType, TxType } from '@fidel/shared';
import prisma from '../../lib/prisma.js';
import { WalletService } from '../../services/wallet.service.js';
import { GameRoundService } from '../../services/game-round.service.js';

const router: RouterType = Router();

const MOCK_PLAYER_COUNT = 50;

// Fixed telegram IDs for mock players (use negative range to avoid collisions)
const MOCK_TELEGRAM_IDS = Array.from({ length: MOCK_PLAYER_COUNT }, (_, i) => BigInt(-(i + 1)));
const MOCK_USERNAMES = Array.from({ length: MOCK_PLAYER_COUNT }, (_, i) => `mock_player_${i + 1}`);

// POST /api/admin/mock-players/seed
// Creates the 10 mock players if they don't exist yet
router.post('/seed', async (_req: Request, res: Response): Promise<void> => {
  const results: Array<{ username: string; id: string; created: boolean }> = [];

  for (let i = 0; i < MOCK_PLAYER_COUNT; i++) {
    const telegramId = MOCK_TELEGRAM_IDS[i]!;
    const username = MOCK_USERNAMES[i]!;

    const existing = await prisma.player.findUnique({ where: { telegram_id: telegramId } });

    if (existing) {
      results.push({ username: existing.username, id: existing.id, created: false });
      continue;
    }

    // Use $executeRaw to insert with is_mock=true since old generated client may not have the field
    const [newPlayer] = await prisma.$queryRaw<Array<{ id: string; username: string }>>`
      INSERT INTO players (id, telegram_id, username, is_mock, phone_verified, is_suspended, created_at)
      VALUES (gen_random_uuid(), ${telegramId}, ${username}, true, false, false, now())
      RETURNING id, username
    `;

    if (!newPlayer) {
      results.push({ username, id: '', created: false });
      continue;
    }

    await prisma.wallet.createMany({
      data: [
        { player_id: newPlayer.id, type: WalletType.main, balance: 0 },
        { player_id: newPlayer.id, type: WalletType.play, balance: 0 },
      ],
    });

    results.push({ username: newPlayer.username, id: newPlayer.id, created: true });
  }

  const created = results.filter((r) => r.created).length;
  res.status(201).json({
    message: `${created} new mock players created, ${MOCK_PLAYER_COUNT - created} already existed.`,
    players: results,
  });
});

// GET /api/admin/mock-players
// List all mock players with balances
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const players = await prisma.$queryRaw<Array<{
    id: string;
    username: string;
    telegram_id: bigint;
    is_suspended: boolean;
    main_balance: string | null;
    play_balance: string | null;
    total_games: bigint;
  }>>`
    SELECT
      p.id,
      p.username,
      p.telegram_id,
      p.is_suspended,
      main_w.balance AS main_balance,
      play_w.balance AS play_balance,
      COUNT(re.id)   AS total_games
    FROM players p
    LEFT JOIN wallets main_w ON main_w.player_id = p.id AND main_w.type = 'main'
    LEFT JOIN wallets play_w ON play_w.player_id = p.id AND play_w.type = 'play'
    LEFT JOIN round_entries re ON re.player_id = p.id
    WHERE p.is_mock = true
    GROUP BY p.id, p.username, p.telegram_id, p.is_suspended, main_w.balance, play_w.balance
    ORDER BY p.username ASC
  `;

  res.json(players.map((p) => ({
    id: p.id,
    username: p.username,
    telegram_id: String(p.telegram_id),
    is_suspended: p.is_suspended,
    main_wallet_balance: Number(p.main_balance ?? 0),
    play_wallet_balance: Number(p.play_balance ?? 0),
    total_games: Number(p.total_games),
  })));
});

// POST /api/admin/mock-players/:id/credit
// Top-up balance for a single mock player
router.post('/:id/credit', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { amount, walletType } = req.body as { amount?: number; walletType?: string };

  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'amount must be a positive number' });
    return;
  }

  const wType = (walletType ?? 'play') as WalletType;
  if (!Object.values(WalletType).includes(wType)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid walletType' });
    return;
  }

  const [player] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM players WHERE id = ${id} AND is_mock = true LIMIT 1
  `;
  if (!player) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Mock player not found' });
    return;
  }

  await WalletService.credit(id, wType, amount, TxType.admin_credit, `mock_credit_${Date.now()}`, 'Admin mock credit');
  res.json({ success: true });
});

// POST /api/admin/mock-players/join-round
// Add one or more mock players to a pending round with auto-assigned cartelas and given balance
// Body: { roundId, playerIds: string[], balance: number }
router.post('/join-round', async (req: Request, res: Response): Promise<void> => {
  const { roundId, playerIds, balance } = req.body as {
    roundId?: string;
    playerIds?: string[];
    balance?: number;
  };

  if (!roundId || !playerIds?.length) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'roundId and playerIds are required' });
    return;
  }

  if (balance === undefined || balance < 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'balance must be >= 0' });
    return;
  }

  // Verify round exists and is pending
  const round = await prisma.gameRound.findUnique({
    where: { id: roundId },
    select: { id: true, status: true, stake: true, max_players: true, _count: { select: { round_entries: true } } },
  });

  if (!round) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Round not found' });
    return;
  }
  if (round.status !== 'pending') {
    res.status(422).json({ error: 'ROUND_NOT_PENDING', message: 'Round must be pending' });
    return;
  }

  // Verify all are mock players using raw query
  const mockPlayers = await prisma.$queryRaw<Array<{ id: string; username: string }>>`
    SELECT id, username FROM players
    WHERE id = ANY(${playerIds}::uuid[]) AND is_mock = true
  `;

  if (mockPlayers.length !== playerIds.length) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'One or more player IDs are not valid mock players' });
    return;
  }

  // Find taken cartelas
  const takenEntries = await prisma.roundEntry.findMany({
    where: { round_id: roundId },
    select: { cartela_number: true },
  });
  const takenSet = new Set(takenEntries.map((e) => e.cartela_number));

  // Assign one cartela per mock player (first available)
  const TOTAL_CARTELAS = 800;
  const available: number[] = [];
  for (let n = 1; n <= TOTAL_CARTELAS && available.length < mockPlayers.length; n++) {
    if (!takenSet.has(n)) available.push(n);
  }

  if (available.length < mockPlayers.length) {
    res.status(422).json({ error: 'NO_CARTELAS', message: 'Not enough available cartelas in this round' });
    return;
  }

  const results: Array<{ playerId: string; username: string; cartelaNumber: number }> = [];
  const errors: Array<{ playerId: string; error: string }> = [];
  const stake = parseFloat(round.stake.toString());

  for (let i = 0; i < mockPlayers.length; i++) {
    const player = mockPlayers[i]!;
    const cartelaNumber = available[i]!;

    try {
      if (balance > 0) {
        // Credit the requested balance to the play wallet
        await WalletService.credit(
          player.id,
          WalletType.play,
          balance,
          TxType.admin_credit,
          `mock_auto_${Date.now()}_${i}`,
          'Admin balance for mock round join',
        );
      } else {
        // Ensure at least enough to cover the stake
        const [walletRow] = await prisma.$queryRaw<Array<{ total: string }>>`
          SELECT COALESCE(SUM(balance),0) AS total FROM wallets WHERE player_id = ${player.id}
        `;
        const totalBal = Number(walletRow?.total ?? 0);
        if (totalBal < stake) {
          await WalletService.credit(
            player.id,
            WalletType.play,
            stake - totalBal,
            TxType.admin_credit,
            `mock_stake_${Date.now()}_${i}`,
            'Auto stake credit for mock player',
          );
        }
      }

      await GameRoundService.joinBatch(roundId, player.id, [cartelaNumber]);
      results.push({ playerId: player.id, username: player.username, cartelaNumber });
    } catch (err) {
      errors.push({ playerId: player.id, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  res.json({ joined: results, errors });
});

// PATCH /api/admin/mock-players/:id/rename
// Rename a mock player's username
router.patch('/:id/rename', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { username } = req.body as { username?: string };

  if (!username || !username.trim()) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'username is required' });
    return;
  }

  const trimmed = username.trim();

  const [player] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM players WHERE id = ${id} AND is_mock = true LIMIT 1
  `;
  if (!player) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Mock player not found' });
    return;
  }

  await prisma.player.update({ where: { id }, data: { username: trimmed } });
  res.json({ success: true, username: trimmed });
});

// GET /api/admin/mock-players/bot-config
router.get('/bot-config', async (_req: Request, res: Response): Promise<void> => {
  const keys = ['mock_bot_enabled', 'mock_bot_count', 'mock_bot_balance', 'mock_bot_win_enabled', 'mock_bot_stakes'];
  const rows = await prisma.config.findMany({ where: { key: { in: keys } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const rawStakes = map['mock_bot_stakes'] ?? '10,20,50';
  const stakes = rawStakes.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  res.json({
    enabled: map['mock_bot_enabled'] === 'true',
    winEnabled: map['mock_bot_win_enabled'] === 'true',
    count: parseInt(map['mock_bot_count'] ?? '3', 10),
    balance: parseFloat(map['mock_bot_balance'] ?? '0'),
    stakes,
  });
});

// PATCH /api/admin/mock-players/bot-config
router.patch('/bot-config', async (req: Request, res: Response): Promise<void> => {
  const { enabled, winEnabled, count, balance, stakes } = req.body as {
    enabled?: boolean; winEnabled?: boolean; count?: number; balance?: number; stakes?: number[];
  };
  const updates: Array<{ key: string; value: string }> = [];
  if (enabled !== undefined) updates.push({ key: 'mock_bot_enabled', value: String(enabled) });
  if (winEnabled !== undefined) updates.push({ key: 'mock_bot_win_enabled', value: String(winEnabled) });
  if (count !== undefined) updates.push({ key: 'mock_bot_count', value: String(Math.max(1, Math.min(50, count))) });
  if (balance !== undefined) updates.push({ key: 'mock_bot_balance', value: String(Math.max(0, balance)) });
  if (stakes !== undefined) {
    const valid = stakes.filter((s) => [10, 20, 50].includes(s));
    updates.push({ key: 'mock_bot_stakes', value: valid.join(',') });
  }
  for (const { key, value } of updates) {
    await prisma.config.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  res.json({ success: true });
});

// POST /api/admin/mock-players/bot-trigger/:roundId
router.post('/bot-trigger/:roundId', async (req: Request, res: Response): Promise<void> => {
  const { roundId } = req.params as { roundId: string };
  const { MockPlayerBotService } = await import('../../services/mock-player-bot.service.js');
  void MockPlayerBotService.onRoundPending(roundId);
  res.json({ success: true, message: 'Mock bot triggered for round' });
});

export default router;