#!/usr/bin/env node
/**
 * Cleanup script - deletes game rounds and related data older than 2 days
 * Run: node cleanup-old-rounds.mjs
 * Or with custom days: node cleanup-old-rounds.mjs 7
 */

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();
const DAYS_TO_KEEP = parseInt(process.argv[2]) || 2;

async function cleanup() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP);

  console.log(`\n🗑️  Cleaning up game data older than ${DAYS_TO_KEEP} days (before ${cutoffDate.toISOString()})\n`);

  try {
    // 1. Delete called numbers (foreign key to game_rounds)
    const calledNumbers = await prisma.calledNumber.deleteMany({
      where: { round: { start_time: { lt: cutoffDate } } }
    });
    console.log(`✓ Deleted ${calledNumbers.count} called numbers`);

    // 2. Delete round bonus winners
    const bonusWinners = await prisma.roundBonusWinner.deleteMany({
      where: { round: { start_time: { lt: cutoffDate } } }
    });
    console.log(`✓ Deleted ${bonusWinners.count} bonus winners`);

    // 3. Delete round winners
    const roundWinners = await prisma.roundWinner.deleteMany({
      where: { round: { start_time: { lt: cutoffDate } } }
    });
    console.log(`✓ Deleted ${roundWinners.count} round winners`);

    // 4. Delete round entries
    const roundEntries = await prisma.roundEntry.deleteMany({
      where: { round: { start_time: { lt: cutoffDate } } }
    });
    console.log(`✓ Deleted ${roundEntries.count} round entries`);

    // 5. Delete cartela reservations
    const reservations = await prisma.cartelaReservation.deleteMany({
      where: { round: { start_time: { lt: cutoffDate } } }
    });
    console.log(`✓ Deleted ${reservations.count} cartela reservations`);

    // 6. Delete game rounds
    const gameRounds = await prisma.gameRound.deleteMany({
      where: { start_time: { lt: cutoffDate } }
    });
    console.log(`✓ Deleted ${gameRounds.count} game rounds`);

    console.log('\n✅ Cleanup completed successfully!\n');

    // Show storage stats
    const remaining = await prisma.gameRound.count();
    console.log(`📊 Remaining game rounds: ${remaining}\n`);

  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

cleanup()
  .finally(() => prisma.$disconnect());
