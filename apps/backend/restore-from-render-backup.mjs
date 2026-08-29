#!/usr/bin/env node
// Step 1: Backup current Neon state
// Step 2: Restore missing financial data from latest Render backup into Neon

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';

config();

// Use DIRECT_URL for reliability — pooler can drop on idle
const NEON_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const BACKUP_FILE = './backups/backup_2026-08-22T19-55-00.json';
const BACKUP_DIR = './backups';

const prisma = new PrismaClient({ datasources: { db: { url: NEON_URL } } });

function log(msg) { console.log(msg); }
function warn(msg) { console.warn('⚠️  ' + msg); }

// ─── Step 1: Backup current Neon state ───────────────────────────────────────
async function backupNeon() {
  log('\n📦 Step 1: Backing up current Neon state...');
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const file = path.join(BACKUP_DIR, `neon_before_restore_${timestamp}.json`);

  const [players, wallets, transactions, gameRounds, roundEntries, roundWinners,
    cartelaDefinitions, calledNumbers, admins, cfg, pendingDeposits, depositAttempts,
    agents, agentCommissions, agentCommissionWithdrawals, cartelaReservations,
    pendingWithdrawals, depositAccounts, broadcastTargets, promotions,
    promotionSchedules, promotionLogs, promotionBonusDistributions,
    crashRounds, crashBets, slotSpins, kenoRounds, kenoBets] = await Promise.all([
    prisma.player.findMany(),
    prisma.wallet.findMany(),
    prisma.transaction.findMany(),
    prisma.gameRound.findMany(),
    prisma.roundEntry.findMany(),
    prisma.roundWinner.findMany(),
    prisma.cartelaDefinition.findMany(),
    prisma.calledNumber.findMany(),
    prisma.admin.findMany(),
    prisma.config.findMany(),
    prisma.pendingDeposit.findMany(),
    prisma.depositAttempt.findMany(),
    prisma.agent.findMany(),
    prisma.agentCommission.findMany(),
    prisma.agentCommissionWithdrawal.findMany(),
    prisma.cartelaReservation.findMany(),
    prisma.pendingWithdrawal.findMany(),
    prisma.depositAccount.findMany(),
    prisma.broadcastTarget.findMany(),
    prisma.promotion.findMany(),
    prisma.promotionSchedule.findMany(),
    prisma.promotionLog.findMany(),
    prisma.promotionBonusDistribution.findMany(),
    prisma.crashRound.findMany(),
    prisma.crashBet.findMany(),
    prisma.slotSpin.findMany(),
    prisma.kenoRound.findMany(),
    prisma.kenoBet.findMany(),
  ]);

  const data = { _meta: { timestamp: new Date().toISOString(), source: 'neon', note: 'pre-restore snapshot' },
    players, wallets, transactions, gameRounds, roundEntries, roundWinners,
    cartelaDefinitions, calledNumbers, admins, config: cfg, pendingDeposits, depositAttempts,
    agents, agentCommissions, agentCommissionWithdrawals, cartelaReservations,
    pendingWithdrawals, depositAccounts, broadcastTargets, promotions,
    promotionSchedules, promotionLogs, promotionBonusDistributions,
    crashRounds, crashBets, slotSpins, kenoRounds, kenoBets };

  await fs.writeFile(file, JSON.stringify(data, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  log(`✅ Neon backup saved: ${file}`);
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) log(`   ${k.padEnd(32)} ${v.length}`);
  }
  return data;
}

