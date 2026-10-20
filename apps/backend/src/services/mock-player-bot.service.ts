// Mock Player Bot Service
// Auto-joins mock players into pending rounds with a 300ms stagger between each join.
// Controlled by config keys:
//   mock_bot_enabled        — "true" / "false"  (default: false)
//   mock_bot_count          — how many mock players per round  (default: 3)
//   mock_bot_balance        — balance credited to each before joining (default: 0 = auto-cover stake)
//   mock_bot_win_enabled    — "true" / "false"  (default: false)
//     When true, the system pre-simulates the full 75-number draw sequence against
//     all cartela definitions BEFORE the round starts. It finds which cartela wins
//     first under the round's winning_pattern, assigns that cartela to the designated
//     mock player, then stores the pre-generated sequence so NCE uses it verbatim.
//     No grid injection is needed — the real cartela wins naturally.

import prisma from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { WalletService } from './wallet.service.js';
import { GameRoundService } from './game-round.service.js';
import { nce } from './nce.service.js';
import { TxType, WalletType } from '@fidel/shared';
import { shuffle } from '../lib/shuffle.js';
import { getConfigBool, getConfigInt, getConfigFloat, getConfigOrDefault } from '../lib/config-cache.js';
import { checkWin } from './win-detection.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockPlayerRow {
  id: string;
  username: string;
}

interface ProcessedCartela {
  cartela_number: number;
  grid: number[];
}

// ─── Cartela definition cache ─────────────────────────────────────────────────
// Cartela definitions are immutable after creation, so we cache them in memory
// keyed by poolSize to avoid a full DB load on every pending round.

const cartelaDefsCache = new Map<number, { defs: ProcessedCartela[]; loadedAt: number }>();
const CARTELA_CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const CARTELA_CACHE_MAX_ENTRIES = 3; // Only keep last 3 pool sizes to cap memory

