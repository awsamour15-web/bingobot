#!/usr/bin/env node
/**
 * Fast restore - skips game rounds history, restores only essential data:
 * admins, config, agents, deposit accounts, broadcast targets,
 * cartela definitions, players, wallets, transactions,
 * pending deposits, pending withdrawals, promotions
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();

async function restore(backupFile) {
  console.log(`\n🔄 Restoring essential data from: ${backupFile}\n`);

  const raw = await fs.readFile(backupFile, 'utf-8');
  const { data } = JSON.parse(raw);

  // ── 1. Admins ─────────────────────────────────────────────────────────────
  console.log(`👤 Admins: ${data.admins.length}`);
  for (const r of data.admins) {
    await prisma.admin.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 2. Config ─────────────────────────────────────────────────────────────
  console.log(`⚙️  Config: ${data.config.length}`);
  for (const r of data.config) {
    const value = String(r.value);
    await prisma.config.upsert({ where: { key: r.key }, update: { value }, create: { ...r, value } });
  }

  // ── 3. Agents ─────────────────────────────────────────────────────────────
  console.log(`🤝 Agents: ${data.agents.length}`);
  for (const { referred_players, withdrawals, ...r } of data.agents) {
    await prisma.agent.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 4. Deposit accounts ───────────────────────────────────────────────────
  console.log(`🏦 Deposit accounts: ${data.depositAccounts.length}`);
  for (const r of data.depositAccounts) {
    await prisma.depositAccount.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 5. Broadcast targets ──────────────────────────────────────────────────
  console.log(`📢 Broadcast targets: ${data.broadcastTargets.length}`);
  for (const r of data.broadcastTargets) {
    await prisma.broadcastTarget.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 6. Cartela definitions ────────────────────────────────────────────────
  console.log(`🎴 Cartela definitions: ${data.cartelaDefinitions.length}`);
  for (const r of data.cartelaDefinitions) {
    await prisma.cartelaDefinition.upsert({ where: { cartela_number: r.cartela_number }, update: {}, create: r });
  }

  // ── 7. Players (without referrer first, then update) ──────────────────────
  console.log(`👥 Players: ${data.players.length}`);
  for (const { wallets, ...r } of data.players) {
    await prisma.player.upsert({ where: { id: r.id }, update: {}, create: { ...r, referrer_id: null } });
  }
  console.log(`🔗 Updating referrers...`);
  for (const { wallets, ...r } of data.players) {
    if (r.referrer_id) {
      await prisma.player.update({ where: { id: r.id }, data: { referrer_id: r.referrer_id } });
    }
  }

  // ── 8. Wallets ────────────────────────────────────────────────────────────
  const allWallets = data.players.flatMap(p => p.wallets);
  console.log(`💰 Wallets: ${allWallets.length}`);
  for (const r of allWallets) {
    await prisma.wallet.upsert({ where: { id: r.id }, update: { balance: r.balance }, create: r });
  }

  // ── 9. Transactions ───────────────────────────────────────────────────────
  console.log(`💳 Transactions: ${data.transactions.length}`);
  for (const r of data.transactions) {
    await prisma.transaction.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 10. Pending deposits ──────────────────────────────────────────────────
  console.log(`📥 Pending deposits: ${data.pendingDeposits.length}`);
  for (const r of data.pendingDeposits) {
    await prisma.pendingDeposit.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 11. Pending withdrawals ───────────────────────────────────────────────
  console.log(`📤 Pending withdrawals: ${data.pendingWithdrawals.length}`);
  for (const r of data.pendingWithdrawals) {
    await prisma.pendingWithdrawal.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 12. Agent commission withdrawals ──────────────────────────────────────
  const agentWithdrawals = data.agents.flatMap(a => a.withdrawals);
  console.log(`💸 Agent withdrawals: ${agentWithdrawals.length}`);
  for (const r of agentWithdrawals) {
    await prisma.agentCommissionWithdrawal.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 13. Promotions ────────────────────────────────────────────────────────
  console.log(`📣 Promotions: ${data.promotions.length}`);
  for (const { schedules, logs, bonus_distributions, ...r } of data.promotions) {
    await prisma.promotion.upsert({ where: { id: r.id }, update: {}, create: r });
  }
  const allSchedules = data.promotions.flatMap(p => p.schedules);
  for (const r of allSchedules) {
    await prisma.promotionSchedule.upsert({ where: { id: r.id }, update: {}, create: r });
  }
  const allLogs = data.promotions.flatMap(p => p.logs);
  for (const r of allLogs) {
    await prisma.promotionLog.upsert({ where: { id: r.id }, update: {}, create: r });
  }
  const allBonusDist = data.promotions.flatMap(p => p.bonus_distributions);
  for (const r of allBonusDist) {
    await prisma.promotionBonusDistribution.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  console.log('\n✅ Essential restore completed!\n');
  console.log('⚠️  Game rounds history was skipped (too large).');
  console.log('   New games will work normally going forward.\n');
}

const backupFile = process.argv[2];
if (!backupFile) {
  console.error('Usage: node restore-essential.mjs <backup-file.json>');
  process.exit(1);
}

restore(backupFile)
  .catch(err => {
    console.error('\n❌ Restore failed:', err.message);
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
