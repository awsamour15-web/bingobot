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
