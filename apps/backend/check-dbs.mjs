import { PrismaClient } from '@prisma/client';

const RENDER_URL = 'postgresql://fidelbingo_user:Y3Lbz9YxkWZ4Ssmwvm4NPKGH89kyPs6V@dpg-d9l6hfrm8hqs739bm19g-a.oregon-postgres.render.com:5432/fidelbingo';
const NEON_URL = 'postgresql://neondb_owner:npg_haZGQOu3M1jT@ep-raspy-sound-axdqg09y-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkDB(name, url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const [players, wallets, transactions, gameRounds, agents, pendingDeposits, pendingWithdrawals, admins, crashRounds, slotSpins, kenoRounds] = await Promise.all([
      prisma.player.count(),
      prisma.wallet.count(),
      prisma.transaction.count(),
      prisma.gameRound.count(),
      prisma.agent.count(),
      prisma.pendingDeposit.count(),
      prisma.pendingWithdrawal.count(),
      prisma.admin.count(),
      prisma.crashRound.count().catch(() => 'n/a'),
      prisma.slotSpin.count().catch(() => 'n/a'),
      prisma.kenoRound.count().catch(() => 'n/a'),
    ]);
    console.log(`\n✅ ${name}: CONNECTED`);
    console.log(`   players:          ${players}`);
    console.log(`   wallets:          ${wallets}`);
    console.log(`   transactions:     ${transactions}`);
    console.log(`   gameRounds:       ${gameRounds}`);
    console.log(`   agents:           ${agents}`);
    console.log(`   pendingDeposits:  ${pendingDeposits}`);
    console.log(`   pendingWithdrawals:${pendingWithdrawals}`);
    console.log(`   admins:           ${admins}`);
    console.log(`   crashRounds:      ${crashRounds}`);
    console.log(`   slotSpins:        ${slotSpins}`);
    console.log(`   kenoRounds:       ${kenoRounds}`);
  } catch (e) {
    console.log(`\n❌ ${name}: FAILED`);
    console.log(`   ${e.message.split('\n')[0]}`);
  } finally {
    await prisma.$disconnect();
  }
}

console.log('Checking both databases...');
await checkDB('RENDER DB', RENDER_URL);
await checkDB('NEON DB  ', NEON_URL);
console.log('\nDone.');
