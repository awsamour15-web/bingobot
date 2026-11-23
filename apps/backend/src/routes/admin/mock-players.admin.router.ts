// Admin mock players management
// Mock players are bot-controlled players used by admin to fill games

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { WalletType, TxType } from '@mada/shared';
import prisma from '../../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { WalletService } from '../../services/wallet.service.js';
import { GameRoundService } from '../../services/game-round.service.js';
import { invalidateConfigCache } from '../../lib/config-cache.js';
import { asyncHandler } from '../../lib/error-handler.js';

const router: RouterType = Router();

const MOCK_PLAYER_COUNT = Number(process.env.MOCK_PLAYER_COUNT ?? 50);

// Fixed telegram IDs for mock players (use negative range to avoid collisions)
const MOCK_TELEGRAM_IDS = Array.from({ length: MOCK_PLAYER_COUNT }, (_, i) => BigInt(-(i + 1)));
const MOCK_USERNAMES = Array.from({ length: MOCK_PLAYER_COUNT }, (_, i) => `mock_player_${i + 1}`);

// POST /api/admin/mock-players/create
// Create one or more mock players with custom or auto-generated usernames
router.post('/create', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { usernames, count } = req.body as { usernames?: string[]; count?: number };

  // Build the list of usernames to create
  let names: string[] = [];
  if (Array.isArray(usernames) && usernames.length > 0) {
    names = usernames.map((u) => u.trim()).filter(Boolean);
  } else {
    const n = Math.min(Math.max(1, parseInt(String(count ?? 1), 10)), 500);
    // Generate sequential names based on current max mock player index
    const existing = await prisma.$queryRaw<Array<{ username: string }>>`
      SELECT username FROM players WHERE is_mock = true ORDER BY created_at DESC
    `;
    const existingNames = new Set(existing.map((r) => r.username));
    let idx = existing.length + 1;
    for (let i = 0; i < n; i++) {
      let name = `mock_player_${idx}`;
      while (existingNames.has(name)) { idx++; name = `mock_player_${idx}`; }
      names.push(name);
      existingNames.add(name);
      idx++;
    }
  }

  if (!names.length) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Provide usernames or a count >= 1' });
    return;
  }

  const results: Array<{ username: string; id: string; created: boolean }> = [];

  for (const username of names) {
    // Check for duplicate username
    const dup = await prisma.player.findFirst({ where: { username } });
    if (dup) {
      results.push({ username, id: dup.id, created: false });
      continue;
    }

    // Use a unique negative telegram_id (timestamp-based to avoid collisions)
    const telegramId = BigInt(-(Date.now() * 1000 + Math.floor(Math.random() * 1000)));

    const [newPlayer] = await prisma.$queryRaw<Array<{ id: string; username: string }>>`
      INSERT INTO players (id, telegram_id, username, is_mock, phone_verified, is_suspended, created_at)
      VALUES (gen_random_uuid(), ${telegramId}, ${username}, true, false, false, now())
      ON CONFLICT DO NOTHING
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
    message: `${created} mock player(s) created.`,
    players: results,
  });
}));


// Creates the 10 mock players if they don't exist yet
router.post('/seed', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
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
}));

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
router.post('/:id/credit', asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
}));

// POST /api/admin/mock-players/join-round
// Add one or more mock players to a pending round with auto-assigned cartelas and given balance
// Body: { roundId, playerIds: string[], balance: number }
router.post('/join-round', asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
  const mockPlayers = await prisma.$queryRawUnsafe<Array<{ id: string; username: string }>>(
    `SELECT id, username FROM players WHERE id = ANY(ARRAY[${playerIds.map(id => `'${id}'`).join(',')}]::text[]) AND is_mock = true`
  );

  if (mockPlayers.length !== playerIds.length) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'One or more player IDs are not valid mock players' });
    return;
  }

  const stake = parseFloat(round.stake.toString());

  // Hold the round open while we credit wallets and insert entries. This is
  // reset to a normal ~40s countdown at the end of this handler, so the game
  // doesn't sit idle for minutes after everyone has already joined.
  await prisma.gameRound.update({
    where: { id: roundId },
    data: { start_time: new Date(Date.now() + 180 * 1000) },
  });

  // Step 1: Credit balances for all mock players upfront. Bounded concurrency —
  // the old sequential loop took ~1.5s per player, so joining hundreds of mock
  // players left the round idle for minutes.
  const CREDIT_CONCURRENCY = 20;
  const creditTag = Date.now();
  const creditOne = async (player: { id: string }, i: number): Promise<void> => {
    if (balance > 0) {
      await WalletService.credit(
        player.id,
        WalletType.play,
        balance,
        TxType.admin_credit,
        `mock_auto_${creditTag}_${i}`,
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
          `mock_stake_${creditTag}_${i}`,
          'Auto stake credit for mock player',
        );
      }
    }
  };
  for (let start = 0; start < mockPlayers.length; start += CREDIT_CONCURRENCY) {
    await Promise.allSettled(
      mockPlayers.slice(start, start + CREDIT_CONCURRENCY).map((p, j) => creditOne(p, start + j)),
    );
  }

  const TOTAL_CARTELAS = 800;

  // Step 2: Remove any existing entries for these mock players in this round first
  // so re-joining always works cleanly
  await prisma.roundEntry.deleteMany({
    where: {
      round_id: roundId,
      player_id: { in: mockPlayers.map((p) => p.id) },
    },
  });

  // Re-fetch taken cartelas after deletion so our available list is accurate
  const takenAfterDelete = await prisma.roundEntry.findMany({
    where: { round_id: roundId },
    select: { cartela_number: true },
  });
  const takenSetFinal = new Set(takenAfterDelete.map((e) => e.cartela_number));
  const availableFinal: number[] = [];
  for (let n = 1; n <= TOTAL_CARTELAS && availableFinal.length < mockPlayers.length; n++) {
    if (!takenSetFinal.has(n)) availableFinal.push(n);
  }

  if (availableFinal.length < mockPlayers.length) {
    res.status(422).json({ error: 'NO_CARTELAS', message: 'Not enough available cartelas in this round' });
    return;
  }

  // Step 3: Bulk insert all round_entries in one query — no per-row locking or limit checks
  await prisma.roundEntry.createMany({
    data: mockPlayers.map((player, i) => ({
      round_id: roundId,
      player_id: player.id,
      cartela_number: availableFinal[i]!,
      is_watching: false,
    })),
  });

  // Step 4: Recalculate derash and restore a normal ~40s countdown now that
  // every mock player is in the round (the 3-minute hold above is only a
  // safety window for the wallet/insert work).
  const stillPending = await prisma.gameRound.findUnique({
    where: { id: roundId },
    select: { status: true, commission_pct: true },
  });
  if (!stillPending || stillPending.status !== 'pending') {
    res.status(409).json({ error: 'ROUND_NOT_PENDING', message: 'Round is no longer pending' });
    return;
  }
  const entryCount = await prisma.roundEntry.count({ where: { round_id: roundId, is_watching: false } });
  const commissionPct = stillPending.commission_pct ?? 20;
  await prisma.gameRound.update({
    where: { id: roundId },
    data: {
      derash: entryCount * stake * (1 - commissionPct / 100),
      start_time: new Date(Date.now() + 40 * 1000),
    },
  });

  const results = mockPlayers.map((p, i) => ({
    playerId: p.id,
    username: p.username,
    cartelaNumber: availableFinal[i]!,
  }));

  // Broadcast CARTELA_TAKEN so clients update derash and player count instantly
  if (GameRoundService._onCartelaTaken) {
    await GameRoundService._onCartelaTaken(roundId, availableFinal, entryCount, undefined);
  }

  res.json({ joined: results, errors: [] });
}));

// POST /api/admin/mock-players/reset-balances
// Wipe ALL mock player wallet balances (main + play) and set each to the given amount (default 200)
router.post('/reset-balances', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { amount = 200 } = req.body as { amount?: number };
  if (typeof amount !== 'number' || amount < 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'amount must be a non-negative number' });
    return;
  }

  // Get every wallet (any type: main, play, ...) belonging to a mock player
  const mockWallets = await prisma.$queryRaw<Array<{ wallet_id: string }>>`
    SELECT w.id AS wallet_id
    FROM wallets w
    JOIN players p ON p.id = w.player_id
    WHERE p.is_mock = true
  `;

  if (!mockWallets.length) {
    res.json({ success: true, updated: 0, amount });
    return;
  }

  // Set balance directly to the target amount across all mock player wallets
  await prisma.$executeRawUnsafe(
    `UPDATE wallets SET balance = ${amount} WHERE id = ANY(ARRAY[${mockWallets.map((w) => `'${w.wallet_id}'`).join(',')}]::text[])`
  );

  res.json({ success: true, updated: mockWallets.length, amount });
}));

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

// POST /api/admin/mock-players/bulk-rename
// Rename mock players in bulk from an ordered list of usernames.
// Players are matched in creation order (oldest first); name #1 goes to the
// oldest mock player, name #2 to the next, and so on.
// Body: { usernames: string[] }
router.post('/bulk-rename', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { usernames } = req.body as { usernames?: string[] };

  if (!Array.isArray(usernames) || usernames.length === 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'usernames array is required' });
    return;
  }

  const cleaned = usernames
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter(Boolean);

  if (!cleaned.length) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Provide at least one non-empty username' });
    return;
  }

  // Reject duplicates inside the submitted list (case-insensitive)
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const name of cleaned) {
    const key = name.toLowerCase();
    if (seen.has(key)) dupes.add(name);
    seen.add(key);
  }
  if (dupes.size) {
    res.status(400).json({
      error: 'DUPLICATE_USERNAMES',
      message: `Duplicate username(s) in list: ${[...dupes].join(', ')}`,
    });
    return;
  }

  // Fetch mock players in a stable order (oldest first)
  const players = await prisma.$queryRaw<Array<{ id: string; username: string }>>`
    SELECT id, username FROM players WHERE is_mock = true ORDER BY created_at ASC, id ASC
  `;

  if (!players.length) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'No mock players found' });
    return;
  }

  const count = Math.min(players.length, cleaned.length);
  const targets = players.slice(0, count);
  const names = cleaned.slice(0, count);

  // Make sure no target name already belongs to a non-selected player
  const selectedIds = new Set(targets.map((p) => p.id));
  const allPlayers = await prisma.$queryRaw<Array<{ id: string; username: string }>>`
    SELECT id, username FROM players
  `;
  const takenByOthers = new Set(
    allPlayers.filter((p) => !selectedIds.has(p.id)).map((p) => p.username.toLowerCase()),
  );
  const conflicts = names.filter((n) => takenByOthers.has(n.toLowerCase()));
  if (conflicts.length) {
    res.status(409).json({
      error: 'USERNAME_TAKEN',
      message: `Username(s) already used by other players: ${conflicts.join(', ')}`,
    });
    return;
  }

  // Two-phase rename: move every target to a temporary unique name first so
  // swapping/reusing existing usernames can never trip a unique constraint.
  const tmpPrefix = `__bulk_tmp_${Date.now()}_`;
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < targets.length; i++) {
      await tx.player.update({
        where: { id: targets[i]!.id },
        data: { username: `${tmpPrefix}${i}` },
      });
    }
    for (let i = 0; i < targets.length; i++) {
      await tx.player.update({
        where: { id: targets[i]!.id },
        data: { username: names[i]! },
      });
    }
  }, { timeout: 120_000, maxWait: 20_000 });

  res.json({
    success: true,
    renamed: targets.length,
    totalMockPlayers: players.length,
    unusedUsernames: cleaned.length - count,
    players: targets.map((p, i) => ({ id: p.id, from: p.username, to: names[i]! })),
  });
}));

// POST /api/admin/mock-players/bulk-delete
// Permanently delete mock players and every record that references them.
// Body: { ids?: string[], all?: boolean }
//   ids  — delete only these mock players
//   all  — delete every mock player
//
// Safety improvement: deletes run outside a single Prisma $transaction so
// Render's limited statement timeout / connection pool cannot be exhausted.
// Each table's deleteMany is wrapped in try / catch so one failure does not
// abort the whole operation — the response always includes per‑table counts
// (0 means "not found" or the table was skipped).
router.post('/bulk-delete', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { ids, all } = req.body as { ids?: string[]; all?: boolean };

  let targetIds: string[];

  if (Array.isArray(ids) && ids.length > 0) {
    const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim()))];
    if (!unique.length) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'ids must contain valid player IDs' });
      return;
    }
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM players WHERE is_mock = true AND id IN (${Prisma.join(unique)})
    `;
    targetIds = rows.map((r) => r.id);
  } else if (all === true) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM players WHERE is_mock = true
    `;
    targetIds = rows.map((r) => r.id);
  } else {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Provide ids or set all=true' });
    return;
  }

  if (!targetIds.length) {
    res.json({ success: true, deleted: 0, related: {} });
    return;
  }

  const idsIn = targetIds;
  const results: Record<string, number> = {};

  // ---------- Wallets + transactions ----------
  try {
    const wallets = await prisma.wallet.findMany({ where: { player_id: { in: idsIn } }, select: { id: true } });
    const walletIds = wallets.map((w) => w.id);
    results.transactions = walletIds.length
      ? (await prisma.transaction.deleteMany({ where: { wallet_id: { in: walletIds } } })).count
      : 0;
    results.wallets = walletIds.length
      ? (await prisma.wallet.deleteMany({ where: { player_id: { in: idsIn } } })).count
      : 0;
  } catch {
    results.transactions = 0;
    results.wallets = 0;
  }

  // ---------- Deposits / deposit attempts ----------
  try {
    const deposits = await prisma.pendingDeposit.findMany({ where: { player_id: { in: idsIn } }, select: { id: true } });
    const depositIds = deposits.map((d) => d.id);
    results.depositAttempts = (await prisma.depositAttempt.deleteMany({ where: { player_id: { in: idsIn } } })).count;
    results.pendingDeposits = (await prisma.pendingDeposit.deleteMany({ where: { player_id: { in: idsIn } } })).count;
    // also clean deposit‑by‑deposit links if the column exists
    try { results.depositAttempts += (await prisma.depositAttempt.deleteMany({ where: { deposit_id: { in: depositIds } } })).count; } catch {}
  } catch {
    results.depositAttempts = 0;
    results.pendingDeposits = 0;
  }

  // ---------- Bingo history ----------
  try { results.roundEntries = (await prisma.roundEntry.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.roundEntries = 0; }
  try { results.roundWinners = (await prisma.roundWinner.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.roundWinners = 0; }
  try { results.roundBonusWinners = (await prisma.roundBonusWinner.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.roundBonusWinners = 0; }
  try { results.cartelaReservations = (await prisma.cartelaReservation.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.cartelaReservations = 0; }

  // ---------- Money / promotions ----------
  try { results.pendingWithdrawals = (await prisma.pendingWithdrawal.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.pendingWithdrawals = 0; }
  try { results.agentCommissions = (await prisma.agentCommission.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.agentCommissions = 0; }
  try { results.promotionBonuses = (await prisma.promotionBonusDistribution.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.promotionBonuses = 0; }

  // ---------- Mini-games ----------
  try { results.crashBets = (await prisma.crashBet.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.crashBets = 0; }
  try { results.slotSpins = (await prisma.slotSpin.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.slotSpins = 0; }
  try { results.kenoBets = (await prisma.kenoBet.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.kenoBets = 0; }
  try { results.plinkoBets = (await prisma.plinkoBet.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.plinkoBets = 0; }
  try { results.royalDropBets = (await prisma.royalDropBet.deleteMany({ where: { player_id: { in: idsIn } } })).count; } catch { results.royalDropBets = 0; }

  // ---------- Detach nullable references (no await / no transaction) ----------
  try { await prisma.gameRound.updateMany({ where: { winner_player_id: { in: idsIn } }, data: { winner_player_id: null } }); } catch {}
  try { await prisma.player.updateMany({ where: { referrer_id: { in: idsIn } }, data: { referrer_id: null } }); } catch {}

  // ---------- Finally, delete the mock players themselves ----------
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM players WHERE is_mock = true AND id = ANY(ARRAY[${targetIds.map((id) => `'${id}'`).join(',')}]::text[])`,
    );
    results.playersDeleted = targetIds.length;
  } catch {
    results.playersDeleted = 0;
  }

  // ---------- Respond ----------
  const related = {
    transactions: results.transactions ?? 0,
    deposits: results.pendingDeposits ?? 0,
    depositAttempts: results.depositAttempts ?? 0,
    roundEntries: results.roundEntries ?? 0,
    roundWinners: results.roundWinners ?? 0,
    roundBonusWinners: results.roundBonusWinners ?? 0,
    cartelaReservations: results.cartelaReservations ?? 0,
    pendingWithdrawals: results.pendingWithdrawals ?? 0,
    agentCommissions: results.agentCommissions ?? 0,
    promotionBonuses: results.promotionBonuses ?? 0,
    crashBets: results.crashBets ?? 0,
    slotSpins: results.slotSpins ?? 0,
    kenoBets: results.kenoBets ?? 0,
    plinkoBets: results.plinkoBets ?? 0,
    royalDropBets: results.royalDropBets ?? 0,
    playersDeleted: results.playersDeleted ?? 0,
    wallets: results.wallets ?? 0,
  };

  res.json({ success: true, deleted: results.playersDeleted ?? 0, related });
}));

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
  if (count !== undefined) updates.push({ key: 'mock_bot_count', value: String(Math.max(1, Math.min(500, count))) });
  if (balance !== undefined) updates.push({ key: 'mock_bot_balance', value: String(Math.max(0, balance)) });
  if (stakes !== undefined) {
    const valid = stakes.filter((s) => [10, 20, 50].includes(s));
    updates.push({ key: 'mock_bot_stakes', value: valid.join(',') });
  }
  for (const { key, value } of updates) {
    await prisma.config.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  invalidateConfigCache();
  res.json({ success: true });
});

// POST /api/admin/mock-players/bot-trigger/:roundId
router.post('/bot-trigger/:roundId', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { roundId } = req.params as { roundId: string };
  const { MockPlayerBotService } = await import('../../services/mock-player-bot.service.js');
  void MockPlayerBotService.onRoundPending(roundId);
  res.json({ success: true, message: 'Mock bot triggered for round' });
}));

export default router;