#!/usr/bin/env node
// Quick JSON backup using Prisma client
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';

config();

// Use Render DB URL directly — this is the database that was in production
const RENDER_DB_URL = "postgresql://fidelbingo_user:Y3Lbz9YxkWZ4Ssmwvm4NPKGH89kyPs6V@dpg-d9l6hfrm8hqs739bm19g-a.oregon-postgres.render.com:5432/fidelbingo";

const prisma = new PrismaClient({
  datasources: { db: { url: RENDER_DB_URL } },
});
const BACKUP_DIR = './backups';

async function backup() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const file = path.join(BACKUP_DIR, `backup_${timestamp}.json`);

  console.log('Connecting to database...');

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
  ]);

  const data = {
    _meta: { timestamp: new Date().toISOString(), version: '1.0' },
    players, wallets, transactions,
    gameRounds, roundEntries, roundWinners,
    cartelaDefinitions, calledNumbers,
    admins, config: config_, pendingDeposits, depositAttempts,
    agents, agentCommissions, agentCommissionWithdrawals,
    cartelaReservations, pendingWithdrawals, depositAccounts,
    broadcastTargets, promotions, promotionSchedules,
    promotionLogs, promotionBonusDistributions,
    crashRounds, crashBets, slotSpins, kenoRounds, kenoBets,
  };

  await fs.writeFile(file, JSON.stringify(data, null, 2));

  // Print counts
  console.log('\n✓ Backup saved:', file);
  console.log('\nRecord counts:');
  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val)) console.log(`  ${key}: ${val.length}`);
  }
}

backup()
  .catch(e => { console.error('✗ Backup failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
