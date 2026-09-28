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
// Streams each table directly to disk in batches — never holds the full dataset in memory.
const BACKUP_EVAL = `
import { PrismaClient } from '@prisma/client';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();
const BACKUP_DIR = './backups';
const BATCH = 500;

function serialize(v) {
  return JSON.stringify(v, (_k, val) => typeof val === 'bigint' ? val.toString() : val);
}

async function streamTable(writer, key, model, isFirst) {
  if (!isFirst) writer.write(',\\n');
  writer.write('  ' + JSON.stringify(key) + ': [\\n');

  let skip = 0;
  let total = 0;
  let firstRow = true;

  while (true) {
    const rows = await model.findMany({ skip, take: BATCH, orderBy: { id: 'asc' } });
    for (const row of rows) {
      if (!firstRow) writer.write(',\\n');
      writer.write('    ' + serialize(row));
      firstRow = false;
    }
    total += rows.length;
    skip += rows.length;
    if (rows.length < BATCH) break;
  }

  writer.write('\\n  ]');
  console.log('  ' + key + ': ' + total);
  return total;
}

async function backup() {
  await mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const file = path.join(BACKUP_DIR, 'backup_' + timestamp + '.json');

  const writer = createWriteStream(file, { encoding: 'utf8' });
  await new Promise(r => writer.once('open', r));

  writer.write('{\\n');
  writer.write('  "_meta": ' + serialize({ timestamp: new Date().toISOString(), version: '3.0' }));

  const tables = [
    ['players',                     prisma.player],
    ['wallets',                     prisma.wallet],
    ['admins',                      prisma.admin],
    ['config',                      prisma.config],
    ['pendingDeposits',             prisma.pendingDeposit],
    ['depositAttempts',             prisma.depositAttempt],
    ['pendingWithdrawals',          prisma.pendingWithdrawal],
    ['depositAccounts',             prisma.depositAccount],
    ['agents',                      prisma.agent],
    ['agentCommissions',            prisma.agentCommission],
    ['agentCommissionWithdrawals',  prisma.agentCommissionWithdrawal],
    ['cartelaDefinitions',          prisma.cartelaDefinition],
    ['cartelaReservations',         prisma.cartelaReservation],
    ['transactions',                prisma.transaction],
    ['gameRounds',                  prisma.gameRound],
    ['roundEntries',                prisma.roundEntry],
    ['roundWinners',                prisma.roundWinner],
    ['calledNumbers',               prisma.calledNumber],
    ['broadcastTargets',            prisma.broadcastTarget],
    ['promotions',                  prisma.promotion],
    ['promotionSchedules',          prisma.promotionSchedule],
    ['promotionLogs',               prisma.promotionLog],
    ['promotionBonusDistributions', prisma.promotionBonusDistribution],
    ['crashRounds',                 prisma.crashRound],
    ['crashBets',                   prisma.crashBet],
    ['slotSpins',                   prisma.slotSpin],
    ['kenoRounds',                  prisma.kenoRound],
    ['kenoBets',                    prisma.kenoBet],
    ['plinkoBets',                  prisma.plinkoBet],
    ['royalDropBets',               prisma.royalDropBet],
    ['cashiers',                    prisma.cashier],
    ['systemSettings',              prisma.systemSetting],
    ['gregmornSessions',            prisma.gregmornSession],
    ['gregmornTransactions',        prisma.gregmornTransaction],
  ];

  for (const [key, model] of tables) {
    await streamTable(writer, key, model, false);
  }

  writer.write('\\n}\\n');
  await new Promise((resolve, reject) => {
    writer.end();
    writer.once('finish', resolve);
    writer.once('error', reject);
  });

  console.log('Backup saved:', file);
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
        ['--max-old-space-size=192', '--input-type=module'],
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
