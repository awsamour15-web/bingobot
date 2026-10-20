import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

// GET /api/admin/storage
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const sizes = await prisma.$queryRawUnsafe(`
      SELECT s.relname AS table_name,
             pg_size_pretty(pg_total_relation_size(s.relid)) AS total_size,
             pg_total_relation_size(s.relid)::text AS bytes,
             c.reltuples::bigint::text AS estimated_rows
      FROM pg_catalog.pg_statio_user_tables s
      JOIN pg_catalog.pg_class c ON c.oid = s.relid
      ORDER BY pg_total_relation_size(s.relid) DESC LIMIT 15
    `) as any[];

    const totalResult = await prisma.$queryRawUnsafe(`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS total,
             pg_database_size(current_database())::text AS bytes
    `) as any[];
    const total = totalResult[0];

    const safeCount = async (fn: () => Promise<number>): Promise<number> => {
      try { return await fn(); } catch { return 0; }
    };

    const counts = {
      gameRounds:    await safeCount(() => prisma.gameRound.count()),
      roundEntries:  await safeCount(() => prisma.roundEntry.count()),
      calledNumbers: await safeCount(() => prisma.calledNumber.count()),
      roundWinners:  await safeCount(() => prisma.roundWinner.count()),
      promotionLogs: await safeCount(() => prisma.promotionLog.count()),
      transactions:  await safeCount(() => prisma.transaction.count()),
      crashRounds:   await safeCount(() => prisma.crashRound.count()),
      slotSpins:     await safeCount(() => prisma.slotSpin.count()),
      kenoRounds:    await safeCount(() => prisma.kenoRound.count()),
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
    return;
  } catch (error: any) {
    console.error('[storage GET]', error);
    res.status(500).json({ error: error.message, detail: error.stack?.split('\n')[1] ?? '' });
    return;
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
    return;
  } catch (error: any) {
    res.status(500).json({ error: error.message });
    return;
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
    return;
  } catch (error: any) {
    res.status(500).json({ error: error.message });
    return;
  }
});

// POST /api/admin/storage/cleanup-keep-last
// Keeps only the last N completed bingo rounds and deletes the rest
router.post('/cleanup-keep-last', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { keep = 24, dryRun = false } = _req.body;
    const keepCount = Math.max(1, parseInt(keep, 10));

    // Find IDs of the most recent N completed rounds to keep
    const recentRounds = await prisma.gameRound.findMany({
      where: { status: { in: ['completed', 'cancelled', 'void'] } },
      orderBy: { start_time: 'desc' },
      take: keepCount,
      select: { id: true },
    });
    const keepIds = recentRounds.map(r => r.id);

    const oldRounds = await prisma.gameRound.findMany({
      where: {
        status: { in: ['completed', 'cancelled', 'void'] },
        ...(keepIds.length > 0 ? { id: { notIn: keepIds } } : {}),
      },
      select: { id: true },
    });
    const oldIds = oldRounds.map(r => r.id);

    if (dryRun) {
      const calledNumbers = await prisma.calledNumber.count({ where: { round_id: { in: oldIds } } });
      const roundEntries  = await prisma.roundEntry.count({ where: { round_id: { in: oldIds } } });
      const roundWinners  = await prisma.roundWinner.count({ where: { round_id: { in: oldIds } } });
      const bonusWinners  = await prisma.roundBonusWinner.count({ where: { round_id: { in: oldIds } } });
      res.json({ dryRun: true, keep: keepCount, wouldDelete: { gameRounds: oldIds.length, calledNumbers, roundEntries, roundWinners, bonusWinners } });
      return;
    }

    if (oldIds.length === 0) {
      res.json({ success: true, keep: keepCount, deleted: { gameRounds: 0, calledNumbers: 0, roundEntries: 0, roundWinners: 0, bonusWinners: 0, cartelaReservations: 0 } });
      return;
    }

    const cn  = await prisma.calledNumber.deleteMany({ where: { round_id: { in: oldIds } } });
    const rbw = await prisma.roundBonusWinner.deleteMany({ where: { round_id: { in: oldIds } } });
    const rw  = await prisma.roundWinner.deleteMany({ where: { round_id: { in: oldIds } } });
    const re  = await prisma.roundEntry.deleteMany({ where: { round_id: { in: oldIds } } });
    const cr  = await prisma.cartelaReservation.deleteMany({ where: { round_id: { in: oldIds } } });
    const gr  = await prisma.gameRound.deleteMany({ where: { id: { in: oldIds } } });

    res.json({ success: true, keep: keepCount, deleted: { gameRounds: gr.count, calledNumbers: cn.count, roundEntries: re.count, roundWinners: rw.count, bonusWinners: rbw.count, cartelaReservations: cr.count } });
    return;
  } catch (error: any) {
    res.status(500).json({ error: error.message });
    return;
  }
});

export default router;
