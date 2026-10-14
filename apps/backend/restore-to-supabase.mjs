#!/usr/bin/env node
// Restore latest JSON backup to Supabase
// Inserts in FK-safe order, upserts to be idempotent (safe to re-run)
// Supports resume: saves progress to .restore-progress.json

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();
const BATCH = 100;
const PROGRESS_FILE = '.restore-progress.json';

const BACKUP_FILE = process.argv[2] ?? path.join('backups', 'backup_2026-10-11T22-53-55.json');

// Progress checkpoint helpers
async function loadProgress() {
  try {
    const raw = await fs.readFile(PROGRESS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { completedLabels: [], currentLabel: null, currentOffset: 0 };
  }
}

async function saveProgress(progress) {
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function clearProgress() {
  try { await fs.unlink(PROGRESS_FILE); } catch {}
}

async function tableCount(table) {
  const res = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${table}"`);
  return res[0].n;
}

async function upsertBatch(label, items, fn, { skipIfPopulated } = {}, progress) {
  if (!items?.length) { console.log(`  ${label}: 0 (skipped)`); return; }

  // Skip already-completed labels
  if (progress.completedLabels.includes(label)) {
    console.log(`  ${label}: already completed (resuming, skipped)`);
    return;
  }

  if (skipIfPopulated) {
    const existing = await tableCount(skipIfPopulated);
    if (existing > 0) {
      console.log(`  ${label}: skipped (${existing} rows already present)`);
      progress.completedLabels.push(label);
      await saveProgress(progress);
      return;
    }
  }

  // Resume from saved offset if this is the label that was interrupted
  const startOffset = (progress.currentLabel === label) ? progress.currentOffset : 0;
  if (startOffset > 0) {
    console.log(`  ${label}: resuming from offset ${startOffset}/${items.length}`);
  }

  let done = startOffset;
  progress.currentLabel = label;
  progress.currentOffset = startOffset;
  await saveProgress(progress);

  for (let i = startOffset; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    let retries = 0;
    while (true) {
      try {
        await fn(batch);
        break;
      } catch (err) {
        retries++;
        if (retries > 5) {
          // Save current offset before throwing so we can resume here
          progress.currentOffset = i;
          await saveProgress(progress);
          throw err;
        }
        const wait = retries * 2000;
        process.stdout.write(`\r  ${label}: retrying batch ${i} (attempt ${retries})...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
    done += batch.length;
    // Save progress every 10 batches
    if (Math.floor(i / BATCH) % 10 === 0) {
      progress.currentOffset = i + BATCH;
      await saveProgress(progress);
    }
    process.stdout.write(`\r  ${label}: ${done}/${items.length}`);
  }
  console.log(`\r  ${label}: ${done} ✓`);
  progress.completedLabels.push(label);
  progress.currentLabel = null;
  progress.currentOffset = 0;
  await saveProgress(progress);
}

async function restore() {
  const progress = await loadProgress();
  const isResume = progress.completedLabels.length > 0 || progress.currentLabel !== null;
  if (isResume) {
    console.log(`Resuming restore... (${progress.completedLabels.length} steps already done)`);
  }

  console.log(`Reading backup: ${BACKUP_FILE}`);
  const raw = await fs.readFile(BACKUP_FILE, 'utf8');
  console.log('Parsing JSON...');
  const data = JSON.parse(raw);
  console.log(`Backup timestamp: ${data._meta?.timestamp}\n`);

  // Disable FK checks for the entire restore — re-enabled at the end
  // Drop FK constraints temporarily (session_replication_role not available on Neon)
  if (!isResume) {
    await prisma.$executeRaw`ALTER TABLE players DROP CONSTRAINT IF EXISTS players_referrer_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE players DROP CONSTRAINT IF EXISTS players_agent_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_wallet_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE game_rounds DROP CONSTRAINT IF EXISTS game_rounds_winner_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE round_entries DROP CONSTRAINT IF EXISTS round_entries_round_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE round_entries DROP CONSTRAINT IF EXISTS round_entries_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE round_winners DROP CONSTRAINT IF EXISTS round_winners_round_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE round_winners DROP CONSTRAINT IF EXISTS round_winners_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE called_numbers DROP CONSTRAINT IF EXISTS called_numbers_round_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE pending_deposits DROP CONSTRAINT IF EXISTS pending_deposits_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE agent_commissions DROP CONSTRAINT IF EXISTS agent_commissions_agent_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE agent_commissions DROP CONSTRAINT IF EXISTS agent_commissions_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE agent_commission_withdrawals DROP CONSTRAINT IF EXISTS agent_commission_withdrawals_agent_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE pending_withdrawals DROP CONSTRAINT IF EXISTS pending_withdrawals_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE cartela_reservations DROP CONSTRAINT IF EXISTS cartela_reservations_round_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE cartela_reservations DROP CONSTRAINT IF EXISTS cartela_reservations_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE deposit_attempts DROP CONSTRAINT IF EXISTS deposit_attempts_deposit_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE deposit_attempts DROP CONSTRAINT IF EXISTS deposit_attempts_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE crash_bets DROP CONSTRAINT IF EXISTS crash_bets_round_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE crash_bets DROP CONSTRAINT IF EXISTS crash_bets_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE slot_spins DROP CONSTRAINT IF EXISTS slot_spins_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE keno_bets DROP CONSTRAINT IF EXISTS keno_bets_round_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE keno_bets DROP CONSTRAINT IF EXISTS keno_bets_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE plinko_bets DROP CONSTRAINT IF EXISTS plinko_bets_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE royal_drop_bets DROP CONSTRAINT IF EXISTS royal_drop_bets_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE promotion_bonus_distributions DROP CONSTRAINT IF EXISTS promotion_bonus_distributions_promotion_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE promotion_bonus_distributions DROP CONSTRAINT IF EXISTS promotion_bonus_distributions_player_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE round_bonus_winners DROP CONSTRAINT IF EXISTS round_bonus_winners_round_id_fkey`;
    await prisma.$executeRaw`ALTER TABLE round_bonus_winners DROP CONSTRAINT IF EXISTS round_bonus_winners_player_id_fkey`;
    console.log('FK constraints dropped for restore\n');
  } else {
    // On resume, still try to drop FK constraints that may have been re-added
    try {
      await prisma.$executeRaw`ALTER TABLE round_entries DROP CONSTRAINT IF EXISTS round_entries_round_id_fkey`;
      await prisma.$executeRaw`ALTER TABLE round_entries DROP CONSTRAINT IF EXISTS round_entries_player_id_fkey`;
      await prisma.$executeRaw`ALTER TABLE round_winners DROP CONSTRAINT IF EXISTS round_winners_round_id_fkey`;
      await prisma.$executeRaw`ALTER TABLE round_winners DROP CONSTRAINT IF EXISTS round_winners_player_id_fkey`;
      await prisma.$executeRaw`ALTER TABLE called_numbers DROP CONSTRAINT IF EXISTS called_numbers_round_id_fkey`;
      await prisma.$executeRaw`ALTER TABLE cartela_reservations DROP CONSTRAINT IF EXISTS cartela_reservations_round_id_fkey`;
      await prisma.$executeRaw`ALTER TABLE cartela_reservations DROP CONSTRAINT IF EXISTS cartela_reservations_player_id_fkey`;
      await prisma.$executeRaw`ALTER TABLE round_bonus_winners DROP CONSTRAINT IF EXISTS round_bonus_winners_round_id_fkey`;
      await prisma.$executeRaw`ALTER TABLE round_bonus_winners DROP CONSTRAINT IF EXISTS round_bonus_winners_player_id_fkey`;
      console.log('FK constraints dropped for resume\n');
    } catch (e) {
      console.log('FK drop on resume (non-fatal):', e.message);
    }
  }

  // ── 1. Players
  await upsertBatch('players', data.players, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO players (id, telegram_id, username, phone, phone_verified, is_suspended,
        referrer_id, agent_id, is_mock, login_streak, longest_streak, last_login_date, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, telegram_id bigint, username text, phone text, phone_verified boolean,
        is_suspended boolean, referrer_id text, agent_id text, is_mock boolean,
        login_streak int, longest_streak int, last_login_date date, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, { skipIfPopulated: 'players' }, progress);

  // ── 2. Agents
  await upsertBatch('agents', data.agents, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO agents (id, telegram_username, telegram_id, agent_invite_code, is_active,
        commission_balance, approval_status, approved_at, approved_by, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, telegram_username text, telegram_id bigint, agent_invite_code text,
        is_active boolean, commission_balance numeric, approval_status "AgentApprovalStatus",
        approved_at timestamptz, approved_by text, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, { skipIfPopulated: 'agents' }, progress);

  // ── 3. Wallets
  await upsertBatch('wallets', data.wallets, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO wallets (id, player_id, type, balance, updated_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, player_id text, type "WalletType", balance numeric, updated_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, { skipIfPopulated: 'wallets' }, progress);

  // ── 4. Transactions
  await upsertBatch('transactions', data.transactions, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO transactions (id, wallet_id, type, amount, reference_id, note, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, wallet_id text, type "TxType", amount numeric, reference_id text,
        note text, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, { skipIfPopulated: 'transactions' }, progress);

  // ── 5. Game rounds
  // Clear dependent tables + game_rounds, drop the partial unique index on stake so we can
  // restore historical data (which may contain duplicate pending stakes from the snapshot).
  if (!isResume) {
    await prisma.$executeRaw`TRUNCATE TABLE round_bonus_winners, cartela_reservations, called_numbers, round_winners, round_entries, game_rounds CASCADE`;
    await prisma.$executeRaw`DROP INDEX IF EXISTS game_rounds_stake_pending_unique`;
    console.log('  game_rounds + dependents cleared, stake index dropped\n');
  }

  await upsertBatch('gameRounds', data.gameRounds, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO game_rounds (id, stake, status, max_players, start_time, ended_at, derash,
        commission_pct, winner_player_id, winner_cartela_number, winning_pattern)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, stake numeric, status "GameStatus", max_players int, start_time timestamptz,
        ended_at timestamptz, derash numeric, commission_pct float8,
        winner_player_id text, winner_cartela_number int, winning_pattern text
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 6. Round entries
  await upsertBatch('roundEntries', data.roundEntries, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO round_entries (id, round_id, player_id, cartela_number, is_watching, joined_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, round_id text, player_id text, cartela_number int,
        is_watching boolean, joined_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 7. Round winners
  await upsertBatch('roundWinners', data.roundWinners, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO round_winners (id, round_id, player_id, cartela_number, split_amount, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, round_id text, player_id text, cartela_number int,
        split_amount numeric, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 8. Cartela definitions
  await upsertBatch('cartelaDefinitions', data.cartelaDefinitions, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO cartela_definitions (cartela_number, grid)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        cartela_number int, grid jsonb
      )
      ON CONFLICT (cartela_number) DO NOTHING
    `;
  }, {}, progress);

  // ── 9. Called numbers
  await upsertBatch('calledNumbers', data.calledNumbers, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO called_numbers (id, round_id, number, sequence_index, called_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, round_id text, number int, sequence_index int, called_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 10. Admins
  await upsertBatch('admins', data.admins, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO admins (id, username, password_hash, role, is_active, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, username text, password_hash text, role "AdminRole",
        is_active boolean, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 11. Config
  await upsertBatch('config', data.config, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO config (key, value, updated_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        key text, value text, updated_at timestamptz
      )
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `;
  }, {}, progress);

  // ── 12. Pending deposits
  await upsertBatch('pendingDeposits', data.pendingDeposits, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO pending_deposits (id, tx_number, amount, status, player_id, claimed_at, created_at, updated_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, tx_number text, amount numeric, status "DepositStatus",
        player_id text, claimed_at timestamptz, created_at timestamptz, updated_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 13. Deposit attempts
  await upsertBatch('depositAttempts', data.depositAttempts, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO deposit_attempts (id, deposit_id, player_id, tx_number_parsed, raw_sms,
        outcome, failure_reason, amount_expected, amount_parsed, source, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, deposit_id text, player_id text, tx_number_parsed text, raw_sms text,
        outcome "DepositAttemptOutcome", failure_reason text, amount_expected numeric,
        amount_parsed numeric, source text, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 14. Agent commissions
  await upsertBatch('agentCommissions', data.agentCommissions, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO agent_commissions (id, agent_id, player_id, deposit_id, deposit_amount, commission_amount, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, agent_id text, player_id text, deposit_id text,
        deposit_amount numeric, commission_amount numeric, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 15. Agent commission withdrawals
  await upsertBatch('agentCommissionWithdrawals', data.agentCommissionWithdrawals, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO agent_commission_withdrawals (id, agent_id, amount, phone, status, tx_number, created_at, updated_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, agent_id text, amount numeric, phone text,
        status "WithdrawalStatus", tx_number text, created_at timestamptz, updated_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 16. Pending withdrawals
  await upsertBatch('pendingWithdrawals', data.pendingWithdrawals, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO pending_withdrawals (id, player_id, amount, phone, status, tx_number, tx_id, note, created_at, updated_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, player_id text, amount numeric, phone text, status "WithdrawalStatus",
        tx_number text, tx_id text, note text, created_at timestamptz, updated_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 17. Deposit accounts
  await upsertBatch('depositAccounts', data.depositAccounts, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO deposit_accounts (id, phone, name, bank, is_active, created_at, updated_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, phone text, name text, bank text, is_active boolean,
        created_at timestamptz, updated_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 18. Broadcast targets
  await upsertBatch('broadcastTargets', data.broadcastTargets, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO broadcast_targets (id, name, type, channel_id, is_active, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, name text, type text, channel_id text, is_active boolean, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 19. Promotions
  await upsertBatch('promotions', data.promotions, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO promotions (id, title, content_type, text_content, media_file_id, caption,
        status, bonus_amount, bonus_wallet, bonus_criteria, created_at, updated_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, title text, content_type "PromotionContentType", text_content text,
        media_file_id text, caption text, status "PromotionStatus", bonus_amount numeric,
        bonus_wallet "WalletType", bonus_criteria jsonb, created_at timestamptz, updated_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 20. Promotion schedules
  await upsertBatch('promotionSchedules', data.promotionSchedules, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO promotion_schedules (id, promotion_id, channel_ids, frequency, send_at,
        next_run_at, is_active, interval_minutes, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, promotion_id text, channel_ids text[], frequency "PromotionScheduleFrequency",
        send_at timestamptz, next_run_at timestamptz, is_active boolean,
        interval_minutes int, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 21. Promotion logs
  await upsertBatch('promotionLogs', data.promotionLogs, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO promotion_logs (id, promotion_id, schedule_id, channel_id, status, error_message, sent_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, promotion_id text, schedule_id text, channel_id text,
        status text, error_message text, sent_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 22. Promotion bonus distributions
  await upsertBatch('promotionBonusDistributions', data.promotionBonusDistributions, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO promotion_bonus_distributions (id, promotion_id, player_id, amount, wallet, distributed_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, promotion_id text, player_id text, amount numeric,
        wallet "WalletType", distributed_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 23. Crash rounds
  await upsertBatch('crashRounds', data.crashRounds, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO crash_rounds (id, status, crash_point, started_at, crashed_at, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, status "CrashStatus", crash_point float8,
        started_at timestamptz, crashed_at timestamptz, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 24. Crash bets
  await upsertBatch('crashBets', data.crashBets, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO crash_bets (id, round_id, player_id, bet_amount, cashout_at, payout, slot, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, round_id text, player_id text, bet_amount numeric,
        cashout_at float8, payout numeric, slot int, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 25. Slot spins
  await upsertBatch('slotSpins', data.slotSpins, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO slot_spins (id, player_id, bet_amount, reels, multiplier_reel, payline_wins,
        total_win, status, gamble_result, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, player_id text, bet_amount numeric, reels jsonb, multiplier_reel int,
        payline_wins jsonb, total_win numeric, status "SlotSpinStatus",
        gamble_result jsonb, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 26. Keno rounds
  await upsertBatch('kenoRounds', data.kenoRounds, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO keno_rounds (id, status, drawn_numbers, betting_ends_at, started_at, finished_at, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, status "KenoStatus", drawn_numbers int[], betting_ends_at timestamptz,
        started_at timestamptz, finished_at timestamptz, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 27. Keno bets
  await upsertBatch('kenoBets', data.kenoBets, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO keno_bets (id, round_id, player_id, picked_numbers, bet_amount, matched, payout, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, round_id text, player_id text, picked_numbers int[],
        bet_amount numeric, matched int, payout numeric, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 28. Plinko bets
  await upsertBatch('plinkoBets', data.plinkoBets, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO plinko_bets (id, player_id, bet_amount, rows, risk, path, slot, multiplier, payout, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, player_id text, bet_amount numeric, rows int, risk text,
        path int[], slot int, multiplier float8, payout numeric, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 29. Royal drop bets
  await upsertBatch('royalDropBets', data.royalDropBets, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO royal_drop_bets (id, player_id, bet_amount, cashout_multiplier, payout,
        bonus_triggered, status, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, player_id text, bet_amount numeric, cashout_multiplier float8,
        payout numeric, bonus_triggered boolean, status text, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 30. Cashiers
  await upsertBatch('cashiers', data.cashiers, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO cashiers (id, username, password_hash, display_name, is_active, created_at, updated_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, username text, password_hash text, display_name text,
        is_active boolean, created_at timestamptz, updated_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 31. System settings
  await upsertBatch('systemSettings', data.systemSettings, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO system_settings (key, value, updated_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        key text, value text, updated_at timestamptz
      )
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `;
  }, {}, progress);

  // ── 32. Gregmorn sessions
  await upsertBatch('gregmornSessions', data.gregmornSessions, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO gregmorn_sessions (id, player_id, session_id, game_id, game_title, currency,
        player_login, status, created_at, closed_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, player_id text, session_id text, game_id text, game_title text,
        currency text, player_login text, status text, created_at timestamptz, closed_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 33. Gregmorn transactions
  await upsertBatch('gregmornTransactions', data.gregmornTransactions, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO gregmorn_transactions (id, transaction_id, session_id, player_login, cmd,
        bet, win, balance_after, game_id, round_id, info, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, transaction_id text, session_id text, player_login text, cmd text,
        bet numeric, win numeric, balance_after numeric, game_id text,
        round_id text, info text, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 34. Cartela reservations
  await upsertBatch('cartelaReservations', data.cartelaReservations, async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO cartela_reservations (id, round_id, cartela_number, player_id, expires_at, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, round_id text, cartela_number int, player_id text,
        expires_at timestamptz, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  // ── 35. Round bonus winners
  await upsertBatch('roundBonusWinners', data.roundBonusWinners ?? [], async (batch) => {
    await prisma.$executeRaw`
      INSERT INTO round_bonus_winners (id, round_id, player_id, cartela_number, bonus_amount, created_at)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        id text, round_id text, player_id text, cartela_number int,
        bonus_amount numeric, created_at timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }, {}, progress);

  console.log('\n✓ Restore complete! Re-adding FK constraints and indexes...');
  // Recreate the partial unique index on game_rounds stake
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "game_rounds_stake_pending_unique" ON game_rounds (stake) WHERE status = 'pending'`;
  await prisma.$executeRaw`ALTER TABLE players ADD CONSTRAINT players_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES players(id) ON DELETE SET NULL ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE players ADD CONSTRAINT players_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE wallets ADD CONSTRAINT wallets_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE transactions ADD CONSTRAINT transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE game_rounds ADD CONSTRAINT game_rounds_winner_player_id_fkey FOREIGN KEY (winner_player_id) REFERENCES players(id) ON DELETE SET NULL ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE round_entries ADD CONSTRAINT round_entries_round_id_fkey FOREIGN KEY (round_id) REFERENCES game_rounds(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE round_entries ADD CONSTRAINT round_entries_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE round_winners ADD CONSTRAINT round_winners_round_id_fkey FOREIGN KEY (round_id) REFERENCES game_rounds(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE round_winners ADD CONSTRAINT round_winners_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE called_numbers ADD CONSTRAINT called_numbers_round_id_fkey FOREIGN KEY (round_id) REFERENCES game_rounds(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE pending_deposits ADD CONSTRAINT pending_deposits_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE agent_commissions ADD CONSTRAINT agent_commissions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE agent_commissions ADD CONSTRAINT agent_commissions_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE agent_commission_withdrawals ADD CONSTRAINT agent_commission_withdrawals_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE pending_withdrawals ADD CONSTRAINT pending_withdrawals_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE cartela_reservations ADD CONSTRAINT cartela_reservations_round_id_fkey FOREIGN KEY (round_id) REFERENCES game_rounds(id) ON DELETE CASCADE ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE cartela_reservations ADD CONSTRAINT cartela_reservations_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE deposit_attempts ADD CONSTRAINT deposit_attempts_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES pending_deposits(id) ON DELETE SET NULL ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE deposit_attempts ADD CONSTRAINT deposit_attempts_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE crash_bets ADD CONSTRAINT crash_bets_round_id_fkey FOREIGN KEY (round_id) REFERENCES crash_rounds(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE crash_bets ADD CONSTRAINT crash_bets_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE slot_spins ADD CONSTRAINT slot_spins_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE keno_bets ADD CONSTRAINT keno_bets_round_id_fkey FOREIGN KEY (round_id) REFERENCES keno_rounds(id) ON DELETE RESTRICT`;
  await prisma.$executeRaw`ALTER TABLE keno_bets ADD CONSTRAINT keno_bets_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT`;
  await prisma.$executeRaw`ALTER TABLE plinko_bets ADD CONSTRAINT plinko_bets_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE royal_drop_bets ADD CONSTRAINT royal_drop_bets_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE promotion_bonus_distributions ADD CONSTRAINT promotion_bonus_distributions_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE promotion_bonus_distributions ADD CONSTRAINT promotion_bonus_distributions_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE round_bonus_winners ADD CONSTRAINT round_bonus_winners_round_id_fkey FOREIGN KEY (round_id) REFERENCES game_rounds(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  await prisma.$executeRaw`ALTER TABLE round_bonus_winners ADD CONSTRAINT round_bonus_winners_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  console.log('FK constraints restored ✓');
  await clearProgress();
  console.log('Progress file cleared ✓');
}

restore()
  .catch(async e => {
    console.error('\n✗ Restore failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
