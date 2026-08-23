// Mock Player Bot Service
// Auto-joins mock players into pending rounds with a 1-second stagger between each join.
// Controlled by config keys:
//   mock_bot_enabled        — "true" / "false"  (default: false)
//   mock_bot_count          — how many mock players per round  (default: 3)
//   mock_bot_balance        — balance credited to each before joining (default: 0 = auto-cover stake)

import prisma from '../lib/prisma.js';
import { WalletService } from './wallet.service.js';
import { GameRoundService } from './game-round.service.js';
import { TxType, WalletType } from '@fidel/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockPlayerRow {
  id: string;
  username: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isEnabled(): Promise<boolean> {
  const row = await prisma.config.findUnique({ where: { key: 'mock_bot_enabled' } });
  return row?.value === 'true';
}

async function getBotCount(): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key: 'mock_bot_count' } });
  const n = row ? parseInt(row.value, 10) : 3;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : 3;
}

async function getBotBalance(): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key: 'mock_bot_balance' } });
  const n = row ? parseFloat(row.value) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
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
      const [botCount, botBalance, allMockPlayers] = await Promise.all([
        getBotCount(),
        getBotBalance(),
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

      // Build shuffled available cartela pool
      const available = shuffle(
        Array.from({ length: 800 }, (_, i) => i + 1).filter((n) => !takenSet.has(n)),
      );

      if (available.length < selected.length) {
        console.log(`[MockBot] Not enough cartelas for round ${roundId}`);
        return;
      }

      console.log(`[MockBot] Auto-joining ${selected.length} mock players into round ${roundId}`);

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
        } catch (err) {
          console.error(`[MockBot] Failed to join ${player.username} into round ${roundId}:`, err);
        }
      }
    } catch (err) {
      console.error(`[MockBot] onRoundPending error for round ${roundId}:`, err);
    }
  },
};
