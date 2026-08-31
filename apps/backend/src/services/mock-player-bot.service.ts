// Mock Player Bot Service
// Auto-joins mock players into pending rounds with a 1-second stagger between each join.
// Controlled by config keys:
//   mock_bot_enabled        — "true" / "false"  (default: false)
//   mock_bot_count          — how many mock players per round  (default: 3)
//   mock_bot_balance        — balance credited to each before joining (default: 0 = auto-cover stake)
//   mock_bot_win_enabled    — "true" / "false"  (default: false)
//     When true, one randomly selected mock player is guaranteed to win by
//     having their cartela grid updated to match a winning line from the
//     called numbers once 5 numbers have been drawn.

import prisma from '../lib/prisma.js';
import { WalletService } from './wallet.service.js';
import { GameRoundService } from './game-round.service.js';
import { nce } from './nce.service.js';
import { TxType, WalletType } from '@fidel/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockPlayerRow {
  id: string;
  username: string;
}

// ─── Win-bot state ────────────────────────────────────────────────────────────

/**
 * Tracks which round has a designated winner mock player and which cartela
 * number they hold so we can inject a winning grid once numbers are drawn.
 */
const pendingWins = new Map<string, { playerId: string; cartelaNumber: number }>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isEnabled(): Promise<boolean> {
  const row = await prisma.config.findUnique({ where: { key: 'mock_bot_enabled' } });
  return row?.value === 'true';
}

async function isWinEnabled(): Promise<boolean> {
  const row = await prisma.config.findUnique({ where: { key: 'mock_bot_win_enabled' } });
  return row?.value === 'true';
}

async function getBotCount(): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key: 'mock_bot_count' } });
  const n = row ? parseInt(row.value, 10) : 3;
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

async function getBotBalance(): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key: 'mock_bot_balance' } });
  const n = row ? parseFloat(row.value) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Read allowed stakes for the bot (defaults to all: 10, 20, 50). */
async function getBotStakes(): Promise<Set<number>> {
  const row = await prisma.config.findUnique({ where: { key: 'mock_bot_stakes' } });
  const raw = row?.value ?? '10,20,50';
  const stakes = raw.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  return new Set(stakes.length ? stakes : [10, 20, 50]);
}

/** Read the active cartela pool size (same config the rounds router uses). */
async function getCartelaPoolSize(): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key: 'active_cartela_count' } });
  const n = row ? parseInt(row.value, 10) : 800;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 800) : 800;
}

/** Fisher-Yates shuffle — returns a new shuffled array */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a bingo grid (25 numbers, index 12 = free space = 0) where
 * the first row is filled with `winLine` numbers (guaranteed winning line)
 * and the rest of the grid is padded with unique numbers not in the called set.
 *
 * BINGO columns: B=1-15, I=16-30, N=31-45, G=46-60, O=61-75
 */
function buildWinningGrid(winLine: number[]): number[] {
  // Standard BINGO column ranges
  const colRanges = [
    { min: 1,  max: 15 },  // B col 0
    { min: 16, max: 30 },  // I col 1
    { min: 31, max: 45 },  // N col 2
    { min: 46, max: 60 },  // G col 3
    { min: 61, max: 75 },  // O col 4
  ];

  const used = new Set(winLine);
  const grid: number[] = Array(25).fill(0);

  // Place the winning line in the first row (indices 0-4)
  for (let col = 0; col < 5; col++) {
    grid[col] = winLine[col]!;
  }

  // Fill remaining cells with valid column-range numbers not already used
  for (let row = 1; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const idx = row * 5 + col;
      if (idx === 12) { grid[idx] = 0; continue; } // free space
      const range = colRanges[col]!;
      let num: number;
      do {
        num = range.min + Math.floor(Math.random() * (range.max - range.min + 1));
      } while (used.has(num));
      used.add(num);
      grid[idx] = num;
    }
  }

  return grid;
}

/**
 * Given a set of called numbers, try to find 5 numbers that form a valid
 * BINGO winning line (one number per column with correct column constraints).
 * Returns the 5 numbers if found, or null.
 *
 * BINGO columns: B=1-15, I=16-30, N=31-45, G=46-60, O=61-75
 */
function findWinLineFromCalled(calledSet: Set<number>): number[] | null {
  const colRanges = [
    { min: 1,  max: 15 },  // B
    { min: 16, max: 30 },  // I
    { min: 31, max: 45 },  // N
    { min: 46, max: 60 },  // G
    { min: 61, max: 75 },  // O
  ];

  // Bucket called numbers by column
  const buckets: number[][] = colRanges.map(({ min, max }) =>
    [...calledSet].filter((n) => n >= min && n <= max),
  );

  // Need at least one called number in each column
  if (buckets.some((b) => b.length === 0)) return null;

  // Pick one from each bucket
  return buckets.map((b) => b[Math.floor(Math.random() * b.length)]!);
}

/**
 * Called after each number is drawn for a round that has a pending mock winner.
 * Once we have at least one called number in every BINGO column, we inject a
 * winning grid for the mock player's cartela and clear NCE's cache so the next
 * win-detection pass picks it up immediately.
 */
