#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
config();
const prisma = new PrismaClient();

async function main() {
  // Table sizes from pg
  const sizes = await prisma.$queryRawUnsafe(`
    SELECT
      relname AS table_name,
      pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
      pg_total_relation_size(relid) AS bytes,
      pg_size_pretty(pg_relation_size(relid)) AS data_size,
      pg_size_pretty(pg_indexes_size(relid)) AS index_size,
      reltuples::bigint AS estimated_rows
    FROM pg_catalog.pg_statio_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
  `);

  console.log('\n📊 Database Storage by Table\n');
  console.log('Table'.padEnd(35) + 'Total'.padEnd(12) + 'Data'.padEnd(12) + 'Indexes'.padEnd(12) + 'Rows');
  console.log('─'.repeat(85));
  for (const r of sizes) {
    console.log(
      r.table_name.padEnd(35) +
      String(r.total_size).padEnd(12) +
      String(r.data_size).padEnd(12) +
      String(r.index_size).padEnd(12) +
      r.estimated_rows.toLocaleString()
    );
  }

  // Total DB size
  const total = await prisma.$queryRawUnsafe(`SELECT pg_size_pretty(pg_database_size(current_database())) AS total`);
  console.log('\n─'.repeat(85));
  console.log(`\n💾 Total database size: ${total[0].total}\n`);

  // Row counts for the big tables
  console.log('📈 Exact Row Counts (big tables)\n');
  const counts = await Promise.all([
    prisma.calledNumber.count().then(n => ['called_numbers', n]),
    prisma.roundEntry.count().then(n => ['round_entries', n]),
    prisma.gameRound.count().then(n => ['game_rounds', n]),
    prisma.roundWinner.count().then(n => ['round_winners', n]),
    prisma.transaction.count().then(n => ['transactions', n]),
    prisma.promotionLog.count().then(n => ['promotion_logs', n]),
    prisma.slotSpin.count().then(n => ['slot_spins', n]),
    prisma.crashRound.count().then(n => ['crash_rounds', n]),
    prisma.kenoRound.count().then(n => ['keno_rounds', n]),
    prisma.player.count().then(n => ['players', n]),
    prisma.wallet.count().then(n => ['wallets', n]),
  ]);
  for (const [name, count] of counts) {
    console.log(`  ${name.padEnd(32)} ${count.toLocaleString()}`);
  }

  // Oldest data
  console.log('\n📅 Oldest Data\n');
  const oldest = await prisma.gameRound.findFirst({ orderBy: { start_time: 'asc' }, select: { start_time: true } });
  const newest = await prisma.gameRound.findFirst({ orderBy: { start_time: 'desc' }, select: { start_time: true } });
  if (oldest) console.log(`  game_rounds span: ${oldest.start_time.toISOString()} → ${newest.start_time.toISOString()}`);

  // How much we'd save by deleting old rounds
  const cutoffs = [1, 2, 7, 14, 30];
  console.log('\n✂️  Potential Savings by Deleting Old Rounds\n');
  for (const days of cutoffs) {
    const dt = new Date(); dt.setDate(dt.getDate() - days);
    const rounds = await prisma.gameRound.count({ where: { start_time: { lt: dt } } });
    const entries = await prisma.roundEntry.count({ where: { round: { start_time: { lt: dt } } } });
    const called = await prisma.calledNumber.count({ where: { round: { start_time: { lt: dt } } } });
    console.log(`  Older than ${String(days).padStart(2)} day(s): ${rounds.toLocaleString()} rounds, ${entries.toLocaleString()} entries, ${called.toLocaleString()} called numbers`);
  }
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
