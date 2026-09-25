// Backup Service
// Runs the backup as a detached child process so an OOM crash in the backup
// cannot take down the main server process. The backup logic is inlined as an
// --eval script so it works in the Docker image (no .mjs files are copied).

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const BACKUP_DIR = './backups';
const BACKUP_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours
const MAX_BACKUPS = 14;

// Inline ESM backup script executed via node --input-type=module
const BACKUP_EVAL = `
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();
const BACKUP_DIR = './backups';
const BATCH = 2000;

async function fetchAll(model) {
  const results = [];
  let skip = 0;
  while (true) {
    const batch = await model.findMany({ skip, take: BATCH });
    results.push(...batch);
    if (batch.length < BATCH) break;
    skip += batch.length;
  }
  return results;
}

async function backup() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const file = path.join(BACKUP_DIR, 'backup_' + timestamp + '.json');

  // Small / config tables — fetch in parallel
  const [
    players, wallets, admins, config,
    pendingDeposits, pendingWithdrawals, depositAccounts,
    agents, agentCommissions, agentCommissionWithdrawals,
    cartelaReservations, cartelaDefinitions,
    broadcastTargets, promotions, promotionSchedules,
    promotionBonusDistributions, cashiers, systemSettings,
  ] = await Promise.all([
    prisma.player.findMany(),
    prisma.wallet.findMany(),
    prisma.admin.findMany(),
    prisma.config.findMany(),
    prisma.pendingDeposit.findMany(),
    prisma.pendingWithdrawal.findMany(),
    prisma.depositAccount.findMany(),
    prisma.agent.findMany(),
    prisma.agentCommission.findMany(),
    prisma.agentCommissionWithdrawal.findMany(),
    prisma.cartelaReservation.findMany(),
    prisma.cartelaDefinition.findMany(),
    prisma.broadcastTarget.findMany(),
    prisma.promotion.findMany(),
    prisma.promotionSchedule.findMany(),
    prisma.promotionBonusDistribution.findMany(),
    prisma.cashier.findMany(),
    prisma.systemSetting.findMany(),
  ]);

  // Large tables — fetch in batches to avoid OOM
  const transactions               = await fetchAll(prisma.transaction);
  const gameRounds                 = await fetchAll(prisma.gameRound);
  const roundEntries               = await fetchAll(prisma.roundEntry);
  const roundWinners               = await fetchAll(prisma.roundWinner);
  const calledNumbers              = await fetchAll(prisma.calledNumber);
  const depositAttempts            = await fetchAll(prisma.depositAttempt);
  const promotionLogs              = await fetchAll(prisma.promotionLog);
  const crashRounds                = await fetchAll(prisma.crashRound);
  const crashBets                  = await fetchAll(prisma.crashBet);
  const slotSpins                  = await fetchAll(prisma.slotSpin);
  const kenoRounds                 = await fetchAll(prisma.kenoRound);
  const kenoBets                   = await fetchAll(prisma.kenoBet);
  const plinkoBets                 = await fetchAll(prisma.plinkoBet);
  const royalDropBets              = await fetchAll(prisma.royalDropBet);
  const gregmornSessions           = await fetchAll(prisma.gregmornSession);
  const gregmornTransactions       = await fetchAll(prisma.gregmornTransaction);

  const data = {
    _meta: { timestamp: new Date().toISOString(), version: '2.2' },
    players, wallets, admins, config,
    pendingDeposits, depositAttempts, pendingWithdrawals, depositAccounts,
    agents, agentCommissions, agentCommissionWithdrawals,
    cartelaDefinitions, cartelaReservations,
    transactions, gameRounds, roundEntries, roundWinners, calledNumbers,
    broadcastTargets, promotions, promotionSchedules, promotionLogs,
    promotionBonusDistributions,
    crashRounds, crashBets, slotSpins,
    kenoRounds, kenoBets, plinkoBets, royalDropBets,
    cashiers, systemSettings,
    gregmornSessions, gregmornTransactions,
  };

  await fs.writeFile(file, JSON.stringify(data, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  console.log('Backup saved:', file, '— tables:', Object.keys(data).filter(k => k !== '_meta').length);
}

backup()
  .catch(e => { console.error('Backup failed:', e.message); process.exit(1); })
  .finally(() => prisma.\$disconnect());
`;

export const BackupService = {
  _timer: undefined as ReturnType<typeof setInterval> | undefined,

  start(): void {
    if (BackupService._timer) return;
    console.log('[Backup] Scheduler started — running every 5 hours');
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
    console.log('[Backup] Starting backup...');
    await new Promise<void>((resolve) => {
      const child = spawn(
        process.execPath,
        ['--max-old-space-size=256', '--input-type=module'],
        {
          detached: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
          cwd: process.cwd(),
        },
      );

      child.stdin?.end(BACKUP_EVAL);
      child.stdout?.on('data', (d: Buffer) => process.stdout.write(`[Backup] ${d}`));
      child.stderr?.on('data', (d: Buffer) => process.stderr.write(`[Backup] ${d}`));

      child.on('close', (code) => {
        if (code === 0) {
          console.log('[Backup] ✓ Completed');
          void BackupService.rotate();
        } else {
          console.error(`[Backup] ✗ Child exited with code ${code}`);
        }
        resolve();
      });

      child.on('error', (err) => {
        console.error('[Backup] ✗ Failed to spawn:', err.message);
        resolve();
      });
    });
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
