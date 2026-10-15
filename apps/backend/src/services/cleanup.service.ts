// Cleanup Service — keeps last 24 records per game history table, runs daily at 3 AM

import prisma from '../lib/prisma.js';

const KEEP = 24;

export async function runDatabaseCleanup(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};

  // ── Bingo rounds ────────────────────────────────────────────────────────────
  const recentBingo = await prisma.gameRound.findMany({
    where:   { status: { in: ['completed', 'cancelled', 'void'] } },
    orderBy: { start_time: 'desc' },
    take:    KEEP,
    select:  { id: true },
  });
  const keepBingo   = recentBingo.map(r => r.id);
  const oldBingo    = await prisma.gameRound.findMany({
    where: {
      status: { in: ['completed', 'cancelled', 'void'] },
      ...(keepBingo.length > 0 ? { id: { notIn: keepBingo } } : {}),
    },
    select: { id: true },
  });
  const oldBingoIds = oldBingo.map(r => r.id);
  if (oldBingoIds.length > 0) {
    results.called_numbers    = (await prisma.calledNumber.deleteMany({ where: { round_id: { in: oldBingoIds } } })).count;
    results.round_bonus_winners = (await prisma.roundBonusWinner.deleteMany({ where: { round_id: { in: oldBingoIds } } })).count;
    results.round_winners     = (await prisma.roundWinner.deleteMany({ where: { round_id: { in: oldBingoIds } } })).count;
    results.round_entries     = (await prisma.roundEntry.deleteMany({ where: { round_id: { in: oldBingoIds } } })).count;
    results.cartela_reservations = (await prisma.cartelaReservation.deleteMany({ where: { round_id: { in: oldBingoIds } } })).count;
    results.bingo_rounds      = (await prisma.gameRound.deleteMany({ where: { id: { in: oldBingoIds } } })).count;
  } else {
    results.bingo_rounds = 0;
  }

  // ── Crash rounds ────────────────────────────────────────────────────────────
  const recentCrash = await prisma.crashRound.findMany({
    where: { status: 'crashed' }, orderBy: { created_at: 'desc' }, take: KEEP, select: { id: true },
  });
  const keepCrash   = recentCrash.map(r => r.id);
  const oldCrash    = await prisma.crashRound.findMany({
    where: { status: 'crashed', ...(keepCrash.length > 0 ? { id: { notIn: keepCrash } } : {}) },
    select: { id: true },
  });
  const oldCrashIds = oldCrash.map(r => r.id);
  if (oldCrashIds.length > 0) {
    results.crash_bets   = (await prisma.crashBet.deleteMany({ where: { round_id: { in: oldCrashIds } } })).count;
    results.crash_rounds = (await prisma.crashRound.deleteMany({ where: { id: { in: oldCrashIds } } })).count;
  } else {
    results.crash_rounds = 0;
  }

  // ── Keno rounds ─────────────────────────────────────────────────────────────
  const recentKeno = await prisma.kenoRound.findMany({
    where: { status: 'finished' }, orderBy: { created_at: 'desc' }, take: KEEP, select: { id: true },
  });
  const keepKeno   = recentKeno.map(r => r.id);
  const oldKeno    = await prisma.kenoRound.findMany({
    where: { status: 'finished', ...(keepKeno.length > 0 ? { id: { notIn: keepKeno } } : {}) },
    select: { id: true },
  });
  const oldKenoIds = oldKeno.map(r => r.id);
  if (oldKenoIds.length > 0) {
    results.keno_bets   = (await prisma.kenoBet.deleteMany({ where: { round_id: { in: oldKenoIds } } })).count;
    results.keno_rounds = (await prisma.kenoRound.deleteMany({ where: { id: { in: oldKenoIds } } })).count;
  } else {
    results.keno_rounds = 0;
  }

  // ── Slot spins ───────────────────────────────────────────────────────────────
  const recentSlots  = await prisma.slotSpin.findMany({ orderBy: { created_at: 'desc' }, take: KEEP, select: { id: true } });
  const keepSlots    = recentSlots.map(r => r.id);
  results.slot_spins = keepSlots.length > 0
    ? (await prisma.slotSpin.deleteMany({ where: { id: { notIn: keepSlots } } })).count : 0;

  // ── Plinko bets ──────────────────────────────────────────────────────────────
  const recentPlinko  = await prisma.plinkoBet.findMany({ orderBy: { created_at: 'desc' }, take: KEEP, select: { id: true } });
  const keepPlinko    = recentPlinko.map(r => r.id);
  results.plinko_bets = keepPlinko.length > 0
    ? (await prisma.plinkoBet.deleteMany({ where: { id: { notIn: keepPlinko } } })).count : 0;

  // ── Royal Drop bets ──────────────────────────────────────────────────────────
  const recentRD        = await prisma.royalDropBet.findMany({ orderBy: { created_at: 'desc' }, take: KEEP, select: { id: true } });
  const keepRD          = recentRD.map(r => r.id);
  results.royal_drop_bets = keepRD.length > 0
    ? (await prisma.royalDropBet.deleteMany({ where: { id: { notIn: keepRD } } })).count : 0;

  // ── Gregmorn transactions ────────────────────────────────────────────────────
  const recentGregTx        = await prisma.gregmornTransaction.findMany({ orderBy: { created_at: 'desc' }, take: KEEP, select: { id: true } });
  const keepGregTx          = recentGregTx.map(r => r.id);
  results.gregmorn_transactions = keepGregTx.length > 0
    ? (await prisma.gregmornTransaction.deleteMany({ where: { id: { notIn: keepGregTx } } })).count : 0;

  // ── Gregmorn sessions ─────────────────────────────────────────────────────────
  const recentGregSess      = await prisma.gregmornSession.findMany({ orderBy: { created_at: 'desc' }, take: KEEP, select: { id: true } });
  const keepGregSess        = recentGregSess.map(r => r.id);
  results.gregmorn_sessions = keepGregSess.length > 0
    ? (await prisma.gregmornSession.deleteMany({ where: { id: { notIn: keepGregSess } } })).count : 0;

  // ── Promotion logs ────────────────────────────────────────────────────────────
  const recentPromoLogs  = await prisma.promotionLog.findMany({ orderBy: { sent_at: 'desc' }, take: KEEP, select: { id: true } });
  const keepPromoLogs    = recentPromoLogs.map(r => r.id);
  results.promotion_logs = keepPromoLogs.length > 0
    ? (await prisma.promotionLog.deleteMany({ where: { id: { notIn: keepPromoLogs } } })).count : 0;

  // ── Expired cartela reservations ──────────────────────────────────────────────
  results.expired_reservations = (await prisma.cartelaReservation.deleteMany({
    where: { expires_at: { lt: new Date() } },
  })).count;

  return results;
}

