import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';

const router = Router();

// GET /api/admin/storage - Get storage stats
router.get('/', async (req, res) => {
  try {
    // Table sizes
    const sizes = await prisma.$queryRawUnsafe(`
      SELECT
        relname AS table_name,
        pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
        pg_total_relation_size(relid) AS bytes,
        reltuples::bigint AS estimated_rows
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 15
    `) as any[];

    // Total DB size
    const totalResult = await prisma.$queryRawUnsafe(`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS total,
             pg_database_size(current_database()) AS bytes
    `) as any[];
    const total = totalResult[0];

    // Row counts for cleanup targets
    const counts = {
      gameRounds: await prisma.gameRound.count(),
      roundEntries: await prisma.roundEntry.count(),
      calledNumbers: await prisma.calledNumber.count(),
      roundWinners: await prisma.roundWinner.count(),
      promotionLogs: await prisma.promotionLog.count(),
      transactions: await prisma.transaction.count(),
      crashRounds: await prisma.crashRound.count(),
      slotSpins: await prisma.slotSpin.count(),
      kenoRounds: await prisma.kenoRound.count(),
    };

    // Oldest/newest game round
    const oldest = await prisma.gameRound.findFirst({
      orderBy: { start_time: 'asc' },
      select: { start_time: true },
    });
    const newest = await prisma.gameRound.findFirst({
      orderBy: { start_time: 'desc' },
      select: { start_time: true },
    });

    // Potential savings by age
    const cutoffs = [1, 2, 7, 14, 30];
    const savings = await Promise.all(cutoffs.map(async (days) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - days);
      const rounds = await prisma.gameRound.count({ where: { start_time: { lt: dt } } });
      const entries = await prisma.roundEntry.count({ where: { round: { start_time: { lt: dt } } } });
      const called = await prisma.calledNumber.count({ where: { round: { start_time: { lt: dt } } } });
      return { days, rounds, entries, called };
    }));

    res.json({
      total: { size: total.total, bytes: total.bytes },
      tables: sizes,
      counts,
      dateRange: { oldest: oldest?.start_time, newest: newest?.start_time },
      potentialSavings: savings,
    });
  } catch (error: any) {
    console.error('Storage stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/storage/cleanup - Delete old game data
router.post('/cleanup', async (req, res) => {
  try {
    const { days, dryRun = false } = req.body;

    if (!days || days < 1) {
      return res.status(400).json({ error: 'days must be >= 1' });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    if (dryRun) {
      // Just count what would be deleted
      const rounds = await prisma.gameRound.count({ where: { start_time: { lt: cutoffDate } } });
      const entries = await prisma.roundEntry.count({ where: { round: { start_time: { lt: cutoffDate } } } });
      const called = await prisma.calledNumber.count({ where: { round: { start_time: { lt: cutoffDate } } } });
      const winners = await prisma.roundWinner.count({ where: { round: { start_time: { lt: cutoffDate } } } });
      const bonusWinners = await prisma.roundBonusWinner.count({ where: { round: { start_time: { lt: cutoffDate } } } });
      const reservations = await prisma.cartelaReservation.count({ where: { round: { start_time: { lt: cutoffDate } } } });

      return res.json({
        dryRun: true,
        cutoffDate,
        wouldDelete: {
          gameRounds: rounds,
          roundEntries: entries,
          calledNumbers: called,
          roundWinners: winners,
          bonusWinners,
          cartelaReservations: reservations,
        },
      });
    }

    // Actually delete
    const deleted = {
      calledNumbers: await prisma.calledNumber.deleteMany({ where: { round: { start_time: { lt: cutoffDate } } } }),
      bonusWinners: await prisma.roundBonusWinner.deleteMany({ where: { round: { start_time: { lt: cutoffDate } } } }),
      roundWinners: await prisma.roundWinner.deleteMany({ where: { round: { start_time: { lt: cutoffDate } } } }),
      roundEntries: await prisma.roundEntry.deleteMany({ where: { round: { start_time: { lt: cutoffDate } } } }),
      cartelaReservations: await prisma.cartelaReservation.deleteMany({ where: { round: { start_time: { lt: cutoffDate } } } }),
      gameRounds: await prisma.gameRound.deleteMany({ where: { start_time: { lt: cutoffDate } } }),
    };

    res.json({
      success: true,
      cutoffDate,
      deleted: {
        gameRounds: deleted.gameRounds.count,
        roundEntries: deleted.roundEntries.count,
        calledNumbers: deleted.calledNumbers.count,
        roundWinners: deleted.roundWinners.count,
        bonusWinners: deleted.bonusWinners.count,
        cartelaReservations: deleted.cartelaReservations.count,
      },
    });
  } catch (error: any) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/storage/cleanup-other - Delete old crash/slots/keno/promo logs
router.post('/cleanup-other', async (req, res) => {
  try {
    const { days, types, dryRun = false } = req.body;

    if (!days || days < 1) {
      return res.status(400).json({ error: 'days must be >= 1' });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const deleted: any = {};

    if (types.includes('promotionLogs')) {
      if (dryRun) {
        deleted.promotionLogs = await prisma.promotionLog.count({ where: { sent_at: { lt: cutoffDate } } });
      } else {
        const result = await prisma.promotionLog.deleteMany({ where: { sent_at: { lt: cutoffDate } } });
        deleted.promotionLogs = result.count;
      }
    }

    if (types.includes('crashRounds')) {
      if (dryRun) {
        deleted.crashRounds = await prisma.crashRound.count({ where: { created_at: { lt: cutoffDate } } });
        deleted.crashBets = await prisma.crashBet.count({ where: { round: { created_at: { lt: cutoffDate } } } });
      } else {
        deleted.crashBets = (await prisma.crashBet.deleteMany({ where: { round: { created_at: { lt: cutoffDate } } } })).count;
        deleted.crashRounds = (await prisma.crashRound.deleteMany({ where: { created_at: { lt: cutoffDate } } })).count;
      }
    }

    if (types.includes('slotSpins')) {
      if (dryRun) {
        deleted.slotSpins = await prisma.slotSpin.count({ where: { created_at: { lt: cutoffDate } } });
      } else {
        deleted.slotSpins = (await prisma.slotSpin.deleteMany({ where: { created_at: { lt: cutoffDate } } })).count;
      }
    }

    if (types.includes('kenoRounds')) {
      if (dryRun) {
        deleted.kenoRounds = await prisma.kenoRound.count({ where: { created_at: { lt: cutoffDate } } });
        deleted.kenoBets = await prisma.kenoBet.count({ where: { round: { created_at: { lt: cutoffDate } } } });
      } else {
        deleted.kenoBets = (await prisma.kenoBet.deleteMany({ where: { round: { created_at: { lt: cutoffDate } } } })).count;
        deleted.kenoRounds = (await prisma.kenoRound.deleteMany({ where: { created_at: { lt: cutoffDate } } })).count;
      }
    }

    res.json({ success: true, dryRun, cutoffDate, deleted });
  } catch (error: any) {
    console.error('Cleanup other error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
