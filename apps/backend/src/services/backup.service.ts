// Backup Service
// Automatically backs up the database every 5 hours using Prisma.

import prisma from '../lib/prisma.js';
import fs from 'fs/promises';
import path from 'path';

const BACKUP_DIR = './backups';
const BACKUP_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours
const MAX_BACKUPS = 14; // keep last 14 backups (~3 days at 5h intervals)

export const BackupService = {
  _timer: undefined as ReturnType<typeof setInterval> | undefined,

  start(): void {
    if (BackupService._timer) return;
    console.log('[Backup] Scheduler started — running every 5 hours');

    // Run once at startup after a short delay, then on interval
    setTimeout(() => void BackupService.run(), 30_000);
    BackupService._timer = setInterval(() => void BackupService.run(), BACKUP_INTERVAL_MS);
  },

  stop(): void {
    if (BackupService._timer) {
      clearInterval(BackupService._timer);
      BackupService._timer = undefined;
    }
  },

  async run(): Promise<void> {
    try {
      await fs.mkdir(BACKUP_DIR, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const file = path.join(BACKUP_DIR, `backup_${timestamp}.json`);

      console.log('[Backup] Starting backup...');

      const [
        players, wallets, transactions,
        gameRounds, roundEntries, roundWinners,
        cartelaDefinitions, calledNumbers,
        admins, config, pendingDeposits, depositAttempts,
        agents, agentCommissions, agentCommissionWithdrawals,
        cartelaReservations, pendingWithdrawals, depositAccounts,
        broadcastTargets, promotions, promotionSchedules,
        promotionLogs, promotionBonusDistributions,
        crashRounds, crashBets, slotSpins, kenoRounds, kenoBets,
        plinkoBets, royalDropBets, cashiers, systemSettings,
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
      ]);

      const data = {
        _meta: { timestamp: new Date().toISOString(), version: '2.0' },
        players, wallets, transactions,
        gameRounds, roundEntries, roundWinners,
        cartelaDefinitions, calledNumbers,
        admins, config, pendingDeposits, depositAttempts,
        agents, agentCommissions, agentCommissionWithdrawals,
        cartelaReservations, pendingWithdrawals, depositAccounts,
        broadcastTargets, promotions, promotionSchedules,
        promotionLogs, promotionBonusDistributions,
        crashRounds, crashBets, slotSpins, kenoRounds, kenoBets,
        plinkoBets, royalDropBets, cashiers, systemSettings,
      };

      await fs.writeFile(
        file,
        JSON.stringify(data, (_key, val) => (typeof val === 'bigint' ? val.toString() : val), 2),
      );

      console.log(`[Backup] ✓ Saved: ${file}`);

      // Rotate — keep only the most recent MAX_BACKUPS files
      await BackupService.rotate();
    } catch (err: any) {
      console.error('[Backup] ✗ Failed:', err?.message ?? err);
    }
  },

  async rotate(): Promise<void> {
    try {
      const files = await fs.readdir(BACKUP_DIR);
      const backupFiles = files
        .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
        .sort()
        .reverse();

      for (const old of backupFiles.slice(MAX_BACKUPS)) {
        await fs.unlink(path.join(BACKUP_DIR, old));
        console.log(`[Backup] Deleted old backup: ${old}`);
      }
    } catch {
      // non-fatal
    }
  },
};
