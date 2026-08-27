// Admin games stats endpoint
// GET /api/admin/games/stats — per-game transaction totals, profit/loss

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

// GET /api/admin/games/stats
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  const [
    bingoStats,
    crashStats,
    kenoStats,
    slotsStats,
    recentBingo,
    recentCrash,
    recentKeno,
    recentSlots,
  ] = await Promise.all([
    // Bingo (GameRound + round_entries)
    prisma.gameRound.aggregate({
      where: { status: 'completed' },
      _sum: { derash: true },
      _count: { id: true },
    }),
    // Crash bets
    prisma.crashBet.aggregate({
      _sum: { bet_amount: true, payout: true },
      _count: { id: true },
    }),
    // Keno bets
    prisma.kenoBet.aggregate({
      _sum: { bet_amount: true, payout: true },
      _count: { id: true },
    }),
    // Slots spins
    prisma.slotSpin.aggregate({
      _sum: { bet_amount: true, total_win: true },
      _count: { id: true },
    }),

    // Recent bingo rounds (last 50)
    prisma.gameRound.findMany({
      where: { status: { in: ['completed', 'cancelled', 'void'] } },
      orderBy: { ended_at: 'desc' },
      take: 50,
      select: {
        id: true,
        stake: true,
        derash: true,
        status: true,
        ended_at: true,
        start_time: true,
        _count: { select: { round_entries: true } },
      },
    }),
    // Recent crash rounds (last 50)
    prisma.crashRound.findMany({
      where: { status: 'crashed' },
      orderBy: { crashed_at: 'desc' },
      take: 50,
      include: {
        _count: { select: { bets: true } },
        bets: {
          select: { bet_amount: true, payout: true },
        },
      },
    }),
    // Recent keno rounds (last 50)
    prisma.kenoRound.findMany({
      where: { status: 'finished' },
      orderBy: { finished_at: 'desc' },
      take: 50,
      include: {
        _count: { select: { bets: true } },
        bets: {
          select: { bet_amount: true, payout: true },
        },
      },
    }),
    // Recent slots spins (last 50)
    prisma.slotSpin.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true,
        bet_amount: true,
        total_win: true,
        status: true,
        created_at: true,
        player: { select: { username: true } },
      },
    }),
  ]);

  // Bingo totals
  const bingoTotalIn = await prisma.gameRound.findMany({
    where: { status: 'completed' },
    select: { stake: true, _count: { select: { round_entries: true } } },
  });
  let bingoTotalBets = 0;
  for (const r of bingoTotalIn) {
    bingoTotalBets += Number(r.stake) * r._count.round_entries;
  }
  const bingoPrizesPaid = Number(bingoStats._sum.derash ?? 0);

  const crashTotalBets = Number(crashStats._sum.bet_amount ?? 0);
  const crashTotalPaid = Number(crashStats._sum.payout ?? 0);

  const kenoTotalBets = Number(kenoStats._sum.bet_amount ?? 0);
  const kenoTotalPaid = Number(kenoStats._sum.payout ?? 0);

  const slotsTotalBets = Number(slotsStats._sum.bet_amount ?? 0);
  const slotsTotalWins = Number(slotsStats._sum.total_win ?? 0);

  res.json({
    games: [
      {
        key: 'bingo',
        name: 'Bingo',
        icon: '🎯',
        totalRounds: bingoStats._count.id,
        totalBets: bingoTotalBets,
        totalPaid: bingoPrizesPaid,
        profit: bingoTotalBets - bingoPrizesPaid,
      },
      {
        key: 'crash',
        name: 'Crash',
        icon: '🚀',
        totalRounds: crashStats._count.id,
        totalBets: crashTotalBets,
        totalPaid: crashTotalPaid,
        profit: crashTotalBets - crashTotalPaid,
      },
      {
        key: 'keno',
        name: 'Keno',
        icon: '🎱',
        totalRounds: kenoStats._count.id,
        totalBets: kenoTotalBets,
        totalPaid: kenoTotalPaid,
        profit: kenoTotalBets - kenoTotalPaid,
      },
      {
        key: 'slots',
        name: 'Slots',
        icon: '🎰',
        totalRounds: slotsStats._count.id,
        totalBets: slotsTotalBets,
        totalPaid: slotsTotalWins,
        profit: slotsTotalBets - slotsTotalWins,
      },
    ],
    transactions: {
      bingo: recentBingo.map((r) => ({
        id: r.id,
        type: r.status,
        totalBet: Number(r.stake) * r._count.round_entries,
        paid: Number(r.derash),
        profit: Number(r.stake) * r._count.round_entries - Number(r.derash),
        players: r._count.round_entries,
        date: (r.ended_at ?? r.start_time).toISOString(),
      })),
      crash: recentCrash.map((r) => {
        const totalBet = r.bets.reduce((s, b) => s + Number(b.bet_amount), 0);
        const totalPaid = r.bets.reduce((s, b) => s + Number(b.payout ?? 0), 0);
        return {
          id: r.id,
          type: 'crashed',
          totalBet,
          paid: totalPaid,
          profit: totalBet - totalPaid,
          players: r._count.bets,
          crashPoint: r.crash_point,
          date: (r.crashed_at ?? r.created_at).toISOString(),
        };
      }),
      keno: recentKeno.map((r) => {
        const totalBet = r.bets.reduce((s, b) => s + Number(b.bet_amount), 0);
        const totalPaid = r.bets.reduce((s, b) => s + Number(b.payout ?? 0), 0);
        return {
          id: r.id,
          type: 'finished',
          totalBet,
          paid: totalPaid,
          profit: totalBet - totalPaid,
          players: r._count.bets,
          date: (r.finished_at ?? r.created_at).toISOString(),
        };
      }),
      slots: recentSlots.map((s) => ({
        id: s.id,
        type: s.status,
        username: s.player.username,
        totalBet: Number(s.bet_amount),
        paid: Number(s.total_win),
        profit: Number(s.bet_amount) - Number(s.total_win),
        players: 1,
        date: s.created_at.toISOString(),
      })),
    },
  });
});

export default router;
