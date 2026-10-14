#!/usr/bin/env node
/**
 * Restore from flat JSON backup produced by backup-now.mjs (v2.1)
 * Usage: node restore-now.mjs ./backups/backup_XXXX.json
 *
 * Fully streaming — never holds more than CHUNK rows in memory at once.
 */

import { PrismaClient } from '@prisma/client';
import { createReadStream, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();
const CHUNK = 500;
const CHECKPOINT_FILE = '.restore-checkpoint.json';

function loadCheckpoint() {
  try { return JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf8')); } catch { return {}; }
}
function saveCheckpoint(done) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(done, null, 2));
}

// ── Stream-insert a table ─────────────────────────────────────────────────────
// Parses the backup file looking for `tableName`, extracts objects one by one,
// and calls insertFn(batch) every CHUNK rows — never accumulates the full array.
async function streamInsert(filePath, tableName, insertFn) {
  return new Promise((resolve, reject) => {
    const key = `"${tableName}"`;
    let phase = 0; // 0=seek key, 1=seek '[', 2=collect objects
    let buf = '';
    let objBuf = '';   // accumulates one {...} at a time
    let depth = 0;
    let inStr = false;
    let esc = false;
    let inObj = false;
    let total = 0;
    let batch = [];
    let done = false;

    const stream = createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 });

    async function flush(force = false) {
      if (batch.length >= CHUNK || (force && batch.length > 0)) {
        const rows = batch.splice(0, batch.length);
        await insertFn(rows);
      }
    }

    function parseRow(str) {
      return JSON.parse(str, (k, v) => {
        if (k === 'telegram_id' && typeof v === 'string' && /^\d{10,}$/.test(v)) return BigInt(v);
        return v;
      });
    }

    stream.on('data', async chunk => {
      if (done) return;
      stream.pause();
      try {
        buf += chunk;

        if (phase === 0) {
          const ki = buf.indexOf(key);
          if (ki === -1) { buf = buf.slice(-(key.length + 5)); stream.resume(); return; }
          buf = buf.slice(ki + key.length);
          phase = 1;
        }

        if (phase === 1) {
          const ai = buf.indexOf('[');
          if (ai === -1) { buf = buf.slice(-5); stream.resume(); return; }
          buf = buf.slice(ai + 1);
          phase = 2;
          depth = 0; inStr = false; esc = false; inObj = false; objBuf = '';
        }

        if (phase === 2) {
          let i = 0;
          while (i < buf.length) {
            const ch = buf[i];

            if (esc) { esc = false; if (inObj) objBuf += ch; i++; continue; }
            if (ch === '\\' && inStr) { esc = true; if (inObj) objBuf += ch; i++; continue; }
            if (ch === '"') { inStr = !inStr; if (inObj) objBuf += ch; i++; continue; }
            if (inStr) { if (inObj) objBuf += ch; i++; continue; }

            if (ch === '{' && depth === 0) {
              inObj = true;
              objBuf = '{';
              depth = 1;
            } else if (inObj) {
              objBuf += ch;
              if (ch === '{' || ch === '[') depth++;
              else if (ch === '}' || ch === ']') {
                depth--;
                if (depth === 0) {
                  // complete object
                  try { batch.push(parseRow(objBuf)); } catch(e) { /* skip bad row */ }
                  total++;
                  objBuf = ''; inObj = false;
                  await flush();
                }
              }
            } else if (ch === ']' && depth === 0) {
              // end of array
              done = true;
              await flush(true);
              stream.destroy();
              resolve(total);
              return;
            }
            i++;
          }
          buf = buf.slice(i);
        }
        stream.resume();
      } catch(e) {
        done = true;
        stream.destroy();
        reject(e);
      }
    });

    stream.on('end', async () => {
      if (!done) {
        await flush(true);
        resolve(total);
      }
    });
    stream.on('error', err => { if (!done) reject(err); });
  });
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────
async function withRetry(fn, retries = 5, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) {
      const retriable = e.code === 'P1001' || e.code === 'P1002' || e.code === 'P1008' ||
        (e.message && (e.message.includes("Can't reach") || e.message.includes('connection')));
      if (retriable && i < retries - 1) {
        process.stdout.write(` [retry ${i+1}]`);
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      } else throw e;
    }
  }
}