function msUntil3AM(): number {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(3, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export const CleanupService = {
  _timeoutId:  undefined as NodeJS.Timeout | undefined,
  _intervalId: undefined as NodeJS.Timeout | undefined,

  start(): void {
    if (CleanupService._timeoutId || CleanupService._intervalId) return;
    console.log('[CleanupService] Started — daily run at 3:00 AM, keeping last 24 records per game history table');

    const scheduleNext = () => {
      const delay = msUntil3AM();
      console.log(`[CleanupService] Next cleanup in ${Math.round(delay / 3600000)}h`);
      CleanupService._timeoutId = setTimeout(async () => {
        try {
          console.log('[CleanupService] Running cleanup...');
          const results = await runDatabaseCleanup();
          const total   = Object.values(results).reduce((a, b) => a + b, 0);
          console.log(`[CleanupService] Done — ${total} records deleted`, results);
        } catch (err) {
          console.error('[CleanupService] Cleanup failed:', err);
        }
        scheduleNext();
      }, delay);
    };

    scheduleNext();
  },

  stop(): void {
    if (CleanupService._timeoutId) {
      clearTimeout(CleanupService._timeoutId);
      CleanupService._timeoutId = undefined;
    }
    if (CleanupService._intervalId) {
      clearInterval(CleanupService._intervalId);
      CleanupService._intervalId = undefined;
    }
    console.log('[CleanupService] Stopped');
  },
};
