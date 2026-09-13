#!/usr/bin/env node
// Quick JSON backup using Prisma client
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();
const BACKUP_DIR = './backups';

async function backup() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const file = path.join(BACKUP_DIR, `backup_${timestamp}.json`);

  console.log('Connecting to database...');

  const fetch = async (label, fn) => { process.stdout.write(`  fetching ${label}...`); const r = await fn(); console.log(r.length); return r; };

  const players                    = await fetch('players', () => prisma.player.findMany());
  const wallets                    = await fetch('wallets', () => prisma.wallet.findMany());
  const transactions               = await fetch('transactions', () => prisma.transaction.findMany());
  const gameRounds                 = await fetch('gameRounds', () => prisma.gameRound.findMany());
  const roundEntries               = await fetch('roundEntries', () => prisma.roundEntry.findMany());
  const roundWinners               = await fetch('roundWinners', () => prisma.roundWinner.findMany());
  const cartelaDefinitions         = await fetch('cartelaDefinitions', () => prisma.cartelaDefinition.findMany());
  const calledNumbers              = await fetch('calledNumbers', () => prisma.calledNumber.findMany());
  const admins                     = await fetch('admins', () => prisma.admin.findMany());
  const config_                    = await fetch('config', () => prisma.config.findMany());
  const pendingDeposits            = await fetch('pendingDeposits', () => prisma.pendingDeposit.findMany());
  const depositAttempts            = await fetch('depositAttempts', () => prisma.depositAttempt.findMany());
  const agents                     = await fetch('agents', () => prisma.agent.findMany());
  const agentCommissions           = await fetch('agentCommissions', () => prisma.agentCommission.findMany());
  const agentCommissionWithdrawals = await fetch('agentCommissionWithdrawals', () => prisma.agentCommissionWithdrawal.findMany());
  const cartelaReservations        = await fetch('cartelaReservations', () => prisma.cartelaReservation.findMany());
  const pendingWithdrawals         = await fetch('pendingWithdrawals', () => prisma.pendingWithdrawal.findMany());
  const depositAccounts            = await fetch('depositAccounts', () => prisma.depositAccount.findMany());
  const broadcastTargets           = await fetch('broadcastTargets', () => prisma.broadcastTarget.findMany());
  const promotions                 = await fetch('promotions', () => prisma.promotion.findMany());
  const promotionSchedules         = await fetch('promotionSchedules', () => prisma.promotionSchedule.findMany());
  const promotionLogs              = await fetch('promotionLogs', () => prisma.promotionLog.findMany());
  const promotionBonusDistributions= await fetch('promotionBonusDistributions', () => prisma.promotionBonusDistribution.findMany());
  const crashRounds                = await fetch('crashRounds', () => prisma.crashRound.findMany());
  const crashBets                  = await fetch('crashBets', () => prisma.crashBet.findMany());
  const slotSpins                  = await fetch('slotSpins', () => prisma.slotSpin.findMany());
  const kenoRounds                 = await fetch('kenoRounds', () => prisma.kenoRound.findMany());
  const kenoBets                   = await fetch('kenoBets', () => prisma.kenoBet.findMany());
  const plinkoBets                 = await fetch('plinkoBets', () => prisma.plinkoBet.findMany());
  const royalDropBets              = await fetch('royalDropBets', () => prisma.royalDropBet.findMany());
  const cashiers                   = await fetch('cashiers', () => prisma.cashier.findMany());
  const systemSettings             = await fetch('systemSettings', () => prisma.systemSetting.findMany());
  const gregmornSessions           = await fetch('gregmornSessions', () => prisma.gregmornSession.findMany());
  const gregmornTransactions       = await fetch('gregmornTransactions', () => prisma.gregmornTransaction.findMany());

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

  await fs.writeFile(file, JSON.stringify(data, (_key, val) => typeof val === 'bigint' ? val.toString() : val, 2));

  console.log('\n✓ Backup saved:', file);
  console.log('\nRecord counts:');
  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val)) console.log(`  ${key}: ${val.length}`);
  }
}

backup()
  .catch(e => { console.error('✗ Backup failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
