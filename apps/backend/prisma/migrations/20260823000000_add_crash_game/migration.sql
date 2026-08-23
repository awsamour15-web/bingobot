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