// ── Table helper ──────────────────────────────────────────────────────────────
async function restoreTable(filePath, label, insertFn, checkpoint) {
  if (checkpoint[label]) { console.log(`  ✓  ${label}: already done (skipped)`); return; }
  process.stdout.write(`  ↺  ${label}: 0`);
  let last = 0;
  const total = await streamInsert(filePath, label, async rows => {
    await withRetry(() => insertFn(rows));
    last += rows.length;
    process.stdout.write(`\r  ↺  ${label}: ${last}`);
  });
  if (total === 0) { console.log(`\r  ⏭  ${label}: 0 (skipped)              `); }
  else             { console.log(`\r  ✓  ${label}: ${total}                  `); }
  checkpoint[label] = true;
  saveCheckpoint(checkpoint);
}

// ── Main restore ──────────────────────────────────────────────────────────────
async function restore(filePath) {
  console.log(`\n🔄 Restoring from: ${filePath}\n`);

  let checkpoint = loadCheckpoint();

  // If no checkpoint exists, this is a fresh run — truncate first
  if (Object.keys(checkpoint).length === 0) {
    console.log('🗑  Clearing existing data...');
    const tables = [
      'astech_transactions', 'astech_sessions',
      'gregmorn_transactions', 'gregmorn_sessions',
      'royal_drop_bets', 'plinko_bets', 'keno_bets', 'keno_rounds',
      'slot_spins', 'crash_bets', 'crash_rounds',
      'promotion_bonus_distributions', 'promotion_logs', 'promotion_schedules', 'promotions',
      'called_numbers', 'round_bonus_winners', 'round_winners', 'round_entries', 'game_rounds',
      'cartela_reservations',
      'agent_commission_withdrawals', 'agent_commissions',
      'pending_withdrawals', 'deposit_attempts', 'pending_deposits',
      'transactions', 'wallets',
      'players', 'agents', 'cashiers',
      'cartela_definitions', 'broadcast_targets', 'deposit_accounts',
      'system_settings', 'received_sms', 'config', 'admins',
    ];
    for (const t of tables) {
      await prisma.$executeRawUnsafe(
        `DO $$ BEGIN IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='${t}') THEN TRUNCATE TABLE "${t}" CASCADE; END IF; END $$`
      );
      process.stdout.write('.');
    }
    console.log('\n✓  Done\n');
  } else {
    console.log('♻️  Resuming from checkpoint...\n');
  }

  const f = filePath;
  const c = checkpoint;
  const rt = (label, fn) => restoreTable(f, label, fn, c);

  await rt('admins', r => prisma.admin.createMany({ data: r, skipDuplicates: true }));
  await rt('config', r => prisma.config.createMany({ data: r, skipDuplicates: true }));
  await rt('systemSettings', r => prisma.systemSetting.createMany({ data: r, skipDuplicates: true }));
  await rt('depositAccounts', r => prisma.depositAccount.createMany({ data: r, skipDuplicates: true }));
  await rt('broadcastTargets', r => prisma.broadcastTarget.createMany({ data: r, skipDuplicates: true }));
  await rt('cartelaDefinitions', r => prisma.cartelaDefinition.createMany({ data: r, skipDuplicates: true }));
  await rt('agents', r => prisma.agent.createMany({ data: r, skipDuplicates: true }));
  await rt('cashiers', r => prisma.cashier.createMany({ data: r, skipDuplicates: true }));

  // Players pass 1 — no referrer_id
  await rt('players', r =>
    prisma.player.createMany({ data: r.map(p => ({ ...p, referrer_id: null })), skipDuplicates: true }));

  // Players pass 2 — referrer_id in batched raw SQL
  if (!c['players_referrer_id']) {
    process.stdout.write(`  ↺  players referrer_id...`);
    let refDone = 0;
    await streamInsert(f, 'players', async rows => {
      const withRef = rows.filter(p => p.referrer_id);
      if (!withRef.length) return;
      const caseExpr = withRef.map(p => `WHEN id = '${p.id}' THEN '${p.referrer_id}'::uuid`).join(' ');
      const ids = withRef.map(p => `'${p.id}'`).join(',');
      await withRetry(() => prisma.$executeRawUnsafe(
        `UPDATE "players" SET referrer_id = CASE ${caseExpr} END WHERE id IN (${ids})`
      ));
      refDone += withRef.length;
      process.stdout.write(`\r  ↺  players referrer_id: ${refDone}`);
    });
    console.log(`\r  ✓  players referrer_id: ${refDone}                `);
    c['players_referrer_id'] = true; saveCheckpoint(c);
  } else { console.log(`  ✓  players referrer_id: already done (skipped)`); }

  await rt('wallets', r => prisma.wallet.createMany({ data: r, skipDuplicates: true }));
  await rt('transactions', r => prisma.transaction.createMany({ data: r, skipDuplicates: true }));
  await rt('pendingDeposits', r => prisma.pendingDeposit.createMany({ data: r, skipDuplicates: true }));
  await rt('depositAttempts', r => prisma.depositAttempt.createMany({ data: r, skipDuplicates: true }));
  await rt('pendingWithdrawals', r => prisma.pendingWithdrawal.createMany({ data: r, skipDuplicates: true }));
  await rt('agentCommissions', r => prisma.agentCommission.createMany({ data: r, skipDuplicates: true }));
  await rt('agentCommissionWithdrawals', r => prisma.agentCommissionWithdrawal.createMany({ data: r, skipDuplicates: true }));
  await rt('cartelaReservations', r => prisma.cartelaReservation.createMany({ data: r, skipDuplicates: true }));
  await rt('gameRounds', r => prisma.gameRound.createMany({ data: r, skipDuplicates: true }));
  await rt('roundEntries', r => prisma.roundEntry.createMany({ data: r, skipDuplicates: true }));
  await rt('roundWinners', r => prisma.roundWinner.createMany({ data: r, skipDuplicates: true }));
  await rt('calledNumbers', r => prisma.calledNumber.createMany({ data: r, skipDuplicates: true }));
  await rt('promotions', r => prisma.promotion.createMany({ data: r, skipDuplicates: true }));
  await rt('promotionSchedules', r => prisma.promotionSchedule.createMany({ data: r, skipDuplicates: true }));
  await rt('promotionLogs', r => prisma.promotionLog.createMany({ data: r, skipDuplicates: true }));
  await rt('promotionBonusDistributions', r => prisma.promotionBonusDistribution.createMany({ data: r, skipDuplicates: true }));
  await rt('crashRounds', r => prisma.crashRound.createMany({ data: r, skipDuplicates: true }));
  await rt('crashBets', r => prisma.crashBet.createMany({ data: r, skipDuplicates: true }));
  await rt('slotSpins', r => prisma.slotSpin.createMany({ data: r, skipDuplicates: true }));
  await rt('kenoRounds', r => prisma.kenoRound.createMany({ data: r, skipDuplicates: true }));
  await rt('kenoBets', r => prisma.kenoBet.createMany({ data: r, skipDuplicates: true }));
  await rt('plinkoBets', r => prisma.plinkoBet.createMany({ data: r, skipDuplicates: true }));
  await rt('royalDropBets', r => prisma.royalDropBet.createMany({ data: r, skipDuplicates: true }));
  await rt('gregmornSessions', r => prisma.gregmornSession.createMany({ data: r, skipDuplicates: true }));
  await rt('gregmornTransactions', r => prisma.gregmornTransaction.createMany({ data: r, skipDuplicates: true }));

  console.log('\n✅ Restore completed successfully!\n');
  try { unlinkSync(CHECKPOINT_FILE); } catch {}
}

const backupFile = process.argv[2];
if (!backupFile) { console.error('Usage: node restore-now.mjs <backup-file.json>'); process.exit(1); }

restore(backupFile)
  .catch(err => { console.error('\n❌ Restore failed:', err.message); console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
