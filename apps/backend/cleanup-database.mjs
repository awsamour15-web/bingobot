/**
 * cleanup-database.mjs
 *
 * Safely deletes old data to free up storage on Neon free tier.
 * Run with: node cleanup-database.mjs
 *
 * What it deletes (older than DAYS_TO_KEEP):
 *  - completed/cancelled/void game rounds + their entries, called numbers, winners
 *  - crash/keno/slot/plinko/royal_drop bets from old rounds
 *  - gregmorn sessions + transactions
 *  - promotion logs
 *  - deposit attempts
 *  - cartela reservations (expired)
 *
 * What it NEVER touches:
 *  - players, wallets, transactions (financial records)
 *  - agents, admins, config
 *  - active/pending rounds
 *  - pending deposits/withdrawals
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const prisma = new PrismaClient();

// Keep data from the last N days — change this as needed
const DAYS_TO_KEEP = 30;
const cutoff = new Date(Date.now() - DAYS_TO_KEEP * 24 * 60 * 60 * 1000);

console.log(`\n🧹 Database Cleanup Script`);
console.log(`   Deleting records older than: ${cutoff.toISOString()}`);
console.log(`   (keeping last ${DAYS_TO_KEEP} days)\n`);

async function getTableSize(tableName) {
  try {
    const result = await prisma.$queryRawUnsafe(
      `SELECT pg_size_pretty(pg_total_relation_size($1)) AS size, 
              (SELECT count(*) FROM ${tableName}) AS row_count`,
      tableName
    );
    return result[0];
  } catch {
    return null;
  }
}

async function printSizes(label) {
  console.log(`\n📊 Table sizes ${label}:`);
  const tables = [
    'transactions', 'round_entries', 'called_numbers', 'game_rounds',
    'crash_bets', 'crash_rounds', 'slot_spins', 'keno_bets', 'keno_rounds',
    'plinko_bets', 'royal_drop_bets', 'gregmorn_transactions', 'gregmorn_sessions',
    'promotion_logs', 'deposit_attempts', 'cartela_reservations', 'round_winners'
  ];
  for (const t of tables) {
    const info = await getTableSize(t);
    if (info) {
      console.log(`   ${t.padEnd(30)} ${String(info.row_count).padStart(8)} rows  ${info.size}`);
    }
  }
}

async function cleanup() {
  await printSizes('BEFORE cleanup');

  console.log('\n🗑️  Starting cleanup...\n');

  // 1. Expired cartela reservations
  const reservations = await prisma.cartelaReservation.deleteMany({
    where: { expires_at: { lt: new Date() } }
  });
  console.log(`✓ Cartela reservations (expired):     ${reservations.count} deleted`);

  // 2. Promotion logs
  const promoLogs = await prisma.promotionLog.deleteMany({
    where: { sent_at: { lt: cutoff } }
  });
  console.log(`✓ Promotion logs:                     ${promoLogs.count} deleted`);

  // 3. Deposit attempts
  const depositAttempts = await prisma.depositAttempt.deleteMany({
    where: { created_at: { lt: cutoff } }
  });
  console.log(`✓ Deposit attempts:                   ${depositAttempts.count} deleted`);

  // 4. Gregmorn sessions + transactions
  const gregTx = await prisma.gregmornTransaction.deleteMany({
    where: { created_at: { lt: cutoff } }
  });
  console.log(`✓ Gregmorn transactions:              ${gregTx.count} deleted`);

  const gregSessions = await prisma.gregmornSession.deleteMany({
    where: { created_at: { lt: cutoff } }
  });
  console.log(`✓ Gregmorn sessions:                  ${gregSessions.count} deleted`);

  // 5. Mini-game bets (standalone, not linked to rounds)
  const slotSpins = await prisma.slotSpin.deleteMany({
    where: { created_at: { lt: cutoff } }
  });
  console.log(`✓ Slot spins:                         ${slotSpins.count} deleted`);

  const plinkoBets = await prisma.plinkoBet.deleteMany({
    where: { created_at: { lt: cutoff } }
  });
  console.log(`✓ Plinko bets:                        ${plinkoBets.count} deleted`);

  const royalDropBets = await prisma.royalDropBet.deleteMany({
    where: { created_at: { lt: cutoff } }
  });
  console.log(`✓ Royal drop bets:                    ${royalDropBets.count} deleted`);

  // 6. Old crash rounds + bets (only completed/crashed)
  const oldCrashRounds = await prisma.crashRound.findMany({
    where: {
      status: 'crashed',
      created_at: { lt: cutoff }
    },
    select: { id: true }
  });
  if (oldCrashRounds.length > 0) {
    const crashRoundIds = oldCrashRounds.map(r => r.id);
    const crashBets = await prisma.crashBet.deleteMany({
      where: { round_id: { in: crashRoundIds } }
    });
    console.log(`✓ Crash bets:                         ${crashBets.count} deleted`);
    const crashRounds = await prisma.crashRound.deleteMany({
      where: { id: { in: crashRoundIds } }
    });
    console.log(`✓ Crash rounds:                       ${crashRounds.count} deleted`);
  } else {
    console.log(`✓ Crash bets/rounds:                  0 deleted`);
  }

  // 7. Old keno rounds + bets (only finished)
  const oldKenoRounds = await prisma.kenoRound.findMany({
    where: {
      status: 'finished',
      created_at: { lt: cutoff }
    },
    select: { id: true }
  });
  if (oldKenoRounds.length > 0) {
    const kenoRoundIds = oldKenoRounds.map(r => r.id);
    const kenoBets = await prisma.kenoBet.deleteMany({
      where: { round_id: { in: kenoRoundIds } }
    });
    console.log(`✓ Keno bets:                          ${kenoBets.count} deleted`);
    const kenoRounds = await prisma.kenoRound.deleteMany({
      where: { id: { in: kenoRoundIds } }
    });
    console.log(`✓ Keno rounds:                        ${kenoRounds.count} deleted`);
  } else {
    console.log(`✓ Keno bets/rounds:                   0 deleted`);
  }

  // 8. Old bingo game rounds (completed/cancelled/void) + children
  const oldBingoRounds = await prisma.gameRound.findMany({
    where: {
      status: { in: ['completed', 'cancelled', 'void'] },
      start_time: { lt: cutoff }
    },
    select: { id: true }
  });

  if (oldBingoRounds.length > 0) {
    const roundIds = oldBingoRounds.map(r => r.id);

    const reserv2 = await prisma.cartelaReservation.deleteMany({
      where: { round_id: { in: roundIds } }
    });
    const entries = await prisma.roundEntry.deleteMany({
      where: { round_id: { in: roundIds } }
    });
    const calledNums = await prisma.calledNumber.deleteMany({
      where: { round_id: { in: roundIds } }
    });
    const roundWinners = await prisma.roundWinner.deleteMany({
      where: { round_id: { in: roundIds } }
    });
    const gameRounds = await prisma.gameRound.deleteMany({
      where: { id: { in: roundIds } }
    });

    console.log(`✓ Old bingo rounds:                   ${gameRounds.count} deleted`);
    console.log(`  ↳ Round entries:                    ${entries.count}`);
    console.log(`  ↳ Called numbers:                   ${calledNums.count}`);
    console.log(`  ↳ Round winners:                    ${roundWinners.count}`);
    console.log(`  ↳ Cartela reservations (linked):    ${reserv2.count}`);
  } else {
    console.log(`✓ Old bingo rounds:                   0 deleted`);
  }

  await printSizes('AFTER cleanup');

  // Run VACUUM to reclaim space
  console.log('\n🔧 Running VACUUM ANALYZE to reclaim space...');
  try {
    await prisma.$executeRawUnsafe('VACUUM ANALYZE');
    console.log('✓ VACUUM complete\n');
  } catch (e) {
    console.log('⚠️  VACUUM skipped (may not be supported on free tier pooled connections)\n');
  }

  console.log('✅ Cleanup complete!\n');
}

cleanup()
  .catch(e => {
    console.error('❌ Cleanup failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
