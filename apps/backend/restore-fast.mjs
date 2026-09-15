#!/usr/bin/env node
/**
 * Fast batch restore to Supabase from JSON backup
 * Uses createMany with skipDuplicates for speed
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});
const BATCH = 500;

function reviver(key, value) {
  if (key === 'telegram_id' && typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return value;
}

async function batchInsert(label, records, fn) {
  if (!records?.length) { console.log(`  ⏭  ${label}: 0`); return; }
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    await fn(chunk);
    inserted += chunk.length;
    process.stdout.write(`\r  ✦ ${label}: ${inserted}/${records.length}`);
  }
  console.log(`\r  ✅ ${label}: ${records.length}`);
}

async function restore(backupFile) {
  console.log(`\n🔄 Restoring from: ${backupFile}\n`);
  const raw = await fs.readFile(backupFile, 'utf-8');
  const parsed = JSON.parse(raw, reviver);
  const d = parsed.data ?? parsed;

  // 1. Admins
  await batchInsert('Admins', d.admins, c =>
    prisma.admin.createMany({ data: c, skipDuplicates: true }));

  // 2. Config
  await batchInsert('Config', d.config, c =>
    prisma.config.createMany({ data: c, skipDuplicates: true }));

  // 3. Agents
  await batchInsert('Agents', d.agents?.map(({ referred_players, withdrawals, ...r }) => r), c =>
    prisma.agent.createMany({ data: c, skipDuplicates: true }));

  // 4. Deposit accounts
  await batchInsert('Deposit accounts', d.depositAccounts, c =>
    prisma.depositAccount.createMany({ data: c, skipDuplicates: true }));

  // 5. Broadcast targets
  await batchInsert('Broadcast targets', d.broadcastTargets, c =>
    prisma.broadcastTarget.createMany({ data: c, skipDuplicates: true }));

  // 6. Cartela definitions
  await batchInsert('Cartela definitions', d.cartelaDefinitions, c =>
    prisma.cartelaDefinition.createMany({ data: c, skipDuplicates: true }));

  // 7. Players (without referrer first)
  const players = d.players?.map(({ wallets, ...r }) => ({ ...r, referrer_id: null }));
  await batchInsert('Players', players, c =>
    prisma.player.createMany({ data: c, skipDuplicates: true }));

  // 8. Update referrer_ids
  const withRefs = d.players?.filter(p => p.referrer_id);
  console.log(`  ↻  Updating ${withRefs?.length ?? 0} referrer_ids...`);
  for (const { id, referrer_id } of withRefs ?? []) {
    await prisma.player.update({ where: { id }, data: { referrer_id } }).catch(() => {});
  }

  // 9. Wallets
  const wallets = d.wallets ?? d.players?.flatMap(p => p.wallets ?? []);
  await batchInsert('Wallets', wallets?.map(({ transactions, ...r }) => r), c =>
    prisma.wallet.createMany({ data: c, skipDuplicates: true }));

  // 10. Transactions
  await batchInsert('Transactions', d.transactions, c =>
    prisma.transaction.createMany({ data: c, skipDuplicates: true }));

  // 11. Pending deposits
  await batchInsert('Pending deposits', d.pendingDeposits, c =>
    prisma.pendingDeposit.createMany({ data: c, skipDuplicates: true }));

  // 12. Deposit attempts
  await batchInsert('Deposit attempts', d.depositAttempts, c =>
    prisma.depositAttempt.createMany({ data: c, skipDuplicates: true }));

  // 13. Pending withdrawals
  await batchInsert('Pending withdrawals', d.pendingWithdrawals, c =>
    prisma.pendingWithdrawal.createMany({ data: c, skipDuplicates: true }));

  // 14. Game rounds
  const gameRounds = d.gameRounds?.map(({ round_entries, round_winners, called_numbers, ...r }) => r);
  await batchInsert('Game rounds', gameRounds, c =>
    prisma.gameRound.createMany({ data: c, skipDuplicates: true }));

  // 15. Round entries
  const entries = d.roundEntries ?? d.gameRounds?.flatMap(g => g.round_entries ?? []);
  await batchInsert('Round entries', entries, c =>
    prisma.roundEntry.createMany({ data: c, skipDuplicates: true }));

  // 16. Round winners
  const winners = d.roundWinners ?? d.gameRounds?.flatMap(g => g.round_winners ?? []);
  await batchInsert('Round winners', winners, c =>
    prisma.roundWinner.createMany({ data: c, skipDuplicates: true }));

  // 17. Called numbers
  const called = d.calledNumbers ?? d.gameRounds?.flatMap(g => g.called_numbers ?? []);
  await batchInsert('Called numbers', called, c =>
    prisma.calledNumber.createMany({ data: c, skipDuplicates: true }));

  // 18. Agent commissions
  await batchInsert('Agent commissions', d.agentCommissions, c =>
    prisma.agentCommission.createMany({ data: c, skipDuplicates: true }));

  // 19. Agent commission withdrawals
  const agentWithdrawals = d.agentCommissionWithdrawals ?? d.agents?.flatMap(a => a.withdrawals ?? []);
  await batchInsert('Agent withdrawals', agentWithdrawals, c =>
    prisma.agentCommissionWithdrawal.createMany({ data: c, skipDuplicates: true }));

  // 20. Cartela reservations
  await batchInsert('Cartela reservations', d.cartelaReservations, c =>
    prisma.cartelaReservation.createMany({ data: c, skipDuplicates: true }));

  // 21. Promotions
  const promos = d.promotions?.map(({ schedules, logs, bonus_distributions, ...r }) => r);
  await batchInsert('Promotions', promos, c =>
    prisma.promotion.createMany({ data: c, skipDuplicates: true }));

  // 22. Promotion schedules
  const schedules = d.promotionSchedules ?? d.promotions?.flatMap(p => p.schedules ?? []);
  await batchInsert('Promotion schedules', schedules?.map(({ logs, ...r }) => r), c =>
    prisma.promotionSchedule.createMany({ data: c, skipDuplicates: true }));

  // 23. Promotion logs
  const promoLogs = d.promotionLogs ?? d.promotions?.flatMap(p => p.logs ?? []);
  await batchInsert('Promotion logs', promoLogs, c =>
    prisma.promotionLog.createMany({ data: c, skipDuplicates: true }));

  // 24. Promotion bonus distributions
  const bonusDist = d.promotionBonusDistributions ?? d.promotions?.flatMap(p => p.bonus_distributions ?? []);
  await batchInsert('Bonus distributions', bonusDist, c =>
    prisma.promotionBonusDistribution.createMany({ data: c, skipDuplicates: true }));

  // 25. Crash rounds
  await batchInsert('Crash rounds', d.crashRounds, c =>
    prisma.crashRound.createMany({ data: c, skipDuplicates: true }));

  // 26. Crash bets
  await batchInsert('Crash bets', d.crashBets, c =>
    prisma.crashBet.createMany({ data: c, skipDuplicates: true }));

  // 27. Slot spins
  await batchInsert('Slot spins', d.slotSpins, c =>
    prisma.slotSpin.createMany({ data: c, skipDuplicates: true }));

  // 28. Keno rounds
  await batchInsert('Keno rounds', d.kenoRounds, c =>
    prisma.kenoRound.createMany({ data: c, skipDuplicates: true }));

  // 29. Keno bets
  await batchInsert('Keno bets', d.kenoBets, c =>
    prisma.kenoBet.createMany({ data: c, skipDuplicates: true }));

  // 30. Plinko bets
  await batchInsert('Plinko bets', d.plinkoBets, c =>
    prisma.plinkoBet.createMany({ data: c, skipDuplicates: true }));

  // 31. Royal drop bets
  await batchInsert('Royal drop bets', d.royalDropBets, c =>
    prisma.royalDropBet.createMany({ data: c, skipDuplicates: true }));

  // 32. Cashiers
  await batchInsert('Cashiers', d.cashiers, c =>
    prisma.cashier.createMany({ data: c, skipDuplicates: true }));

  // 33. System settings
  await batchInsert('System settings', d.systemSettings, c =>
    prisma.systemSetting.createMany({ data: c, skipDuplicates: true }));

  // 34. Gregmorn sessions
  await batchInsert('Gregmorn sessions', d.gregmornSessions, c =>
    prisma.gregmornSession.createMany({ data: c, skipDuplicates: true }));

  // 35. Gregmorn transactions
  await batchInsert('Gregmorn transactions', d.gregmornTransactions, c =>
    prisma.gregmornTransaction.createMany({ data: c, skipDuplicates: true }));

  console.log('\n✅ Restore completed successfully!\n');
}

const backupFile = process.argv[2];
if (!backupFile) { console.error('Usage: node restore-fast.mjs <backup.json>'); process.exit(1); }

restore(backupFile)
  .catch(err => { console.error('\n❌ Restore failed:', err.message, err); process.exit(1); })
  .finally(() => prisma.$disconnect());
