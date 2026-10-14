#!/usr/bin/env node
// Streaming backup — writes each table directly to file in batches
// Handles large tables (e.g. 745k transactions) without memory issues
import { PrismaClient } from '@prisma/client';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();
const BACKUP_DIR = './backups';
const BATCH = 1000;

// Tables whose primary key is not `id`
const ORDERBY_OVERRIDE = {
  cartelaDefinitions: { cartela_number: 'asc' },
  config:             { key: 'asc' },
  systemSettings:     { key: 'asc' },
};

async function streamTable(writer, key, model, first) {
  if (!first) writer.write(',\n');
  writer.write(`  ${JSON.stringify(key)}: [\n`);

  let skip = 0;
  let total = 0;
  let isFirstBatch = true;
  process.stdout.write(`  ${key}...`);

  const orderBy = ORDERBY_OVERRIDE[key] ?? { id: 'asc' };

  while (true) {
    const rows = await model.findMany({ skip, take: BATCH, orderBy });
    for (const row of rows) {
      const json = JSON.stringify(row, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
      if (!isFirstBatch || skip > 0 || rows.indexOf(row) > 0) writer.write(',\n');
      writer.write('    ' + json);
      isFirstBatch = false;
    }
    total += rows.length;
    skip += rows.length;
    if (rows.length < BATCH) break;
    process.stdout.write('.');
  }

  writer.write('\n  ]');
  console.log(` ${total}`);
  return total;
}

async function backup() {
  await mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const file = path.join(BACKUP_DIR, `backup_${timestamp}.json`);

  console.log('Backing up Neon database to:', file);
  console.log('');

  const writer = createWriteStream(file, { encoding: 'utf8' });
  await new Promise(r => writer.once('open', r));

  writer.write('{\n');
  writer.write(`  "_meta": ${JSON.stringify({ timestamp: new Date().toISOString(), version: '3.0', source: 'neon' })}`);

  const tables = [
    ['players',                    prisma.player],
    ['wallets',                    prisma.wallet],
    ['transactions',               prisma.transaction],
    ['gameRounds',                 prisma.gameRound],
    ['roundEntries',               prisma.roundEntry],
    ['roundWinners',               prisma.roundWinner],
    ['cartelaDefinitions',         prisma.cartelaDefinition],
    ['calledNumbers',              prisma.calledNumber],
    ['admins',                     prisma.admin],
    ['config',                     prisma.config],
    ['pendingDeposits',            prisma.pendingDeposit],
    ['depositAttempts',            prisma.depositAttempt],
    ['agents',                     prisma.agent],
    ['agentCommissions',           prisma.agentCommission],
    ['agentCommissionWithdrawals', prisma.agentCommissionWithdrawal],
    ['cartelaReservations',        prisma.cartelaReservation],
    ['pendingWithdrawals',         prisma.pendingWithdrawal],
    ['depositAccounts',            prisma.depositAccount],
    ['broadcastTargets',           prisma.broadcastTarget],
    ['promotions',                 prisma.promotion],
    ['promotionSchedules',         prisma.promotionSchedule],
    ['promotionLogs',              prisma.promotionLog],
    ['promotionBonusDistributions',prisma.promotionBonusDistribution],
    ['crashRounds',                prisma.crashRound],
    ['crashBets',                  prisma.crashBet],
    ['slotSpins',                  prisma.slotSpin],
    ['kenoRounds',                 prisma.kenoRound],
    ['kenoBets',                   prisma.kenoBet],
    ['plinkoBets',                 prisma.plinkoBet],
    ['royalDropBets',              prisma.royalDropBet],
    ['cashiers',                   prisma.cashier],
    ['systemSettings',             prisma.systemSetting],
    ['gregmornSessions',           prisma.gregmornSession],
    ['gregmornTransactions',       prisma.gregmornTransaction],
  ];

  for (let i = 0; i < tables.length; i++) {
    const [key, model] = tables[i];
    await streamTable(writer, key, model, false);
  }

  writer.write('\n}\n');
  await new Promise((resolve, reject) => {
    writer.end();
    writer.once('finish', resolve);
    writer.once('error', reject);
  });

  console.log('\n✓ Backup complete:', file);
}

backup()
  .catch(e => { console.error('\n✗ Backup failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
