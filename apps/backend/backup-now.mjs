#!/usr/bin/env node
// Streaming JSON backup using Prisma client - handles large datasets
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();
const BACKUP_DIR = './backups';
const CHUNK_SIZE = 5000;

async function streamTable(writeStream, label, fn, isLast) {
  process.stdout.write(`  fetching ${label}...`);
  let offset = 0;
  let total = 0;
  let first = true;

  writeStream.write(`"${label}": [`);

  while (true) {
    const rows = await fn(offset, CHUNK_SIZE);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!first) writeStream.write(',');
      writeStream.write(JSON.stringify(row, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
      first = false;
    }

    total += rows.length;
    offset += CHUNK_SIZE;
    if (rows.length < CHUNK_SIZE) break;
  }

  writeStream.write(isLast ? ']' : '],');
  console.log(total);
  return total;
}

async function backup() {
  await mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const file = path.join(BACKUP_DIR, `backup_${timestamp}.json`);

  console.log('Connecting to database...');

  const ws = createWriteStream(file, { encoding: 'utf8' });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  ws.write(`{\n"_meta": ${JSON.stringify({ timestamp: new Date().toISOString(), version: '2.1' })},\n`);

  const tables = [
    ['players',                     (o, l) => prisma.player.findMany({ skip: o, take: l })],
    ['wallets',                     (o, l) => prisma.wallet.findMany({ skip: o, take: l })],
    ['transactions',                (o, l) => prisma.transaction.findMany({ skip: o, take: l })],
    ['gameRounds',                  (o, l) => prisma.gameRound.findMany({ skip: o, take: l })],
    ['roundEntries',                (o, l) => prisma.roundEntry.findMany({ skip: o, take: l })],
    ['roundWinners',                (o, l) => prisma.roundWinner.findMany({ skip: o, take: l })],
    ['cartelaDefinitions',          (o, l) => prisma.cartelaDefinition.findMany({ skip: o, take: l })],
    ['calledNumbers',               (o, l) => prisma.calledNumber.findMany({ skip: o, take: l })],
    ['admins',                      (o, l) => prisma.admin.findMany({ skip: o, take: l })],
    ['config',                      (o, l) => prisma.config.findMany({ skip: o, take: l })],
    ['pendingDeposits',             (o, l) => prisma.pendingDeposit.findMany({ skip: o, take: l })],
    ['depositAttempts',             (o, l) => prisma.depositAttempt.findMany({ skip: o, take: l })],
    ['agents',                      (o, l) => prisma.agent.findMany({ skip: o, take: l })],
    ['agentCommissions',            (o, l) => prisma.agentCommission.findMany({ skip: o, take: l })],
    ['agentCommissionWithdrawals',  (o, l) => prisma.agentCommissionWithdrawal.findMany({ skip: o, take: l })],
    ['cartelaReservations',         (o, l) => prisma.cartelaReservation.findMany({ skip: o, take: l })],
    ['pendingWithdrawals',          (o, l) => prisma.pendingWithdrawal.findMany({ skip: o, take: l })],
    ['depositAccounts',             (o, l) => prisma.depositAccount.findMany({ skip: o, take: l })],
    ['broadcastTargets',            (o, l) => prisma.broadcastTarget.findMany({ skip: o, take: l })],
    ['promotions',                  (o, l) => prisma.promotion.findMany({ skip: o, take: l })],
    ['promotionSchedules',          (o, l) => prisma.promotionSchedule.findMany({ skip: o, take: l })],
    ['promotionLogs',               (o, l) => prisma.promotionLog.findMany({ skip: o, take: l })],
    ['promotionBonusDistributions', (o, l) => prisma.promotionBonusDistribution.findMany({ skip: o, take: l })],
    ['crashRounds',                 (o, l) => prisma.crashRound.findMany({ skip: o, take: l })],
    ['crashBets',                   (o, l) => prisma.crashBet.findMany({ skip: o, take: l })],
    ['slotSpins',                   (o, l) => prisma.slotSpin.findMany({ skip: o, take: l })],
    ['kenoRounds',                  (o, l) => prisma.kenoRound.findMany({ skip: o, take: l })],
    ['kenoBets',                    (o, l) => prisma.kenoBet.findMany({ skip: o, take: l })],
    ['plinkoBets',                  (o, l) => prisma.plinkoBet.findMany({ skip: o, take: l })],
    ['royalDropBets',               (o, l) => prisma.royalDropBet.findMany({ skip: o, take: l })],
    ['cashiers',                    (o, l) => prisma.cashier.findMany({ skip: o, take: l })],
    ['systemSettings',              (o, l) => prisma.systemSetting.findMany({ skip: o, take: l })],
    ['gregmornSessions',            (o, l) => prisma.gregmornSession.findMany({ skip: o, take: l })],
    ['gregmornTransactions',        (o, l) => prisma.gregmornTransaction.findMany({ skip: o, take: l })],
  ];

  for (let i = 0; i < tables.length; i++) {
    const [label, fn] = tables[i];
    const isLast = i === tables.length - 1;
    await streamTable(ws, label, fn, isLast);
  }

  ws.write('\n}');
  await new Promise((resolve, reject) => {
    ws.end(resolve);
    ws.on('error', reject);
  });

  console.log('\n✓ Backup saved:', file);
}

backup()
  .catch(e => { console.error('✗ Backup failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
