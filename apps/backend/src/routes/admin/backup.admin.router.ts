import { Router, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

// Fetch a table in chunks to avoid loading millions of rows into memory at once
async function fetchAllInChunks<T>(
  fetcher: (skip: number, take: number) => Promise<T[]>,
  chunkSize = 2000,
): Promise<T[]> {
  const results: T[] = [];
  let skip = 0;
  while (true) {
    const chunk = await fetcher(skip, chunkSize);
    results.push(...chunk);
    if (chunk.length < chunkSize) break;
    skip += chunkSize;
  }
  return results;
}

// GET /api/admin/backup
// Returns a full JSON dump of all tables. Protected by jwtAdminMiddleware upstream.
router.get('/', async (_req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup_${timestamp}.json"`);

    // Stream opening
    res.write('{\n');
    res.write(`"_meta": ${JSON.stringify({ timestamp: new Date().toISOString(), version: '2.0' })}`);

    // Tables that can be large — fetched in chunks
    const chunkedTables: Array<{ key: string; fetcher: (skip: number, take: number) => Promise<any[]> }> = [
      { key: 'transactions',    fetcher: (s, t) => prisma.transaction.findMany({ skip: s, take: t }) },
      { key: 'roundEntries',    fetcher: (s, t) => prisma.roundEntry.findMany({ skip: s, take: t }) },
      { key: 'calledNumbers',   fetcher: (s, t) => prisma.calledNumber.findMany({ skip: s, take: t }) },
      { key: 'gameRounds',      fetcher: (s, t) => prisma.gameRound.findMany({ skip: s, take: t }) },
      { key: 'roundWinners',    fetcher: (s, t) => prisma.roundWinner.findMany({ skip: s, take: t }) },
      { key: 'crashRounds',     fetcher: (s, t) => prisma.crashRound.findMany({ skip: s, take: t }) },
      { key: 'crashBets',       fetcher: (s, t) => prisma.crashBet.findMany({ skip: s, take: t }) },
      { key: 'slotSpins',       fetcher: (s, t) => prisma.slotSpin.findMany({ skip: s, take: t }) },
      { key: 'kenoRounds',      fetcher: (s, t) => prisma.kenoRound.findMany({ skip: s, take: t }) },
      { key: 'kenoBets',        fetcher: (s, t) => prisma.kenoBet.findMany({ skip: s, take: t }) },
      { key: 'plinkoBets',      fetcher: (s, t) => prisma.plinkoBet.findMany({ skip: s, take: t }) },
      { key: 'royalDropBets',   fetcher: (s, t) => prisma.royalDropBet.findMany({ skip: s, take: t }) },
      { key: 'gregmornSessions',    fetcher: (s, t) => prisma.gregmornSession.findMany({ skip: s, take: t }) },
      { key: 'gregmornTransactions',fetcher: (s, t) => prisma.gregmornTransaction.findMany({ skip: s, take: t }) },
      { key: 'promotionLogs',   fetcher: (s, t) => prisma.promotionLog.findMany({ skip: s, take: t }) },
      { key: 'depositAttempts', fetcher: (s, t) => prisma.depositAttempt.findMany({ skip: s, take: t }) },
    ];

    // Tables that are small — fetched all at once
    const smallTables: Array<{ key: string; data: Promise<any[]> }> = [
      { key: 'players',                    data: prisma.player.findMany() },
      { key: 'wallets',                    data: prisma.wallet.findMany() },
      { key: 'cartelaDefinitions',         data: prisma.cartelaDefinition.findMany() },
      { key: 'admins',                     data: prisma.admin.findMany() },
      { key: 'config',                     data: prisma.config.findMany() },
      { key: 'pendingDeposits',            data: prisma.pendingDeposit.findMany() },
      { key: 'agents',                     data: prisma.agent.findMany() },
      { key: 'agentCommissions',           data: prisma.agentCommission.findMany() },
      { key: 'agentCommissionWithdrawals', data: prisma.agentCommissionWithdrawal.findMany() },
      { key: 'cartelaReservations',        data: prisma.cartelaReservation.findMany() },
      { key: 'pendingWithdrawals',         data: prisma.pendingWithdrawal.findMany() },
      { key: 'depositAccounts',            data: prisma.depositAccount.findMany() },
      { key: 'broadcastTargets',           data: prisma.broadcastTarget.findMany() },
      { key: 'promotions',                 data: prisma.promotion.findMany() },
      { key: 'promotionSchedules',         data: prisma.promotionSchedule.findMany() },
      { key: 'promotionBonusDistributions',data: prisma.promotionBonusDistribution.findMany() },
      { key: 'cashiers',                   data: prisma.cashier.findMany() },
      { key: 'systemSettings',             data: prisma.systemSetting.findMany() },
    ];

    // Write small tables first (all parallel)
    const smallResults = await Promise.all(smallTables.map(t => t.data));
    for (let i = 0; i < smallTables.length; i++) {
      const row = smallResults[i] ?? [];
      res.write(`,\n"${smallTables[i]!.key}": ${JSON.stringify(row)}`);
    }

    // Write chunked tables sequentially to keep memory usage low
    for (const table of chunkedTables) {
      const rows = await fetchAllInChunks(table.fetcher);
      res.write(`,\n"${table.key}": ${JSON.stringify(rows)}`);
    }

    res.write('\n}\n');
    res.end();
  } catch (err: any) {
    console.error('[Backup] Failed:', err);
    // If headers already sent (streaming started), we can't send a proper error status
    if (!res.headersSent) {
      res.status(500).json({ error: 'BACKUP_FAILED', message: err.message });
    } else {
      res.end();
    }
  }
});

export default router;
