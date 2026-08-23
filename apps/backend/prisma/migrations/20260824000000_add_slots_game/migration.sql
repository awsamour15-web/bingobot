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
