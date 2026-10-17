// Engagement Service
// Daily login bonus, streak rewards, referral leaderboard, auto-rejoin

import { TxType } from '@fidel/shared';
import prisma from '../lib/prisma.js';
import { getConfigInt, getConfigOrDefault } from '../lib/config-cache.js';

// ─── Daily bonus config ───────────────────────────────────────────────────────
// Config keys:
//   daily_bonus_base      — base ETB credited each day (default 3)
//   streak_bonus_3        — bonus ETB at 3-day streak (default 5)
//   streak_bonus_7        — bonus ETB at 7-day streak (default 15)
//   streak_bonus_14       — bonus ETB at 14-day streak (default 30)
//   streak_bonus_30       — bonus ETB at 30-day streak (default 75)

async function getDailyBonusAmount(streak: number): Promise<number> {
  const [base, b3, b7, b14, b30] = await Promise.all([
    getConfigInt('daily_bonus_base',   3),
    getConfigInt('streak_bonus_3',     5),
    getConfigInt('streak_bonus_7',    15),
    getConfigInt('streak_bonus_14',   30),
    getConfigInt('streak_bonus_30',   75),
  ]);

  let extra = 0;
  if (streak >= 30) extra = b30;
  else if (streak >= 14) extra = b14;
  else if (streak >= 7) extra = b7;
  else if (streak >= 3) extra = b3;

  return base + extra;
}

export type DailyBonusResult =
  | { credited: false; reason: 'already_claimed' | 'mock_player' }
  | { credited: true; amount: number; streak: number; longestStreak: number };

export const EngagementService = {
  /**
   * Attempt to credit the daily login bonus to a player.
   * Idempotent — safe to call on every /start; only credits once per calendar day.
   */
  async claimDailyBonus(playerId: string): Promise<DailyBonusResult> {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: {
        is_mock: true,
        login_streak: true,
        longest_streak: true,
        last_login_date: true,
        daily_bonus_claimed_at: true,
      },
    });

    if (!player || player.is_mock) return { credited: false, reason: 'mock_player' };

    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

    // Already claimed today
    if (player.daily_bonus_claimed_at) {
      const claimedStr = player.daily_bonus_claimed_at.toISOString().slice(0, 10);
      if (claimedStr === todayStr) return { credited: false, reason: 'already_claimed' };
    }

    // Calculate new streak
    let newStreak = 1;
    if (player.last_login_date) {
      const lastStr = player.last_login_date.toISOString().slice(0, 10);
      const diff = Math.round(
        (new Date(todayStr).getTime() - new Date(lastStr).getTime()) / 86_400_000,
      );
      newStreak = diff === 1 ? player.login_streak + 1 : 1;
    }

    const newLongest = Math.max(newStreak, player.longest_streak);
    const amount = await getDailyBonusAmount(newStreak);
    const today = new Date(todayStr);

    await prisma.$transaction(async (tx) => {
      // Update streak + claim date
      await tx.player.update({
        where: { id: playerId },
        data: {
          login_streak:           newStreak,
          longest_streak:         newLongest,
          last_login_date:        today,
          daily_bonus_claimed_at: today,
        },
      });

      // Credit play wallet
      const wallet = await tx.wallet.findFirst({
        where: { player_id: playerId, type: 'play' },
        select: { id: true },
      });
      if (!wallet) return;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });
      await tx.transaction.create({
        data: {
          wallet_id:    wallet.id,
          type:         TxType.bonus,
          amount,
          reference_id: `daily_bonus_${todayStr}`,
          note:         `Daily login bonus — Day ${newStreak}`,
        },
      });
    });

    return { credited: true, amount, streak: newStreak, longestStreak: newLongest };
  },

  /** Return the top N referrers by count of players they've invited. */
  async getReferralLeaderboard(limit = 10): Promise<
    Array<{ username: string; referralCount: number; rank: number }>
  > {
    const rows = await prisma.player.findMany({
      where: { referrals: { some: {} }, is_mock: false },
      select: {
        username: true,
        _count: { select: { referrals: true } },
      },
      orderBy: { referrals: { _count: 'desc' } },
      take: limit,
    });

    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      referralCount: r._count.referrals,
    }));
  },

  /** Save auto-rejoin cartela preference for a player. Pass null to clear it. */
  async setAutoRejoin(playerId: string, cartelaNumber: number | null): Promise<void> {
    await prisma.player.update({
      where: { id: playerId },
      data: { auto_rejoin_cartela: cartelaNumber },
    });
  },

  /** Get the player's saved auto-rejoin cartela number, or null if not set. */
  async getAutoRejoin(playerId: string): Promise<number | null> {
    const p = await prisma.player.findUnique({
      where: { id: playerId },
      select: { auto_rejoin_cartela: true },
    });
    return p?.auto_rejoin_cartela ?? null;
  },
};