// ─── Step 2: Restore from Render backup ──────────────────────────────────────
async function restoreFromRenderBackup(neonSnapshot) {
  log('\n🔄 Step 2: Loading Render backup...');
  const raw = JSON.parse(await fs.readFile(BACKUP_FILE, 'utf8'));
  const src = raw.data;

  // Build sets of what's already in Neon
  const neonPlayerIds = new Set(neonSnapshot.players.map(p => p.id));
  const neonAgentIds = new Set(neonSnapshot.agents.map(a => a.id));
  const neonWalletKeys = new Set(neonSnapshot.wallets.map(w => `${w.player_id}:${w.type}`));
  const neonTxIds = new Set(neonSnapshot.transactions.map(t => t.id));
  const neonDepositIds = new Set(neonSnapshot.pendingDeposits.map(d => d.id));
  const neonWithdrawalIds = new Set(neonSnapshot.pendingWithdrawals.map(w => w.id));
  const neonConfigKeys = new Set(neonSnapshot.config.map(c => c.key));
  const neonDepAccIds = new Set(neonSnapshot.depositAccounts.map(d => d.id));
  const neonBroadcastIds = new Set(neonSnapshot.broadcastTargets.map(b => b.id));
  const neonPromoIds = new Set(neonSnapshot.promotions.map(p => p.id));

  let stats = {};
  const CHUNK = 500;

  // ── Agents (needed before players) ──
  const newAgents = src.agents.filter(a => !neonAgentIds.has(a.id));
  if (newAgents.length) {
    await prisma.agent.createMany({ data: newAgents, skipDuplicates: true });
  }
  stats.agents = newAgents.length;
  log(`✅ Agents:            +${newAgents.length} inserted (${src.agents.length} in backup)`);

  // ── Players ──
  // Render backup players don't have wallets as separate field — strip embedded wallets
  const playersToInsert = src.players
    .filter(p => !neonPlayerIds.has(p.id))
    .map(({ wallets: _w, ...p }) => p);
  if (playersToInsert.length) {
    await prisma.player.createMany({ data: playersToInsert, skipDuplicates: true });
  }
  stats.players = playersToInsert.length;
  log(`✅ Players:           +${playersToInsert.length} inserted (${src.players.length} in backup)`);

  // ── Wallets (extracted from embedded player.wallets) ──
  const allWallets = src.players
    .filter(p => p.wallets?.length)
    .flatMap(p => p.wallets.map(w => ({
      id: w.id,
      player_id: p.id,
      type: w.type,
      balance: w.balance,
      updated_at: w.updated_at ?? new Date().toISOString(),
    })));

  // Bulk insert wallets not already in Neon (by player_id+type key)
  const walletsToInsert = allWallets.filter(w => !neonWalletKeys.has(`${w.player_id}:${w.type}`));
  let walletsInserted = 0;
  for (let i = 0; i < walletsToInsert.length; i += CHUNK) {
    await prisma.wallet.createMany({ data: walletsToInsert.slice(i, i + CHUNK), skipDuplicates: true });
    walletsInserted += Math.min(CHUNK, walletsToInsert.length - i);
    process.stdout.write(`\r   Wallets inserting: ${walletsInserted}/${walletsToInsert.length}`);
  }

  // Bulk upsert wallets that already existed in Neon using raw SQL for speed
  const walletsToUpdate = allWallets.filter(w => neonWalletKeys.has(`${w.player_id}:${w.type}`));
  let walletsUpdated = 0;
  for (let i = 0; i < walletsToUpdate.length; i += CHUNK) {
    const chunk = walletsToUpdate.slice(i, i + CHUNK);
    // Use upsert via createMany with skipDuplicates=false approach — use raw UPDATE
    const values = chunk.map(w => `('${w.player_id}', '${w.type}', ${parseFloat(w.balance)}, NOW())`).join(',');
    await prisma.$executeRawUnsafe(`
      UPDATE wallets w SET balance = v.balance, updated_at = v.updated_at
      FROM (VALUES ${values}) AS v(player_id, type, balance, updated_at)
      WHERE w.player_id = v.player_id AND w.type::text = v.type
    `);
    walletsUpdated += chunk.length;
    process.stdout.write(`\r   Wallets updating: ${walletsUpdated}/${walletsToUpdate.length}  `);
  }

  stats.walletsInserted = walletsInserted;
  stats.walletsUpdated = walletsUpdated;
  log(`\n✅ Wallets:           +${walletsInserted} inserted, ${walletsUpdated} balances updated`);

  // ── Transactions ──
  const newTxs = src.transactions.filter(t => !neonTxIds.has(t.id));
  let txInserted = 0;
  for (let i = 0; i < newTxs.length; i += CHUNK) {
    const chunk = newTxs.slice(i, i + CHUNK);
    await prisma.transaction.createMany({ data: chunk, skipDuplicates: true });
    txInserted += chunk.length;
    process.stdout.write(`\r   Transactions: ${txInserted}/${newTxs.length}`);
  }
  log(`\n✅ Transactions:      +${newTxs.length} inserted`);
  stats.transactions = newTxs.length;

  // ── Pending Deposits ──
  const newDeposits = src.pendingDeposits.filter(d => !neonDepositIds.has(d.id));
  if (newDeposits.length) {
    await prisma.pendingDeposit.createMany({ data: newDeposits, skipDuplicates: true });
  }
  stats.pendingDeposits = newDeposits.length;
  log(`✅ PendingDeposits:   +${newDeposits.length} inserted`);

  // ── Pending Withdrawals ──
  const newWithdrawals = src.pendingWithdrawals.filter(w => !neonWithdrawalIds.has(w.id));
  if (newWithdrawals.length) {
    await prisma.pendingWithdrawal.createMany({ data: newWithdrawals, skipDuplicates: true });
  }
  stats.pendingWithdrawals = newWithdrawals.length;
  log(`✅ PendingWithdrawals:+${newWithdrawals.length} inserted`);

  // ── Config ──
  let configUpserted = 0;
  for (const c of src.config) {
    await prisma.config.upsert({
      where: { key: c.key },
      update: { value: c.value },
      create: c,
    });
    configUpserted++;
  }
  stats.config = configUpserted;
  log(`✅ Config:            ${configUpserted} upserted`);

  // ── Deposit Accounts ──
  const newDepAccs = src.depositAccounts.filter(d => !neonDepAccIds.has(d.id));
  if (newDepAccs.length) {
    await prisma.depositAccount.createMany({ data: newDepAccs, skipDuplicates: true });
  }
  stats.depositAccounts = newDepAccs.length;
  log(`✅ DepositAccounts:   +${newDepAccs.length} inserted`);

  // ── Broadcast Targets ──
  const newBroadcast = src.broadcastTargets.filter(b => !neonBroadcastIds.has(b.id));
  if (newBroadcast.length) {
    await prisma.broadcastTarget.createMany({ data: newBroadcast, skipDuplicates: true });
  }
  stats.broadcastTargets = newBroadcast.length;
  log(`✅ BroadcastTargets: +${newBroadcast.length} inserted`);

  // ── Promotions (strip nested relations before insert) ──
  const newPromos = src.promotions
    .filter(p => !neonPromoIds.has(p.id))
    .map(({ schedules: _s, logs: _l, bonus_distributions: _b, ...p }) => p);
  if (newPromos.length) {
    await prisma.promotion.createMany({ data: newPromos, skipDuplicates: true });
  }
  stats.promotions = newPromos.length;
  log(`✅ Promotions:        +${newPromos.length} inserted`);

  // ── CartelaDefinitions ──
  const neonCartelaIds = new Set(neonSnapshot.cartelaDefinitions.map(c => c.cartela_number));
  const newCartelas = src.cartelaDefinitions.filter(c => !neonCartelaIds.has(c.cartela_number));
  if (newCartelas.length) {
    for (let i = 0; i < newCartelas.length; i += CHUNK) {
      await prisma.cartelaDefinition.createMany({ data: newCartelas.slice(i, i + CHUNK), skipDuplicates: true });
    }
  }
  stats.cartelaDefinitions = newCartelas.length;
  log(`✅ CartelaDefinitions:+${newCartelas.length} inserted`);

  return stats;
}