async function getProcessedCartelas(poolSize: number): Promise<ProcessedCartela[]> {
  const cached = cartelaDefsCache.get(poolSize);
  if (cached && Date.now() - cached.loadedAt < CARTELA_CACHE_TTL_MS) {
    return cached.defs;
  }
  const rows = await prisma.cartelaDefinition.findMany({
    where: { cartela_number: { lte: poolSize } },
    select: { cartela_number: true, grid: true },
  });
  // Pre-process: replace free space (index 12) with 0 once, not on every simulation tick
  const defs: ProcessedCartela[] = rows.map((c) => {
    const g = (c.grid as number[]).slice();
    g[12] = 0;
    return { cartela_number: c.cartela_number, grid: g };
  });
  // Evict oldest entry if at capacity
  if (cartelaDefsCache.size >= CARTELA_CACHE_MAX_ENTRIES) {
    const oldestKey = cartelaDefsCache.keys().next().value;
    if (oldestKey !== undefined) cartelaDefsCache.delete(oldestKey);
  }
  cartelaDefsCache.set(poolSize, { defs, loadedAt: Date.now() });
  return defs;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isEnabled(): Promise<boolean> {
  return getConfigBool('mock_bot_enabled', false);
}

async function isWinEnabled(): Promise<boolean> {
  return getConfigBool('mock_bot_win_enabled', false);
}

async function getBotCount(): Promise<number> {
  const n = await getConfigInt('mock_bot_count', 3);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

async function getBotBalance(): Promise<number> {
  const n = await getConfigFloat('mock_bot_balance', 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function getBotStakes(): Promise<Set<number>> {
  const raw = await getConfigOrDefault('mock_bot_stakes', '10,20,50');
  const stakes = raw.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  return new Set(stakes.length ? stakes : [10, 20, 50]);
}

async function getCartelaPoolSize(): Promise<number> {
  const n = await getConfigInt('active_cartela_count', 800);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 800) : 800;
}

// ─── Pre-simulation ───────────────────────────────────────────────────────────

interface SimulationResult {
  /** The pre-generated 1–75 draw sequence */
  sequence: number[];
  /** The cartela number that wins first under the round's winning_pattern */
  winningCartelaNumber: number;
  /** How many numbers are called before that cartela wins */
  numbersUntilWin: number;
}

// ─── Win timing config ────────────────────────────────────────────────────────
// The mock winner cartela is required to win within this called-number window.
// This prevents wins that happen too early (uncomfortable for real players).
const WIN_TIMING_MIN = 16; // earliest acceptable win (inclusive)
const WIN_TIMING_MAX = 20; // latest acceptable win (inclusive)
const WIN_TIMING_MAX_ATTEMPTS = 30; // max shuffle attempts before giving up

/**
 * Pre-generate a full 75-number shuffle and simulate the game against all
 * cartela definitions up to `poolSize`. Returns which cartela wins first
 * and the sequence NCE should use so the result is guaranteed.
 *
 * The winning cartela is guaranteed to win between called numbers
 * WIN_TIMING_MIN and WIN_TIMING_MAX (inclusive). If a random shuffle
 * produces a win outside that window, we reshuffle up to
 * WIN_TIMING_MAX_ATTEMPTS times before giving up.
 *
 * Uses the round's `winning_pattern` for accurate win detection.
 */
async function preSimulateRound(
  poolSize: number,
  winningPattern: string,
): Promise<SimulationResult | null> {
  // Load cartela definitions from cache (avoids a full DB scan every 40s per stake)
  const processedCartelas = await getProcessedCartelas(poolSize);
  if (!processedCartelas.length) return null;

  // Parse the pattern (may be JSON array or single string)
  let patterns: string[];
  if (winningPattern.trimStart().startsWith('[')) {
    try {
      const parsed = JSON.parse(winningPattern) as unknown;
      patterns = Array.isArray(parsed) && parsed.length > 0 ? (parsed as string[]) : ['any_line'];
    } catch {
      patterns = ['any_line'];
    }
  } else {
    patterns = [winningPattern || 'any_line'];
  }

  /**
   * Simulate one shuffle against a SINGLE cartela.
   * Returns how many numbers are called before that cartela wins, or null if
   * it never wins in 75 numbers.
   *
   * We check each cartela in isolation so that other cartelas winning early
   * does NOT disqualify a sequence — real players are always allowed to win.
   */
  function simulateOne(seq: number[], cartela: ProcessedCartela): number | null {
    const calledSet = new Set<number>();
    for (let i = 0; i < seq.length; i++) {
      calledSet.add(seq[i]!);
      const { won } = checkWin(cartela.grid, calledSet, patterns);
      if (won) return i + 1;
    }
    return null;
  }

  // Try up to WIN_TIMING_MAX_ATTEMPTS shuffles.
  // For each shuffle, scan every cartela and pick one that wins in [MIN, MAX].
  // We check each cartela independently so other cartelas winning earlier is fine —
  // real players holding those cartelas will legitimately win first.
  for (let attempt = 0; attempt < WIN_TIMING_MAX_ATTEMPTS; attempt++) {
    const sequence = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));

    // Collect all cartelas whose win step falls in [WIN_TIMING_MIN, WIN_TIMING_MAX]
    const candidates: Array<{ cartela: ProcessedCartela; numbersUntilWin: number }> = [];
    for (const cartela of processedCartelas) {
      const step = simulateOne(sequence, cartela);
      if (step !== null && step >= WIN_TIMING_MIN && step <= WIN_TIMING_MAX) {
        candidates.push({ cartela, numbersUntilWin: step });
      }
    }

    if (candidates.length > 0) {
      // Pick a random candidate from those that hit the window
      const picked = candidates[Math.floor(Math.random() * candidates.length)]!;
      console.log(
        `[MockBot] Pre-sim attempt ${attempt + 1}: cartela #${picked.cartela.cartela_number} ` +
        `wins at call ${picked.numbersUntilWin} ✓ (${candidates.length} candidates in window)`,
      );
      return {
        sequence,
        winningCartelaNumber: picked.cartela.cartela_number,
        numbersUntilWin: picked.numbersUntilWin,
      };
    }

    console.log(`[MockBot] Pre-sim attempt ${attempt + 1}: no cartela wins in [${WIN_TIMING_MIN},${WIN_TIMING_MAX}], retrying...`);
  }

  // All attempts exhausted — fall back: pick whatever cartela wins first on a fresh shuffle
  console.log(`[MockBot] Could not find win in [${WIN_TIMING_MIN},${WIN_TIMING_MAX}] after ${WIN_TIMING_MAX_ATTEMPTS} attempts — using best available`);
  const fallbackSeq = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));
  let fallbackWinner: { cartelaNumber: number; numbersUntilWin: number } | null = null;
  for (const cartela of processedCartelas) {
    const step = simulateOne(fallbackSeq, cartela);
    if (step !== null && (fallbackWinner === null || step < fallbackWinner.numbersUntilWin)) {
      fallbackWinner = { cartelaNumber: cartela.cartela_number, numbersUntilWin: step };
    }
  }
  if (!fallbackWinner) return null;

  return {
    sequence: fallbackSeq,
    winningCartelaNumber: fallbackWinner.cartelaNumber,
    numbersUntilWin: fallbackWinner.numbersUntilWin,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const MockPlayerBotService = {
  /**
   * Called whenever a new pending round is created (from RoundScheduler or admin).
   * Picks a random subset of mock players and staggers their join by 300ms each.
   *
   * When win mode is enabled:
   *  1. Pre-simulates the full 75-number draw to find the naturally winning cartela.
   *  2. Assigns that cartela number to the designated mock player.
   *  3. Registers the sequence with NCE so it plays out exactly as simulated.
   */
  async onRoundPending(roundId: string): Promise<void> {
    try {
      if (!(await isEnabled())) return;

      const round = await prisma.gameRound.findUnique({
        where: { id: roundId },
        select: { id: true, status: true, stake: true, winning_pattern: true },
      });
      if (!round || round.status !== 'pending') return;

      const stake = parseFloat(round.stake.toString());
      const winningPattern = round.winning_pattern ?? 'any_line';

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

      const selected = shuffle(allMockPlayers).slice(0, botCount);

      // Get already-taken cartelas
      const taken = await prisma.roundEntry.findMany({
        where: { round_id: roundId },
        select: { cartela_number: true },
      });
      const takenSet = new Set(taken.map((e) => e.cartela_number));

      // ── Pre-simulate to find the winning cartela number ───────────────────
      let predeterminedWinnerCartelaNumber: number | null = null;
      let preGeneratedSequence: number[] | null = null;

      if (winEnabled) {
        const sim = await preSimulateRound(poolSize, winningPattern);
        if (sim && !takenSet.has(sim.winningCartelaNumber)) {
          predeterminedWinnerCartelaNumber = sim.winningCartelaNumber;
          preGeneratedSequence = sim.sequence;
          // Register the sequence with NCE now — before the round goes active
          nce.setPreGeneratedSequence(roundId, sim.sequence);
          console.log(
            `[MockBot] Pre-simulated round ${roundId}: cartela #${sim.winningCartelaNumber} wins ` +
            `after ${sim.numbersUntilWin} numbers (pattern: ${winningPattern})`,
          );
        } else {
          console.log(`[MockBot] Pre-simulation found no usable winner for round ${roundId} — win mode disabled for this round`);
        }
      }

      // Build the available cartela pool, ensuring the winning cartela is reserved
      // for the designated mock player (index 0) and not accidentally assigned to others
      let available = shuffle(
        Array.from({ length: poolSize }, (_, i) => i + 1).filter((n) => !takenSet.has(n)),
      );

      if (predeterminedWinnerCartelaNumber !== null) {
        // Remove the winning cartela from the pool — it will be injected at index 0
        available = available.filter((n) => n !== predeterminedWinnerCartelaNumber);
        // Put the winning cartela at the front so player[0] gets it
        available.unshift(predeterminedWinnerCartelaNumber);
      }

      if (available.length < selected.length) {
        console.log(`[MockBot] Not enough cartelas for round ${roundId}`);
        return;
      }

      console.log(
        `[MockBot] Auto-joining ${selected.length} mock players into round ${roundId}` +
        (predeterminedWinnerCartelaNumber !== null ? ` (pre-sim win: cartela #${predeterminedWinnerCartelaNumber})` : ''),
      );

      // Verify round is still pending before bulk join
      const current = await prisma.gameRound.findUnique({
        where: { id: roundId },
        select: { status: true, start_time: true },
      });
      if (!current || current.status !== 'pending') {
        console.log(`[MockBot] Round ${roundId} no longer pending — aborting`);
        return;
      }

      // Push start_time forward to give us a safe window for crediting + inserting
      await prisma.gameRound.update({
        where: { id: roundId },
        data: { start_time: new Date(Date.now() + 45 * 1000) },
      });

      // Credit all players upfront sequentially
      for (let i = 0; i < selected.length; i++) {
        const player = selected[i]!;
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
          const walletRow = await prisma.wallet.findFirst({
            where: { player_id: player.id, type: 'main' as any },
            select: { balance: true },
          });
          const totalBal = Number(walletRow?.balance ?? 0);
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
      }

      // Bulk insert all round entries at once
      await prisma.roundEntry.createMany({
        data: selected.map((player, i) => ({
          round_id: roundId,
          player_id: player.id,
          cartela_number: available[i]!,
          is_watching: false,
        })),
        skipDuplicates: true,
      });

      // Deduct stake from each mock player so game_entry transactions exist
      // This ensures derash is correctly calculated from actual payments
      for (let i = 0; i < selected.length; i++) {
        const player = selected[i]!;
        try {
          await WalletService.debit(
            player.id,
            WalletType.play,
            stake,
            TxType.game_entry,
            roundId,
            'Mock bot game entry',
          );
        } catch {
          // If insufficient funds, try main wallet
          try {
            await WalletService.debit(
              player.id,
              WalletType.main,
              stake,
              TxType.game_entry,
              roundId,
              'Mock bot game entry',
            );
          } catch { /* ignore — mock player may have zero balance */ }
        }
      }

      // Recalculate derash and reset start_time to now+40s so the countdown
      // always shows ~40s from when mock players finish joining (not from round creation)
      const entryCount = await prisma.roundEntry.count({ where: { round_id: roundId, is_watching: false } });
      const roundForDerash = await prisma.gameRound.findUnique({ where: { id: roundId }, select: { stake: true, commission_pct: true } });
      if (roundForDerash) {
        const s = parseFloat(roundForDerash.stake.toString());
        await prisma.gameRound.update({
          where: { id: roundId },
          data: {
            derash: entryCount * s * (1 - roundForDerash.commission_pct / 100),
            start_time: new Date(Date.now() + 40 * 1000),
          },
        });
      }

      console.log(`[MockBot] Bulk-joined ${selected.length} mock players into round ${roundId}`);
      if (predeterminedWinnerCartelaNumber !== null) {
        console.log(`[MockBot] Predetermined winner: cartela #${predeterminedWinnerCartelaNumber} → ${selected[0]!.username}`);
      }

      // Broadcast CARTELA_TAKEN so clients update derash and player count instantly
      if (GameRoundService._onCartelaTaken) {
        const finalCount = await prisma.roundEntry.count({ where: { round_id: roundId, is_watching: false } });
        const allCartelas = selected.map((_, i) => available[i]!);
        await GameRoundService._onCartelaTaken(roundId, allCartelas, finalCount, undefined);
      }
    } catch (err) {
      console.error(`[MockBot] onRoundPending error for round ${roundId}:`, err);
    }
  },

  /** Clean up any pre-generated sequence state when a round ends (void/cancel/complete). */
  onRoundEnded(roundId: string): void {
    // NCE's stop() already clears preGeneratedSequences, but belt-and-suspenders:
    nce.stop(roundId);
  },
};
