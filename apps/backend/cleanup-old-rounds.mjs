#!/usr/bin/env node
/**
 * Cleanup script - keeps only the last N records of each game history table
 * Run: node cleanup-old-rounds.mjs
 * Or with custom keep count: node cleanup-old-rounds.mjs 24
 */

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();
const KEEP = parseInt(process.argv[2]) || 24;

async function cleanupTable(label, findRecent, deleteOld) {
  const recent = await findRecent(KEEP);
  const keepIds = recent.map(r => r.id);

  if (keepIds.length === 0) {
    console.log(`  ${label}: nothing to delete (0 records)`);
    return 0;
  }

  const deleted = await deleteOld(keepIds);
  console.log(`  ✓ ${label}: deleted ${deleted}`);
  return deleted;
}

async function cleanup() {
  console.log(`\n🗑️  Keeping last ${KEEP} records per game history table\n`);

  try {
    // ── Bingo game rounds ──────────────────────────────────────────────────────
    const recentBingo = await prisma.gameRound.findMany({
      where:   { status: { in: ['completed', 'cancelled', 'void'] } },
      orderBy: { start_time: 'desc' },
      take:    KEEP,
      select:  { id: true },
    });
    const keepBingo = recentBingo.map(r => r.id);

    const oldBingo = await prisma.gameRound.findMany({
      where: {
        status: { in: ['completed', 'cancelled', 'void'] },
        ...(keepBingo.length > 0 ? { id: { notIn: keepBingo } } : {}),
      },
      select: { id: true },
    });
    const oldBingoIds = oldBingo.map(r => r.id);

    if (oldBingoIds.length > 0) {
      const cn  = await prisma.calledNumber.deleteMany({ where: { round_id: { in: oldBingoIds } } });
      const rbw = await prisma.roundBonusWinner.deleteMany({ where: { round_id: { in: oldBingoIds } } });
      const rw  = await prisma.roundWinner.deleteMany({ where: { round_id: { in: oldBingoIds } } });
      const re  = await prisma.roundEntry.deleteMany({ where: { round_id: { in: oldBingoIds } } });
      const cr  = await prisma.cartelaReservation.deleteMany({ where: { round_id: { in: oldBingoIds } } });
      const gr  = await prisma.gameRound.deleteMany({ where: { id: { in: oldBingoIds } } });
      console.log(`  ✓ Bingo rounds:       deleted ${gr.count} rounds, ${cn.count} called numbers, ${re.count} entries, ${rw.count} winners, ${rbw.count} bonus winners, ${cr.count} reservations`);
    } else {
      console.log(`  Bingo rounds: nothing to delete (≤${KEEP} completed rounds)`);
    }

    // ── Crash rounds ───────────────────────────────────────────────────────────
    const recentCrash = await prisma.crashRound.findMany({
      where:   { status: 'crashed' },
      orderBy: { created_at: 'desc' },
      take:    KEEP,
      select:  { id: true },
    });
    const keepCrash = recentCrash.map(r => r.id);
    const oldCrash  = await prisma.crashRound.findMany({
      where: {
        status: 'crashed',
        ...(keepCrash.length > 0 ? { id: { notIn: keepCrash } } : {}),
      },
      select: { id: true },
    });
    const oldCrashIds = oldCrash.map(r => r.id);
    if (oldCrashIds.length > 0) {
      const bets   = await prisma.crashBet.deleteMany({ where: { round_id: { in: oldCrashIds } } });
      const rounds = await prisma.crashRound.deleteMany({ where: { id: { in: oldCrashIds } } });
      console.log(`  ✓ Crash rounds:       deleted ${rounds.count} rounds, ${bets.count} bets`);
    } else {
      console.log(`  Crash rounds: nothing to delete (≤${KEEP} finished rounds)`);
    }

    // ── Keno rounds ───────────────────────────────────────────────────────────
    const recentKeno = await prisma.kenoRound.findMany({
      where:   { status: 'finished' },
      orderBy: { created_at: 'desc' },
      take:    KEEP,
      select:  { id: true },
    });
    const keepKeno = recentKeno.map(r => r.id);
    const oldKeno  = await prisma.kenoRound.findMany({
      where: {
        status: 'finished',
        ...(keepKeno.length > 0 ? { id: { notIn: keepKeno } } : {}),
      },
      select: { id: true },
    });
    const oldKenoIds = oldKeno.map(r => r.id);
    if (oldKenoIds.length > 0) {
      const bets   = await prisma.kenoBet.deleteMany({ where: { round_id: { in: oldKenoIds } } });
      const rounds = await prisma.kenoRound.deleteMany({ where: { id: { in: oldKenoIds } } });
      console.log(`  ✓ Keno rounds:        deleted ${rounds.count} rounds, ${bets.count} bets`);
    } else {
      console.log(`  Keno rounds: nothing to delete (≤${KEEP} finished rounds)`);
    }

    // ── Slot spins (per-player, keep last KEEP globally) ─────────────────────
    const recentSlots = await prisma.slotSpin.findMany({
      orderBy: { created_at: 'desc' },
      take:    KEEP,
      select:  { id: true },
    });
    const keepSlots = recentSlots.map(r => r.id);
    const deletedSlots = keepSlots.length > 0
      ? await prisma.slotSpin.deleteMany({ where: { id: { notIn: keepSlots } } })
      : { count: 0 };
    console.log(`  ✓ Slot spins:         deleted ${deletedSlots.count}`);

    // ── Plinko bets ───────────────────────────────────────────────────────────
    const recentPlinko = await prisma.plinkoBet.findMany({
      orderBy: { created_at: 'desc' },
      take:    KEEP,
      select:  { id: true },
    });
    const keepPlinko = recentPlinko.map(r => r.id);
    const deletedPlinko = keepPlinko.length > 0
      ? await prisma.plinkoBet.deleteMany({ where: { id: { notIn: keepPlinko } } })
      : { count: 0 };
    console.log(`  ✓ Plinko bets:        deleted ${deletedPlinko.count}`);

    // ── Royal Drop bets ───────────────────────────────────────────────────────
    const recentRoyalDrop = await prisma.royalDropBet.findMany({
      orderBy: { created_at: 'desc' },
      take:    KEEP,
      select:  { id: true },
    });
    const keepRoyalDrop = recentRoyalDrop.map(r => r.id);
    const deletedRoyalDrop = keepRoyalDrop.length > 0
      ? await prisma.royalDropBet.deleteMany({ where: { id: { notIn: keepRoyalDrop } } })
      : { count: 0 };
    console.log(`  ✓ Royal Drop bets:    deleted ${deletedRoyalDrop.count}`);

    // ── Gregmorn transactions & sessions ─────────────────────────────────────
    const recentGregTx = await prisma.gregmornTransaction.findMany({
      orderBy: { created_at: 'desc' },
      take:    KEEP,
      select:  { id: true },
    });
    const keepGregTx = recentGregTx.map(r => r.id);
    const deletedGregTx = keepGregTx.length > 0
      ? await prisma.gregmornTransaction.deleteMany({ where: { id: { notIn: keepGregTx } } })
      : { count: 0 };
    console.log(`  ✓ Gregmorn tx:        deleted ${deletedGregTx.count}`);

    const recentGregSess = await prisma.gregmornSession.findMany({
      orderBy: { created_at: 'desc' },
      take:    KEEP,
      select:  { id: true },
    });
    const keepGregSess = recentGregSess.map(r => r.id);
    const deletedGregSess = keepGregSess.length > 0
      ? await prisma.gregmornSession.deleteMany({ where: { id: { notIn: keepGregSess } } })
      : { count: 0 };
    console.log(`  ✓ Gregmorn sessions:  deleted ${deletedGregSess.count}`);

    // ── Promotion logs ────────────────────────────────────────────────────────
    const recentPromoLogs = await prisma.promotionLog.findMany({
      orderBy: { sent_at: 'desc' },
      take:    KEEP,
      select:  { id: true },
    });
    const keepPromoLogs = recentPromoLogs.map(r => r.id);
    const deletedPromoLogs = keepPromoLogs.length > 0
      ? await prisma.promotionLog.deleteMany({ where: { id: { notIn: keepPromoLogs } } })
      : { count: 0 };
    console.log(`  ✓ Promotion logs:     deleted ${deletedPromoLogs.count}`);

    // ── Expired cartela reservations ──────────────────────────────────────────
    const deletedReservations = await prisma.cartelaReservation.deleteMany({
      where: { expires_at: { lt: new Date() } },
    });
    console.log(`  ✓ Expired reservations: deleted ${deletedReservations.count}`);

    console.log('\n✅ Cleanup completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

cleanup().finally(() => prisma.$disconnect());
