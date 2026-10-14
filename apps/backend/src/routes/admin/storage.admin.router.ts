import { Router, type Request, type Response } from 'express';
import prisma from '../../lib/prisma.js';

const router: Router = Router();

// GET /api/admin/storage
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const sizes = await prisma.$queryRawUnsafe(`
      SELECT relname AS table_name,
             pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
             pg_total_relation_size(relid) AS bytes,
             reltuples::bigint AS estimated_rows
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC LIMIT 15
    `) as any[];

    const totalResult = await prisma.$queryRawUnsafe(`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS total,
             pg_database_size(current_database()) AS bytes
    `) as any[];
    const total = totalResult[0];

    const counts = {
      gameRounds:    await prisma.gameRound.count(),
      roundEntries:  await prisma.roundEntry.count(),
      calledNumbers: await prisma.calledNumber.count(),
      roundWinners:  await prisma.roundWinner.count(),
      promotionLogs: await prisma.promotionLog.count(),
      transactions:  await prisma.transaction.count(),
      crashRounds:   await prisma.crashRound.count(),
      slotSpins:     await prisma.slotSpin.count(),
      kenoRounds:    await prisma.kenoRound.count(),
    };

    const oldest = await prisma.gameRound.findFirst({ orderBy: { start_time: 'asc' },  select: { start_time: true } });
    const newest = await prisma.gameRound.findFirst({ orderBy: { start_time: 'desc' }, select: { start_time: true } });

    const savings = await Promise.all([1, 2, 7, 14, 30].map(async (days) => {
      const dt = new Date(); dt.setDate(dt.getDate() - days);
      const rounds  = await prisma.gameRound.count({ where: { start_time: { lt: dt } } });
      const entries = await prisma.roundEntry.count({ where: { round: { start_time: { lt: dt } } } });
      const called  = await prisma.calledNumber.count({ where: { round: { start_time: { lt: dt } } } });
      return { days, rounds, entries, called };
    }));

    res.json({ total: { size: total.total, bytes: total.bytes }, tables: sizes, counts, dateRange: { oldest: oldest?.start_time, newest: newest?.start_time }, potentialSavings: savings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/storage/cleanup
router.post('/cleanup', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { days, dryRun = false } = _req.body;

    if (!days || days < 1) { res.status(400).json({ error: 'days must be >= 1' }); return; }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    if (dryRun) {
      const rounds       = await prisma.gameRound.count({ where: { start_time: { lt: cutoffDate } } });
      const entries      = await prisma.roundEntry.count({ where: { round: { start_time: { lt: cutoffDate } } } });
      const called       = await prisma.calledNumber.count({ where: { round: { start_time: { lt: cutoffDate } } } });
      const winners      = await prisma.roundWinner.count({ where: { round: { start_time: { lt: cutoffDate } } } });
      const bonusWinners = await prisma.roundBonusWinner.count({ where: { round: { start_time: { lt: cutoffDate } } } });
      const reservations = await prisma.cartelaReservation.count({ where: { round: { start_time: { lt: cutoffDate } } } });
      res.json({ dryRun: true, cutoffDate, wouldDelete: { gameRounds: rounds, roundEntries: entries, calledNumbers: called, roundWinners: winners, bonusWinners, cartelaReservations: reservations } });
      return;
    }

    const cn  = await prisma.calledNumber.deleteMany({ where: { round: { start_time: { lt: cutoffDate } } } });
    const rbw = await prisma.roundBonusWinner.deleteMany({ where: { round: { start_time: { lt: cutoffDate } } } });
    const rw  = await prisma.roundWinner.deleteMany({ where: { round: { start_time: { lt: cutoffDate } } } });
    const re  = await prisma.roundEntry.deleteMany({ where: { round: { start_time: { lt: cutoffDate } } } });
    const cr  = await prisma.cartelaReservation.deleteMany({ where: { round: { start_time: { lt: cutoffDate } } } });
    const gr  = await prisma.gameRound.deleteMany({ where: { start_time: { lt: cutoffDate } } });

    res.json({ success: true, cutoffDate, deleted: { gameRounds: gr.count, roundEntries: re.count, calledNumbers: cn.count, roundWinners: rw.count, bonusWinners: rbw.count, cartelaReservations: cr.count } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/storage/cleanup-other
router.post('/cleanup-other', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { days, types, dryRun = false } = _req.body;

    if (!days || days < 1) { res.status(400).json({ error: 'days must be >= 1' }); return; }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const deleted: any = {};

    if (types.includes('promotionLogs')) {
      deleted.promotionLogs = dryRun
        ? await prisma.promotionLog.count({ where: { sent_at: { lt: cutoffDate } } })
        : (await prisma.promotionLog.deleteMany({ where: { sent_at: { lt: cutoffDate } } })).count;
    }
    if (types.includes('crashRounds')) {
      deleted.crashBets   = dryRun ? await prisma.crashBet.count({ where: { round: { created_at: { lt: cutoffDate } } } }) : (await prisma.crashBet.deleteMany({ where: { round: { created_at: { lt: cutoffDate } } } })).count;
      deleted.crashRounds = dryRun ? await prisma.crashRound.count({ where: { created_at: { lt: cutoffDate } } })         : (await prisma.crashRound.deleteMany({ where: { created_at: { lt: cutoffDate } } })).count;
    }
    if (types.includes('slotSpins')) {
      deleted.slotSpins = dryRun ? await prisma.slotSpin.count({ where: { created_at: { lt: cutoffDate } } }) : (await prisma.slotSpin.deleteMany({ where: { created_at: { lt: cutoffDate } } })).count;
    }
    if (types.includes('kenoRounds')) {
      deleted.kenoBets   = dryRun ? await prisma.kenoBet.count({ where: { round: { created_at: { lt: cutoffDate } } } }) : (await prisma.kenoBet.deleteMany({ where: { round: { created_at: { lt: cutoffDate } } } })).count;
      deleted.kenoRounds = dryRun ? await prisma.kenoRound.count({ where: { created_at: { lt: cutoffDate } } })         : (await prisma.kenoRound.deleteMany({ where: { created_at: { lt: cutoffDate } } })).count;
    }

    res.json({ success: true, dryRun, cutoffDate, deleted });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
