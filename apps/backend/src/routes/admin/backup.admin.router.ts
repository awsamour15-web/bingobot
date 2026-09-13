import { Router, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

// GET /api/admin/backup
// Returns a full JSON dump of all tables. Protected by jwtAdminMiddleware upstream.
router.get('/', async (_req, res) => {
  try {
    const [
      players, wallets, transactions,
      gameRounds, roundEntries, roundWinners,
      cartelaDefinitions, calledNumbers,
      admins, config_, pendingDeposits, depositAttempts,
      agents, agentCommissions, agentCommissionWithdrawals,
      cartelaReservations, pendingWithdrawals, depositAccounts,
      broadcastTargets, promotions, promotionSchedules,
      promotionLogs, promotionBonusDistributions,
      crashRounds, crashBets, slotSpins, kenoRounds, kenoBets,
      plinkoBets, royalDropBets, cashiers, systemSettings,
      gregmornSessions, gregmornTransactions,
    ] = await Promise.all([
      prisma.player.findMany(),
      prisma.wallet.findMany(),
      prisma.transaction.findMany(),
      prisma.gameRound.findMany(),
      prisma.roundEntry.findMany(),
      prisma.roundWinner.findMany(),
      prisma.cartelaDefinition.findMany(),
      prisma.calledNumber.findMany(),
      prisma.admin.findMany(),
      prisma.config.findMany(),
      prisma.pendingDeposit.findMany(),
      prisma.depositAttempt.findMany(),
      prisma.agent.findMany(),
      prisma.agentCommission.findMany(),
      prisma.agentCommissionWithdrawal.findMany(),
      prisma.cartelaReservation.findMany(),
      prisma.pendingWithdrawal.findMany(),
      prisma.depositAccount.findMany(),
      prisma.broadcastTarget.findMany(),
      prisma.promotion.findMany(),
      prisma.promotionSchedule.findMany(),
      prisma.promotionLog.findMany(),
      prisma.promotionBonusDistribution.findMany(),
      prisma.crashRound.findMany(),
      prisma.crashBet.findMany(),
      prisma.slotSpin.findMany(),
      prisma.kenoRound.findMany(),
      prisma.kenoBet.findMany(),
      prisma.plinkoBet.findMany(),
      prisma.royalDropBet.findMany(),
      prisma.cashier.findMany(),
      prisma.systemSetting.findMany(),
      prisma.gregmornSession.findMany(),
      prisma.gregmornTransaction.findMany(),
    ]);

    const data = {
      _meta: { timestamp: new Date().toISOString(), version: '2.0' },
      players, wallets, transactions,
      gameRounds, roundEntries, roundWinners,
      cartelaDefinitions, calledNumbers,
      admins, config: config_, pendingDeposits, depositAttempts,
      agents, agentCommissions, agentCommissionWithdrawals,
      cartelaReservations, pendingWithdrawals, depositAccounts,
      broadcastTargets, promotions, promotionSchedules,
      promotionLogs, promotionBonusDistributions,
      crashRounds, crashBets, slotSpins, kenoRounds, kenoBets,
      plinkoBets, royalDropBets, cashiers, systemSettings,
      gregmornSessions, gregmornTransactions,
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup_${timestamp}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error('[Backup] Failed:', err);
    res.status(500).json({ error: 'BACKUP_FAILED', message: err.message });
  }
});

export default router;
