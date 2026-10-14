#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
config();

const prisma = new PrismaClient();
const KEEP_DAYS = 10;
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - KEEP_DAYS);

console.log(`\nDeleting game data older than ${KEEP_DAYS} days (before ${cutoff.toISOString()})\n`);

async function run() {
  const cn  = await prisma.calledNumber.deleteMany({ where: { round: { start_time: { lt: cutoff } } } });
  console.log(`✓ calledNumbers:        ${cn.count}`);

  const rbw = await prisma.roundBonusWinner.deleteMany({ where: { round: { start_time: { lt: cutoff } } } });
  console.log(`✓ roundBonusWinners:    ${rbw.count}`);

  const rw  = await prisma.roundWinner.deleteMany({ where: { round: { start_time: { lt: cutoff } } } });
  console.log(`✓ roundWinners:         ${rw.count}`);

  const re  = await prisma.roundEntry.deleteMany({ where: { round: { start_time: { lt: cutoff } } } });
  console.log(`✓ roundEntries:         ${re.count}`);

  const cr  = await prisma.cartelaReservation.deleteMany({ where: { round: { start_time: { lt: cutoff } } } });
  console.log(`✓ cartelaReservations:  ${cr.count}`);

  const gr  = await prisma.gameRound.deleteMany({ where: { start_time: { lt: cutoff } } });
  console.log(`✓ gameRounds:           ${gr.count}`);

  console.log('\n✅ Done!');
}

run()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