async function tryInjectWin(roundId: string, calledSet: Set<number>): Promise<void> {
  const info = pendingWins.get(roundId);
  if (!info) return;

  // Wait until at least 10 numbers have been called before injecting a win
  if (calledSet.size < 10) return;

  const winLine = findWinLineFromCalled(calledSet);
  if (!winLine) return; // Not enough coverage yet

  // Remove from pending — we only inject once
  pendingWins.delete(roundId);

  try {
    const winningGrid = buildWinningGrid(winLine);

    // Upsert the cartela definition with the winning grid
    await prisma.cartelaDefinition.upsert({
      where: { cartela_number: info.cartelaNumber },
      update: { grid: winningGrid },
      create: { cartela_number: info.cartelaNumber, grid: winningGrid },
    });

    // Invalidate NCE's cached grid so it re-reads on next win-check
    nce.clearGridCache(roundId);

    console.log(
      `[MockBot] Injected winning grid for player ${info.playerId} ` +
      `cartela #${info.cartelaNumber} in round ${roundId} | win line: ${winLine.join(',')}`,
    );
  } catch (err) {
    console.error(`[MockBot] Failed to inject win for round ${roundId}:`, err);
    // Re-register so we retry on next number
    pendingWins.set(roundId, info);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const MockPlayerBotService = {
  /**
   * Called whenever a new pending round is created (from RoundScheduler or admin).
   * Picks a random subset of mock players and staggers their join by 1s each.
   */
  async onRoundPending(roundId: string): Promise<void> {
    try {
      if (!(await isEnabled())) return;

      const round = await prisma.gameRound.findUnique({
        where: { id: roundId },
        select: { id: true, status: true, stake: true },
      });
      if (!round || round.status !== 'pending') return;

      const stake = parseFloat(round.stake.toString());

      // Only proceed if this round's stake is in the configured bot stakes
      const allowedStakes = await getBotStakes();
      if (!allowedStakes.has(stake)) {
        console.log(`[MockBot] Skipping round ${roundId} — stake ${stake} not in allowed set [${[...allowedStakes].join(',')}]`);
        return;
      }

      const [botCount, botBalance, winEnabled, poolSize, allMockPlayers] = await Promise.all([
        getBotCount(),
        getBotBalance(),
        isWinEnabled(),
        getCartelaPoolSize(),
        prisma.$queryRaw<MockPlayerRow[]>`
          SELECT id, username FROM players WHERE is_mock = true AND is_suspended = false
        `,
      ]);

      if (!allMockPlayers.length) return;

      // Pick a random subset
      const selected = shuffle(allMockPlayers).slice(0, botCount);

      // Get already-taken cartelas
      const taken = await prisma.roundEntry.findMany({
        where: { round_id: roundId },
        select: { cartela_number: true },
      });
      const takenSet = new Set(taken.map((e) => e.cartela_number));

      // Build shuffled available cartela pool — capped to active_cartela_count so we
      // never pick a cartela number that has no CartelaDefinition row in the DB.
      const available = shuffle(
        Array.from({ length: poolSize }, (_, i) => i + 1).filter((n) => !takenSet.has(n)),
      );

      if (available.length < selected.length) {
        console.log(`[MockBot] Not enough cartelas for round ${roundId}`);
        return;
      }

      // Designate one player as the guaranteed winner (first in shuffled list)
      const winnerIndex = winEnabled ? 0 : -1;

      console.log(`[MockBot] Auto-joining ${selected.length} mock players into round ${roundId}${winEnabled ? ' (win mode ON)' : ''}`);

      for (let i = 0; i < selected.length; i++) {
        const player = selected[i]!;
        const cartelaNumber = available[i]!;

        // Stagger: 1 second between each player (0s, 1s, 2s, …)
        if (i > 0) await sleep(1_000);

        try {
          // Re-check round is still pending before each join
          const current = await prisma.gameRound.findUnique({
            where: { id: roundId },
            select: { status: true },
          });
          if (!current || current.status !== 'pending') {
            console.log(`[MockBot] Round ${roundId} no longer pending — stopping at player ${i + 1}`);
            break;
          }

          // Ensure sufficient balance
          if (botBalance > 0) {
            await WalletService.credit(
              player.id,
              WalletType.play,
              botBalance,
              TxType.admin_credit,
              `mock_bot_${roundId}_${i}`,
              'Mock bot auto-credit',
            );
          } else {
            // Auto-cover: top up just enough for the stake
            const [walletRow] = await prisma.$queryRaw<Array<{ total: string }>>`
              SELECT COALESCE(SUM(balance), 0) AS total FROM wallets WHERE player_id = ${player.id}
            `;
            const totalBal = Number(walletRow?.total ?? 0);
            if (totalBal < stake) {
              await WalletService.credit(
                player.id,
                WalletType.play,
                stake - totalBal,
                TxType.admin_credit,
                `mock_bot_stake_${roundId}_${i}`,
                'Mock bot auto stake cover',
              );
            }
          }

          await GameRoundService.joinBatch(roundId, player.id, [cartelaNumber]);
          console.log(`[MockBot] ${player.username} joined round ${roundId} with cartela #${cartelaNumber}`);

          // Register win intent for designated winner
          if (winEnabled && i === winnerIndex) {
            pendingWins.set(roundId, { playerId: player.id, cartelaNumber });
            console.log(`[MockBot] ${player.username} designated as winner for round ${roundId} (cartela #${cartelaNumber})`);
          }
        } catch (err) {
          console.error(`[MockBot] Failed to join ${player.username} into round ${roundId}:`, err);
        }
      }
    } catch (err) {
      console.error(`[MockBot] onRoundPending error for round ${roundId}:`, err);
    }
  },

  /**
   * Called after each number is drawn in an active round.
   * If there is a pending mock winner for this round, attempts to inject a
   * winning grid once the called set covers all 5 BINGO columns.
   */
  async onNumberCalled(roundId: string, calledNumbers: number[]): Promise<void> {
    if (!pendingWins.has(roundId)) return;
    await tryInjectWin(roundId, new Set(calledNumbers));
  },

  /** Clean up any pending win state when a round ends (void/cancel/complete). */
  onRoundEnded(roundId: string): void {
    pendingWins.delete(roundId);
  },
};