// ─── Final verification ───────────────────────────────────────────────────────
async function verify() {
  log('\n🔍 Final Neon counts:');
  const [players, wallets, transactions, agents, pendingDeposits, pendingWithdrawals, config, cartelaDefinitions] = await Promise.all([
    prisma.player.count(),
    prisma.wallet.count(),
    prisma.transaction.count(),
    prisma.agent.count(),
    prisma.pendingDeposit.count(),
    prisma.pendingWithdrawal.count(),
    prisma.config.count(),
    prisma.cartelaDefinition.count(),
  ]);
  log(`   players:           ${players}`);
  log(`   wallets:           ${wallets}`);
  log(`   transactions:      ${transactions}`);
  log(`   agents:            ${agents}`);
  log(`   pendingDeposits:   ${pendingDeposits}`);
  log(`   pendingWithdrawals:${pendingWithdrawals}`);
  log(`   config:            ${config}`);
  log(`   cartelaDefinitions:${cartelaDefinitions}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
try {
  // Neon snapshot already taken — load it from disk
  log('\n📦 Loading existing Neon snapshot...');
  const snapshotFile = './backups/neon_before_restore_2026-08-29T07-49-01.json';
  const raw = JSON.parse(await fs.readFile(snapshotFile, 'utf8'));
  const neonSnapshot = {
    players: raw.players,
    wallets: raw.wallets,
    transactions: raw.transactions,
    agents: raw.agents,
    pendingDeposits: raw.pendingDeposits,
    pendingWithdrawals: raw.pendingWithdrawals,
    config: raw.config,
    depositAccounts: raw.depositAccounts,
    broadcastTargets: raw.broadcastTargets,
    promotions: raw.promotions,
    cartelaDefinitions: raw.cartelaDefinitions,
  };
  log(`✅ Snapshot loaded — ${neonSnapshot.players.length} players, ${neonSnapshot.wallets.length} wallets`);
  await restoreFromRenderBackup(neonSnapshot);
  await verify();
  log('\n✅ All done.');
} catch (e) {
  console.error('\n❌ Error:', e.message);
  console.error(e.stack);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
