-- =============================================================================
-- COMBINED SUPABASE MIGRATION
-- Generated from apps/backend/prisma/migrations (chronological order)
-- First migration (20250101000000_add_round_winners) skipped intentionally.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Migration: 20260804221200_add_round_winners
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('main', 'play');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('deposit', 'withdrawal', 'game_entry', 'game_win', 'referral_commission', 'admin_credit', 'admin_debit', 'refund');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('pending', 'active', 'completed', 'cancelled', 'void');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('admin', 'super_admin');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('pending', 'claimed', 'cancelled');

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "username" TEXT NOT NULL,
    "phone" TEXT,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "referrer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "type" "WalletType" NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_rounds" (
    "id" TEXT NOT NULL,
    "stake" DECIMAL(14,2) NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'pending',
    "max_players" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "derash" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commission_pct" DOUBLE PRECISION NOT NULL,
    "winner_player_id" TEXT,
    "winner_cartela_number" INTEGER,

    CONSTRAINT "game_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_entries" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "cartela_number" INTEGER NOT NULL,
    "is_watching" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_winners" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "cartela_number" INTEGER NOT NULL,
    "split_amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cartela_definitions" (
    "cartela_number" INTEGER NOT NULL,
    "grid" INTEGER[],

    CONSTRAINT "cartela_definitions_pkey" PRIMARY KEY ("cartela_number")
);

-- CreateTable
CREATE TABLE "called_numbers" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "sequence_index" INTEGER NOT NULL,
    "called_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "called_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "pending_deposits" (
    "id" TEXT NOT NULL,
    "tx_number" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'pending',
    "player_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_telegram_id_key" ON "players"("telegram_id");

-- CreateIndex
CREATE INDEX "players_telegram_id_idx" ON "players"("telegram_id");

-- CreateIndex
CREATE INDEX "players_referrer_id_idx" ON "players"("referrer_id");

-- CreateIndex
CREATE INDEX "wallets_player_id_idx" ON "wallets"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_player_id_type_key" ON "wallets"("player_id", "type");

-- CreateIndex
CREATE INDEX "transactions_wallet_id_idx" ON "transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "transactions_created_at_idx" ON "transactions"("created_at");

-- CreateIndex
CREATE INDEX "game_rounds_status_idx" ON "game_rounds"("status");

-- CreateIndex
CREATE INDEX "game_rounds_start_time_idx" ON "game_rounds"("start_time");

-- CreateIndex
CREATE INDEX "round_entries_round_id_idx" ON "round_entries"("round_id");

-- CreateIndex
CREATE INDEX "round_entries_player_id_idx" ON "round_entries"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "round_entries_round_id_cartela_number_key" ON "round_entries"("round_id", "cartela_number");

-- CreateIndex
CREATE INDEX "round_winners_round_id_idx" ON "round_winners"("round_id");

-- CreateIndex
CREATE UNIQUE INDEX "round_winners_round_id_player_id_key" ON "round_winners"("round_id", "player_id");

-- CreateIndex
CREATE INDEX "called_numbers_round_id_idx" ON "called_numbers"("round_id");

-- CreateIndex
CREATE UNIQUE INDEX "called_numbers_round_id_number_key" ON "called_numbers"("round_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "called_numbers_round_id_sequence_index_key" ON "called_numbers"("round_id", "sequence_index");

-- CreateIndex
CREATE UNIQUE INDEX "admins_username_key" ON "admins"("username");

-- CreateIndex
CREATE UNIQUE INDEX "pending_deposits_tx_number_key" ON "pending_deposits"("tx_number");

-- CreateIndex
CREATE INDEX "pending_deposits_status_idx" ON "pending_deposits"("status");

-- CreateIndex
CREATE INDEX "pending_deposits_player_id_idx" ON "pending_deposits"("player_id");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_winner_player_id_fkey" FOREIGN KEY ("winner_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_entries" ADD CONSTRAINT "round_entries_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "game_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_entries" ADD CONSTRAINT "round_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_winners" ADD CONSTRAINT "round_winners_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "game_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_winners" ADD CONSTRAINT "round_winners_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "called_numbers" ADD CONSTRAINT "called_numbers_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "game_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_deposits" ADD CONSTRAINT "pending_deposits_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20260807000000_unique_pending_round_per_stake
-- -----------------------------------------------------------------------------

-- Migration: unique_pending_round_per_stake
-- Prevents concurrent inserts from creating duplicate pending rounds for the same stake.
-- This is a partial unique index — only enforces uniqueness when status = 'pending'.

CREATE UNIQUE INDEX IF NOT EXISTS "game_rounds_stake_pending_unique"
  ON "game_rounds" (stake)
  WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- Migration: 20260809000000_add_round_entries_is_watching_index
-- -----------------------------------------------------------------------------

-- Add composite index on round_entries(round_id, is_watching)
-- Used by cartela availability, game start payment collection, and entry counts
CREATE INDEX IF NOT EXISTS "round_entries_round_id_is_watching_idx"
ON "round_entries"("round_id", "is_watching");

-- -----------------------------------------------------------------------------
-- Migration: 20260810000000_add_agent_partner_role
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "telegram_username" TEXT NOT NULL,
    "telegram_id" BIGINT,
    "agent_invite_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "commission_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_commissions" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "deposit_id" TEXT NOT NULL,
    "deposit_amount" DECIMAL(14,2) NOT NULL,
    "commission_amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_commissions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "players" ADD COLUMN "agent_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "agents_telegram_id_key" ON "agents"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_agent_invite_code_key" ON "agents"("agent_invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "agent_commissions_deposit_id_key" ON "agent_commissions"("deposit_id");

-- CreateIndex
CREATE INDEX "agent_commissions_agent_id_idx" ON "agent_commissions"("agent_id");

-- CreateIndex
CREATE INDEX "agent_commissions_player_id_idx" ON "agent_commissions"("player_id");

-- CreateIndex
CREATE INDEX "players_agent_id_idx" ON "players"("agent_id");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20260811120000_add_cartela_reservations
-- -----------------------------------------------------------------------------

-- Add cartela reservations table for temporary locks
CREATE TABLE "cartela_reservations" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "cartela_number" INTEGER NOT NULL,
    "player_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cartela_reservations_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint to prevent duplicate reservations
CREATE UNIQUE INDEX "cartela_reservations_round_id_cartela_number_key" ON "cartela_reservations"("round_id", "cartela_number");

-- Create indexes for efficient queries
CREATE INDEX "cartela_reservations_round_id_idx" ON "cartela_reservations"("round_id");
CREATE INDEX "cartela_reservations_player_id_idx" ON "cartela_reservations"("player_id");
CREATE INDEX "cartela_reservations_expires_at_idx" ON "cartela_reservations"("expires_at");

-- Add foreign key constraints
ALTER TABLE "cartela_reservations" ADD CONSTRAINT "cartela_reservations_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "game_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cartela_reservations" ADD CONSTRAINT "cartela_reservations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20260812000000_add_pending_withdrawals
-- -----------------------------------------------------------------------------

-- CreateTable: pending_withdrawals
CREATE TABLE "pending_withdrawals" (
    "id"         TEXT NOT NULL,
    "player_id"  TEXT NOT NULL,
    "amount"     DECIMAL(14,2) NOT NULL,
    "phone"      TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'pending',
    "tx_number"  TEXT,
    "tx_id"      TEXT,
    "note"       TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_withdrawals_pkey" PRIMARY KEY ("id")
);

-- Unique tx_number
CREATE UNIQUE INDEX "pending_withdrawals_tx_number_key" ON "pending_withdrawals"("tx_number");

-- Indexes
CREATE INDEX "pending_withdrawals_player_id_idx" ON "pending_withdrawals"("player_id");
CREATE INDEX "pending_withdrawals_status_idx"    ON "pending_withdrawals"("status");

-- FK
ALTER TABLE "pending_withdrawals" ADD CONSTRAINT "pending_withdrawals_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20260812100000_add_promotion_models
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "PromotionContentType" AS ENUM ('text', 'image', 'video', 'gif');
CREATE TYPE "PromotionStatus" AS ENUM ('active', 'inactive');
CREATE TYPE "PromotionScheduleFrequency" AS ENUM ('once', 'daily', 'weekly', 'monthly');

-- CreateTable: promotions
CREATE TABLE "promotions" (
    "id"            TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "content_type"  "PromotionContentType" NOT NULL,
    "text_content"  TEXT,
    "media_file_id" TEXT,
    "status"        "PromotionStatus" NOT NULL DEFAULT 'active',
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promotions_status_idx" ON "promotions"("status");

-- CreateTable: promotion_schedules
CREATE TABLE "promotion_schedules" (
    "id"            TEXT NOT NULL,
    "promotion_id"  TEXT NOT NULL,
    "channel_ids"   TEXT[],
    "frequency"     "PromotionScheduleFrequency" NOT NULL,
    "send_at"       TIMESTAMP(3) NOT NULL,
    "next_run_at"   TIMESTAMP(3),
    "is_active"     BOOLEAN NOT NULL DEFAULT true,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotion_schedules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promotion_schedules_promotion_id_idx" ON "promotion_schedules"("promotion_id");
CREATE INDEX "promotion_schedules_is_active_next_run_at_idx" ON "promotion_schedules"("is_active", "next_run_at");
ALTER TABLE "promotion_schedules" ADD CONSTRAINT "promotion_schedules_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: promotion_logs
CREATE TABLE "promotion_logs" (
    "id"            TEXT NOT NULL,
    "promotion_id"  TEXT NOT NULL,
    "schedule_id"   TEXT,
    "channel_id"    TEXT NOT NULL,
    "status"        TEXT NOT NULL,
    "error_message" TEXT,
    "sent_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotion_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promotion_logs_promotion_id_idx" ON "promotion_logs"("promotion_id");
CREATE INDEX "promotion_logs_schedule_id_idx" ON "promotion_logs"("schedule_id");
ALTER TABLE "promotion_logs" ADD CONSTRAINT "promotion_logs_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_logs" ADD CONSTRAINT "promotion_logs_schedule_id_fkey"
    FOREIGN KEY ("schedule_id") REFERENCES "promotion_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20260813000000_add_agent_approval_status
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "AgentApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "agents" ADD COLUMN "approval_status" "AgentApprovalStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "approved_by" TEXT;

-- CreateIndex
CREATE INDEX "agents_approval_status_idx" ON "agents"("approval_status");

-- Set existing agents to approved
UPDATE "agents" SET "approval_status" = 'approved', "approved_at" = NOW() WHERE "telegram_id" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Migration: 20260813100000_fix_withdrawal_status_enum
-- -----------------------------------------------------------------------------

-- Create the WithdrawalStatus enum that was missing from the original migration
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- Alter the column from TEXT to the enum type
ALTER TABLE "pending_withdrawals"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "WithdrawalStatus" USING "status"::"WithdrawalStatus",
  ALTER COLUMN "status" SET DEFAULT 'pending';

-- -----------------------------------------------------------------------------
-- Migration: 20260813200000_add_deposit_accounts
-- -----------------------------------------------------------------------------

CREATE TABLE "deposit_accounts" (
    "id"         TEXT         NOT NULL,
    "phone"      TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "is_active"  BOOLEAN      NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deposit_accounts_phone_key" ON "deposit_accounts"("phone");
CREATE INDEX "deposit_accounts_is_active_idx" ON "deposit_accounts"("is_active");

-- -----------------------------------------------------------------------------
-- Migration: 20260816000000_add_promotion_caption
-- -----------------------------------------------------------------------------

-- Add optional caption to promotions (shown below media)
ALTER TABLE "promotions" ADD COLUMN "caption" TEXT;

-- -----------------------------------------------------------------------------
-- Migration: 20260816120000_add_broadcast_targets
-- -----------------------------------------------------------------------------

-- Add broadcast targets table for saved send destinations
CREATE TABLE "broadcast_targets" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "type"        TEXT NOT NULL, -- 'channel' | 'bot_broadcast'
    "channel_id"  TEXT,          -- Telegram channel/group ID (for type='channel')
    "is_active"   BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "broadcast_targets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "broadcast_targets_is_active_idx" ON "broadcast_targets"("is_active");

-- -----------------------------------------------------------------------------
-- Migration: 20260816200000_add_promotion_bonus_fields
-- -----------------------------------------------------------------------------

-- Add bonus fields to promotions table
ALTER TABLE "promotions" ADD COLUMN "bonus_amount" DECIMAL(14,2);
ALTER TABLE "promotions" ADD COLUMN "bonus_wallet" "WalletType";
ALTER TABLE "promotions" ADD COLUMN "bonus_criteria" JSONB;

-- Track who received each promotion's bonus (idempotency)
CREATE TABLE "promotion_bonus_distributions" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "promotion_id" TEXT NOT NULL,
  "player_id"    TEXT NOT NULL,
  "amount"       DECIMAL(14,2) NOT NULL,
  "wallet"       "WalletType" NOT NULL,
  "distributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotion_bonus_distributions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_bonus_distributions_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE,
  CONSTRAINT "promotion_bonus_distributions_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE,
  CONSTRAINT "promotion_bonus_distributions_unique"
    UNIQUE ("promotion_id", "player_id")
);

CREATE INDEX "promotion_bonus_distributions_promotion_id_idx" ON "promotion_bonus_distributions"("promotion_id");
CREATE INDEX "promotion_bonus_distributions_player_id_idx" ON "promotion_bonus_distributions"("player_id");

-- -----------------------------------------------------------------------------
-- Migration: 20260816210000_add_agent_commission_withdrawals
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "agent_commission_withdrawals" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "tx_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_commission_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_commission_withdrawals_agent_id_idx" ON "agent_commission_withdrawals"("agent_id");

-- CreateIndex
CREATE INDEX "agent_commission_withdrawals_status_idx" ON "agent_commission_withdrawals"("status");

-- AddForeignKey
ALTER TABLE "agent_commission_withdrawals" ADD CONSTRAINT "agent_commission_withdrawals_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20260821000000_add_mock_player_flag
-- -----------------------------------------------------------------------------

-- Add is_mock flag to players table
ALTER TABLE "players" ADD COLUMN "is_mock" BOOLEAN NOT NULL DEFAULT false;

-- Index for fast lookup of mock players
CREATE INDEX "players_is_mock_idx" ON "players"("is_mock");

-- -----------------------------------------------------------------------------
-- Migration: 20260823000000_add_crash_game
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "CrashStatus" AS ENUM ('waiting', 'running', 'crashed');

-- CreateTable
CREATE TABLE "crash_rounds" (
    "id" TEXT NOT NULL,
    "status" "CrashStatus" NOT NULL DEFAULT 'waiting',
    "crash_point" DOUBLE PRECISION,
    "started_at" TIMESTAMP(3),
    "crashed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crash_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crash_bets" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "bet_amount" DECIMAL(14,2) NOT NULL,
    "cashout_at" DOUBLE PRECISION,
    "payout" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crash_bets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crash_rounds_status_idx" ON "crash_rounds"("status");
CREATE INDEX "crash_rounds_created_at_idx" ON "crash_rounds"("created_at");
CREATE UNIQUE INDEX "crash_bets_round_id_player_id_key" ON "crash_bets"("round_id", "player_id");
CREATE INDEX "crash_bets_round_id_idx" ON "crash_bets"("round_id");
CREATE INDEX "crash_bets_player_id_idx" ON "crash_bets"("player_id");

-- AddForeignKey
ALTER TABLE "crash_bets" ADD CONSTRAINT "crash_bets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "crash_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crash_bets" ADD CONSTRAINT "crash_bets_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20260823100000_add_mock_bot_win_config
-- -----------------------------------------------------------------------------

-- Add mock_bot_win_enabled config key (default false)
INSERT INTO "config" (key, value, updated_at)
VALUES ('mock_bot_win_enabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration: 20260824000000_add_slots_game
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "SlotSpinStatus" AS ENUM ('win', 'loss');

-- CreateTable
CREATE TABLE "slot_spins" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "bet_amount" DECIMAL(14,2) NOT NULL,
    "reels" JSONB NOT NULL,
    "multiplier_reel" INTEGER NOT NULL DEFAULT 1,
    "payline_wins" JSONB NOT NULL,
    "total_win" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "SlotSpinStatus" NOT NULL,
    "gamble_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slot_spins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "slot_spins_player_id_idx" ON "slot_spins"("player_id");
CREATE INDEX "slot_spins_created_at_idx" ON "slot_spins"("created_at");

-- AddForeignKey
ALTER TABLE "slot_spins" ADD CONSTRAINT "slot_spins_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20260824100000_add_crash_bet_slot
-- -----------------------------------------------------------------------------

-- Add slot column to crash_bets and update unique constraint to allow dual-bet panels
ALTER TABLE "crash_bets" ADD COLUMN IF NOT EXISTS "slot" INTEGER NOT NULL DEFAULT 1;

-- Drop old unique constraint only if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crash_bets_round_id_player_id_key'
      AND conrelid = 'crash_bets'::regclass
  ) THEN
    ALTER TABLE "crash_bets" DROP CONSTRAINT "crash_bets_round_id_player_id_key";
  END IF;
END
$$;

-- Drop new constraint if already exists (idempotent re-run safety)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crash_bets_round_id_player_id_slot_key'
      AND conrelid = 'crash_bets'::regclass
  ) THEN
    ALTER TABLE "crash_bets" DROP CONSTRAINT "crash_bets_round_id_player_id_slot_key";
  END IF;
END
$$;

-- Add new unique constraint including slot (allows same player to have slot 1 and slot 2)
ALTER TABLE "crash_bets" ADD CONSTRAINT "crash_bets_round_id_player_id_slot_key" UNIQUE ("round_id", "player_id", "slot");

-- -----------------------------------------------------------------------------
-- Migration: 20260826000000_add_deposit_attempts
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "DepositAttemptOutcome" AS ENUM ('success', 'failure', 'pending_approval');

-- CreateTable
CREATE TABLE "deposit_attempts" (
    "id"               TEXT NOT NULL,
    "deposit_id"       TEXT,
    "player_id"        TEXT,
    "tx_number_parsed" TEXT,
    "raw_sms"          TEXT,
    "outcome"          "DepositAttemptOutcome" NOT NULL,
    "failure_reason"   TEXT,
    "amount_expected"  DECIMAL(14,2),
    "amount_parsed"    DECIMAL(14,2),
    "source"           TEXT NOT NULL DEFAULT 'bot',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deposit_attempts_deposit_id_idx" ON "deposit_attempts"("deposit_id");
CREATE INDEX "deposit_attempts_player_id_idx"  ON "deposit_attempts"("player_id");
CREATE INDEX "deposit_attempts_outcome_idx"    ON "deposit_attempts"("outcome");
CREATE INDEX "deposit_attempts_created_at_idx" ON "deposit_attempts"("created_at");

-- AddForeignKey
ALTER TABLE "deposit_attempts" ADD CONSTRAINT "deposit_attempts_deposit_id_fkey"
    FOREIGN KEY ("deposit_id") REFERENCES "pending_deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_attempts" ADD CONSTRAINT "deposit_attempts_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20260826100000_add_keno_game
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "KenoStatus" AS ENUM ('betting', 'drawing', 'finished');

-- KenoRound
CREATE TABLE "keno_rounds" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "status"       "KenoStatus" NOT NULL DEFAULT 'betting',
  "drawn_numbers" INTEGER[] NOT NULL DEFAULT '{}',
  "betting_ends_at" TIMESTAMP(3) NOT NULL,
  "started_at"   TIMESTAMP(3),
  "finished_at"  TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "keno_rounds_status_idx" ON "keno_rounds"("status");
CREATE INDEX "keno_rounds_created_at_idx" ON "keno_rounds"("created_at");

-- KenoBet
CREATE TABLE "keno_bets" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "round_id"     TEXT NOT NULL,
  "player_id"    TEXT NOT NULL,
  "picked_numbers" INTEGER[] NOT NULL,
  "bet_amount"   DECIMAL(14,2) NOT NULL,
  "matched"      INTEGER,
  "payout"       DECIMAL(14,2),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "keno_bets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "keno_rounds"("id") ON DELETE RESTRICT,
  CONSTRAINT "keno_bets_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT
);

CREATE INDEX "keno_bets_round_id_idx" ON "keno_bets"("round_id");
CREATE INDEX "keno_bets_player_id_idx" ON "keno_bets"("player_id");

-- -----------------------------------------------------------------------------
-- Migration: 20260831000000_add_plinko
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "plinko_bets" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "bet_amount" DECIMAL(14,2) NOT NULL,
    "rows" INTEGER NOT NULL,
    "risk" TEXT NOT NULL,
    "path" INTEGER[],
    "slot" INTEGER NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "payout" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plinko_bets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plinko_bets_player_id_idx" ON "plinko_bets"("player_id");

-- CreateIndex
CREATE INDEX "plinko_bets_created_at_idx" ON "plinko_bets"("created_at");

-- AddForeignKey
ALTER TABLE "plinko_bets" ADD CONSTRAINT "plinko_bets_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20260904000000_add_system_settings
-- -----------------------------------------------------------------------------

CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- -----------------------------------------------------------------------------
-- Migration: 20260904000000_add_winning_pattern
-- -----------------------------------------------------------------------------

-- Add winning_pattern column to game_rounds
-- Default 'any_line' for existing rows, required going forward.
ALTER TABLE "game_rounds" ADD COLUMN "winning_pattern" TEXT NOT NULL DEFAULT 'any_line';

-- -----------------------------------------------------------------------------
-- Migration: 20260907000000_add_royal_drop
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "royal_drop_bets" (
    "id"                 TEXT NOT NULL,
    "player_id"          TEXT NOT NULL,
    "bet_amount"         DECIMAL(14,2) NOT NULL,
    "cashout_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "payout"             DECIMAL(14,2),
    "bonus_triggered"    BOOLEAN NOT NULL DEFAULT false,
    "status"             TEXT NOT NULL DEFAULT 'pending',
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royal_drop_bets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "royal_drop_bets_player_id_idx" ON "royal_drop_bets"("player_id");

-- CreateIndex
CREATE INDEX "royal_drop_bets_created_at_idx" ON "royal_drop_bets"("created_at");

-- AddForeignKey
ALTER TABLE "royal_drop_bets" ADD CONSTRAINT "royal_drop_bets_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20260907100000_add_daily_streak
-- -----------------------------------------------------------------------------

-- Add daily login streak tracking to players table
ALTER TABLE "players" ADD COLUMN "login_streak"   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "players" ADD COLUMN "longest_streak" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "players" ADD COLUMN "last_login_date" DATE;

-- Back-fill existing players: set last_login_date to today so streak starts fresh
UPDATE "players" SET "last_login_date" = CURRENT_DATE WHERE "last_login_date" IS NULL;

-- -----------------------------------------------------------------------------
-- Migration: 20260908000000_add_gregmorn_integration
-- -----------------------------------------------------------------------------

-- Migration: Gregmorn Hub (SoftAPI) seamless wallet integration
-- Adds two new TxType values and two new tables

-- 1. Extend TxType enum
ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'ext_game_bet';
ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'ext_game_win';
ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'ext_game_rollback';

-- 2. Gregmorn game sessions — tracks active/completed game sessions per player
CREATE TABLE "gregmorn_sessions" (
    "id"            TEXT NOT NULL,
    "player_id"     TEXT NOT NULL,
    "session_id"    TEXT NOT NULL,          -- sessionId returned by openGame
    "game_id"       TEXT NOT NULL,          -- e.g. "integration_a:provider_a:game_001"
    "game_title"    TEXT NOT NULL DEFAULT '',
    "currency"      TEXT NOT NULL DEFAULT 'USD',
    "player_login"  TEXT NOT NULL,          -- login sent to Gregmorn
    "status"        TEXT NOT NULL DEFAULT 'active', -- active | closed
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at"     TIMESTAMP(3),

    CONSTRAINT "gregmorn_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gregmorn_sessions_session_id_key" ON "gregmorn_sessions"("session_id");
CREATE INDEX "gregmorn_sessions_player_id_idx" ON "gregmorn_sessions"("player_id");
CREATE INDEX "gregmorn_sessions_status_idx" ON "gregmorn_sessions"("status");

-- 3. Gregmorn transactions — idempotency log for writeBet / rollback callbacks
CREATE TABLE "gregmorn_transactions" (
    "id"              TEXT NOT NULL,
    "transaction_id"  TEXT NOT NULL,        -- Gregmorn transactionId (idempotency key)
    "session_id"      TEXT NOT NULL,        -- gregmorn sessionid (not our FK, raw string)
    "player_login"    TEXT NOT NULL,
    "cmd"             TEXT NOT NULL,        -- 'writeBet' | 'rollback'
    "bet"             DECIMAL(14,2) NOT NULL DEFAULT 0,
    "win"             DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance_after"   DECIMAL(14,2) NOT NULL DEFAULT 0,
    "game_id"         TEXT,
    "round_id"        TEXT,
    "info"            TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gregmorn_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gregmorn_transactions_transaction_id_key" ON "gregmorn_transactions"("transaction_id");
CREATE INDEX "gregmorn_transactions_session_id_idx" ON "gregmorn_transactions"("session_id");
CREATE INDEX "gregmorn_transactions_player_login_idx" ON "gregmorn_transactions"("player_login");
CREATE INDEX "gregmorn_transactions_created_at_idx" ON "gregmorn_transactions"("created_at");

-- -----------------------------------------------------------------------------
-- Migration: 20260909000000_add_bonus_tx_type
-- -----------------------------------------------------------------------------

-- Add 'bonus' value to TxType enum for coupon redemptions
ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'bonus';

-- -----------------------------------------------------------------------------
-- Migration: 20260909000000_add_cashier
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "cashiers" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cashiers_username_key" ON "cashiers"("username");

-- -----------------------------------------------------------------------------
-- Migration: 20260912000000_add_cashback_txtype
-- -----------------------------------------------------------------------------

-- Add cashback value to TxType enum
ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'cashback';

-- -----------------------------------------------------------------------------
-- Migration: 20260912000000_add_interval_schedule
-- -----------------------------------------------------------------------------

-- Add 'interval' to the PromotionScheduleFrequency enum
ALTER TYPE "PromotionScheduleFrequency" ADD VALUE IF NOT EXISTS 'interval';

-- Add interval_minutes column to promotion_schedules
ALTER TABLE "promotion_schedules" ADD COLUMN IF NOT EXISTS "interval_minutes" INTEGER;

-- -----------------------------------------------------------------------------
-- Migration: 20260914000000_add_deposit_account_bank
-- -----------------------------------------------------------------------------

-- Add bank field to deposit_accounts table
ALTER TABLE "deposit_accounts" ADD COLUMN "bank" TEXT NOT NULL DEFAULT 'telebirr';

-- -----------------------------------------------------------------------------
-- Migration: 20260925000000_add_received_sms
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "received_sms" (
    "id" TEXT NOT NULL,
    "tx_number" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sender_phone" TEXT,
    "receiver_name" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_text" TEXT NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "received_sms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "received_sms_tx_number_key" ON "received_sms"("tx_number");
CREATE INDEX IF NOT EXISTS "received_sms_tx_number_idx" ON "received_sms"("tx_number");

-- -----------------------------------------------------------------------------
-- Migration: 20260928000000_add_round_bonus_winner
-- -----------------------------------------------------------------------------

-- CreateTable: round_bonus_winners
-- One bonus winner per round — randomly selected registered cartela receives stake refund

CREATE TABLE "round_bonus_winners" (
    "id"             TEXT NOT NULL,
    "round_id"       TEXT NOT NULL,
    "player_id"      TEXT NOT NULL,
    "cartela_number" INTEGER NOT NULL,
    "bonus_amount"   DECIMAL(14,2) NOT NULL,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_bonus_winners_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "round_bonus_winners_round_id_key"   ON "round_bonus_winners"("round_id");
CREATE        INDEX "round_bonus_winners_player_id_idx"  ON "round_bonus_winners"("player_id");
CREATE        INDEX "round_bonus_winners_created_at_idx" ON "round_bonus_winners"("created_at");

-- Foreign Keys
ALTER TABLE "round_bonus_winners"
    ADD CONSTRAINT "round_bonus_winners_round_id_fkey"
    FOREIGN KEY ("round_id") REFERENCES "game_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "round_bonus_winners"
    ADD CONSTRAINT "round_bonus_winners_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
