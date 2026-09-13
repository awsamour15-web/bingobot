import { Router, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

// POST /api/admin/cleanup/preview  — returns counts without deleting
router.post('/preview', async (req, res) => {
  try {
    const daysToKeep: number = Math.max(1, parseInt(req.body?.daysToKeep ?? '30', 10));
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const [
      expiredReservations,
      promoLogs,
      depositAttempts,
      gregTx,
      gregSessions,
      slotSpins,
      plinkoBets,
      royalDropBets,
      oldCrashRounds,
      oldKenoRounds,
      oldBingoRounds,
    ] = await Promise.all([
      prisma.cartelaReservation.count({ where: { expires_at: { lt: new Date() } } }),
      prisma.promotionLog.count({ where: { sent_at: { lt: cutoff } } }),
      prisma.depositAttempt.count({ where: { created_at: { lt: cutoff } } }),
      prisma.gregmornTransaction.count({ where: { created_at: { lt: cutoff } } }),
      prisma.gregmornSession.count({ where: { created_at: { lt: cutoff } } }),
      prisma.slotSpin.count({ where: { created_at: { lt: cutoff } } }),
      prisma.plinkoBet.count({ where: { created_at: { lt: cutoff } } }),
      prisma.royalDropBet.count({ where: { created_at: { lt: cutoff } } }),
      prisma.crashRound.count({ where: { status: 'crashed', created_at: { lt: cutoff } } }),
      prisma.kenoRound.count({ where: { status: 'finished', created_at: { lt: cutoff } } }),
      prisma.gameRound.count({ where: { status: { in: ['completed', 'cancelled', 'void'] }, start_time: { lt: cutoff } } }),
    ]);

    res.json({
      cutoff: cutoff.toISOString(),
      daysToKeep,
      counts: {
        expired_reservations: expiredReservations,
        promotion_logs: promoLogs,
        deposit_attempts: depositAttempts,
        gregmorn_transactions: gregTx,
        gregmorn_sessions: gregSessions,
        slot_spins: slotSpins,
        plinko_bets: plinkoBets,
        royal_drop_bets: royalDropBets,
        crash_rounds: oldCrashRounds,
        keno_rounds: oldKenoRounds,
        bingo_rounds: oldBingoRounds,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'PREVIEW_FAILED', message: err.message });
  }
});

// POST /api/admin/cleanup/run  — actually deletes old data
router.post('/run', async (req, res) => {
  try {
    const daysToKeep: number = Math.max(1, parseInt(req.body?.daysToKeep ?? '30', 10));
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const results: Record<string, number> = {};

    // Expired cartela reservations
    results.expired_reservations = (await prisma.cartelaReservation.deleteMany({
      where: { expires_at: { lt: new Date() } },
    })).count;

    // Promotion logs
    results.promotion_logs = (await prisma.promotionLog.deleteMany({
      where: { sent_at: { lt: cutoff } },
    })).count;

    // Deposit attempts
    results.deposit_attempts = (await prisma.depositAttempt.deleteMany({
      where: { created_at: { lt: cutoff } },
    })).count;

    // Gregmorn
    results.gregmorn_transactions = (await prisma.gregmornTransaction.deleteMany({
      where: { created_at: { lt: cutoff } },
    })).count;
    results.gregmorn_sessions = (await prisma.gregmornSession.deleteMany({
      where: { created_at: { lt: cutoff } },
    })).count;

    // Mini-game bets
    results.slot_spins = (await prisma.slotSpin.deleteMany({
      where: { created_at: { lt: cutoff } },
    })).count;
    results.plinko_bets = (await prisma.plinkoBet.deleteMany({
      where: { created_at: { lt: cutoff } },
    })).count;
    results.royal_drop_bets = (await prisma.royalDropBet.deleteMany({
      where: { created_at: { lt: cutoff } },
    })).count;

    // Crash rounds
    const oldCrashIds = (await prisma.crashRound.findMany({
      where: { status: 'crashed', created_at: { lt: cutoff } },
      select: { id: true },
    })).map(r => r.id);
    if (oldCrashIds.length > 0) {
      results.crash_bets = (await prisma.crashBet.deleteMany({ where: { round_id: { in: oldCrashIds } } })).count;
      results.crash_rounds = (await prisma.crashRound.deleteMany({ where: { id: { in: oldCrashIds } } })).count;
    } else {
      results.crash_bets = 0; results.crash_rounds = 0;
    }

    // Keno rounds
    const oldKenoIds = (await prisma.kenoRound.findMany({
      where: { status: 'finished', created_at: { lt: cutoff } },
      select: { id: true },
    })).map(r => r.id);
    if (oldKenoIds.length > 0) {
      results.keno_bets = (await prisma.kenoBet.deleteMany({ where: { round_id: { in: oldKenoIds } } })).count;
      results.keno_rounds = (await prisma.kenoRound.deleteMany({ where: { id: { in: oldKenoIds } } })).count;
    } else {
      results.keno_bets = 0; results.keno_rounds = 0;
    }

    // Bingo game rounds
    const oldBingoIds = (await prisma.gameRound.findMany({
      where: { status: { in: ['completed', 'cancelled', 'void'] }, start_time: { lt: cutoff } },
      select: { id: true },
    })).map(r => r.id);
    if (oldBingoIds.length > 0) {
      await prisma.cartelaReservation.deleteMany({ where: { round_id: { in: oldBingoIds } } });
      results.round_entries = (await prisma.roundEntry.deleteMany({ where: { round_id: { in: oldBingoIds } } })).count;
      results.called_numbers = (await prisma.calledNumber.deleteMany({ where: { round_id: { in: oldBingoIds } } })).count;
      results.round_winners = (await prisma.roundWinner.deleteMany({ where: { round_id: { in: oldBingoIds } } })).count;
      results.bingo_rounds = (await prisma.gameRound.deleteMany({ where: { id: { in: oldBingoIds } } })).count;
    } else {
      results.round_entries = 0; results.called_numbers = 0;
      results.round_winners = 0; results.bingo_rounds = 0;
    }

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
    res.json({ success: true, totalDeleted, deleted: results, cutoff: cutoff.toISOString(), daysToKeep });
  } catch (err: any) {
    console.error('[Cleanup] Failed:', err);
    res.status(500).json({ error: 'CLEANUP_FAILED', message: err.message });
  }
});

export default router;
