#!/usr/bin/env node
/**
 * Restore database from JSON backup
 * Run: node restore-backup.mjs ./backups/backup_XXXX.json
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();

function reviver(key, value) {
  // Only convert telegram_id fields to BigInt (they are always large numbers)
  if (key === 'telegram_id' && typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return value;
}

async function restore(backupFile) {
  console.log(`\n🔄 Restoring from: ${backupFile}\n`);

  const raw = await fs.readFile(backupFile, 'utf-8');
  const { data } = JSON.parse(raw, reviver);

  // ── 1. Admins ────────────────────────────────────────────────────────────
  console.log(`👤 Admins: ${data.admins.length}`);
  for (const r of data.admins) {
    await prisma.admin.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 2. Config ────────────────────────────────────────────────────────────
  console.log(`⚙️  Config: ${data.config.length}`);
  for (const r of data.config) {
    const value = typeof r.value === 'bigint' ? r.value.toString() : String(r.value);
    await prisma.config.upsert({ where: { key: r.key }, update: { value }, create: { ...r, value } });
  }

  // ── 3. Agents ────────────────────────────────────────────────────────────
  console.log(`🤝 Agents: ${data.agents.length}`);
  for (const { referred_players, withdrawals, ...r } of data.agents) {
    await prisma.agent.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 4. Deposit accounts ──────────────────────────────────────────────────
  console.log(`🏦 Deposit accounts: ${data.depositAccounts.length}`);
  for (const r of data.depositAccounts) {
    await prisma.depositAccount.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 5. Broadcast targets ─────────────────────────────────────────────────
  console.log(`📢 Broadcast targets: ${data.broadcastTargets.length}`);
  for (const r of data.broadcastTargets) {
    await prisma.broadcastTarget.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 6. Cartela definitions ───────────────────────────────────────────────
  console.log(`🎴 Cartela definitions: ${data.cartelaDefinitions.length}`);
  for (const r of data.cartelaDefinitions) {
    await prisma.cartelaDefinition.upsert({
      where: { cartela_number: r.cartela_number },
      update: {},
      create: r,
    });
  }

  // ── 7. Players (insert without referrer_id first, then update) ──────────
  console.log(`👥 Players: ${data.players.length}`);
  for (const { wallets, ...r } of data.players) {
    await prisma.player.upsert({ where: { id: r.id }, update: {}, create: { ...r, referrer_id: null } });
  }
  // Now update referrer_id
  for (const { wallets, ...r } of data.players) {
    if (r.referrer_id) {
      await prisma.player.update({ where: { id: r.id }, data: { referrer_id: r.referrer_id } });
    }
  }

  // ── 8. Wallets ───────────────────────────────────────────────────────────
  const allWallets = data.players.flatMap(p => p.wallets);
  console.log(`💰 Wallets: ${allWallets.length}`);
  for (const { transactions, ...r } of allWallets) {
    await prisma.wallet.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 9. Transactions ──────────────────────────────────────────────────────
  console.log(`💳 Transactions: ${data.transactions.length}`);
  for (const r of data.transactions) {
    await prisma.transaction.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 10. Pending deposits ─────────────────────────────────────────────────
  console.log(`📥 Pending deposits: ${data.pendingDeposits.length}`);
  for (const r of data.pendingDeposits) {
    await prisma.pendingDeposit.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 11. Pending withdrawals ──────────────────────────────────────────────
  console.log(`📤 Pending withdrawals: ${data.pendingWithdrawals.length}`);
  for (const r of data.pendingWithdrawals) {
    await prisma.pendingWithdrawal.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 12. Game rounds (no relations yet) ──────────────────────────────────
  console.log(`🎮 Game rounds: ${data.gameRounds.length}`);
  for (const { round_entries, round_winners, called_numbers, ...r } of data.gameRounds) {
    await prisma.gameRound.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 13. Round entries ────────────────────────────────────────────────────
  const allEntries = data.gameRounds.flatMap(g => g.round_entries);
  console.log(`📋 Round entries: ${allEntries.length}`);
  for (const r of allEntries) {
    await prisma.roundEntry.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 14. Round winners ────────────────────────────────────────────────────
  const allWinners = data.gameRounds.flatMap(g => g.round_winners);
  console.log(`🏆 Round winners: ${allWinners.length}`);
  for (const r of allWinners) {
    await prisma.roundWinner.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 15. Called numbers ───────────────────────────────────────────────────
  const allCalled = data.gameRounds.flatMap(g => g.called_numbers);
  console.log(`🔢 Called numbers: ${allCalled.length}`);
  for (const r of allCalled) {
    await prisma.calledNumber.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 16. Agent commission withdrawals ─────────────────────────────────────
  const agentWithdrawals = data.agents.flatMap(a => a.withdrawals);
  console.log(`💸 Agent withdrawals: ${agentWithdrawals.length}`);
  for (const r of agentWithdrawals) {
    await prisma.agentCommissionWithdrawal.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 17. Promotions ───────────────────────────────────────────────────────
  console.log(`📣 Promotions: ${data.promotions.length}`);
  for (const { schedules, logs, bonus_distributions, ...r } of data.promotions) {
    await prisma.promotion.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 18. Promotion schedules ──────────────────────────────────────────────
  const allSchedules = data.promotions.flatMap(p => p.schedules);
  console.log(`📅 Promotion schedules: ${allSchedules.length}`);
  for (const { logs, ...r } of allSchedules) {
    await prisma.promotionSchedule.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 19. Promotion logs ───────────────────────────────────────────────────
  const allLogs = data.promotions.flatMap(p => p.logs);
  console.log(`📝 Promotion logs: ${allLogs.length}`);
  for (const r of allLogs) {
    await prisma.promotionLog.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── 20. Promotion bonus distributions ────────────────────────────────────
  const allBonusDist = data.promotions.flatMap(p => p.bonus_distributions);
  console.log(`🎁 Bonus distributions: ${allBonusDist.length}`);
  for (const r of allBonusDist) {
    await prisma.promotionBonusDistribution.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  console.log('\n✅ Restore completed successfully!\n');
}

const backupFile = process.argv[2];
if (!backupFile) {
  console.error('Usage: node restore-backup.mjs <backup-file.json>');
  process.exit(1);
}

restore(backupFile)
  .catch(err => {
    console.error('\n❌ Restore failed:', err.message);
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
