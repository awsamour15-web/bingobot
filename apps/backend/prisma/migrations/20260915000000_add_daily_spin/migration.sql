-- CreateTable
CREATE TABLE "daily_spin_logs" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "prize" DECIMAL(14,2) NOT NULL,
    "prize_type" TEXT NOT NULL,
    "spun_date" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_spin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_spin_logs_player_id_spun_date_key" ON "daily_spin_logs"("player_id", "spun_date");

-- CreateIndex
CREATE INDEX "daily_spin_logs_player_id_idx" ON "daily_spin_logs"("player_id");

-- AddForeignKey
ALTER TABLE "daily_spin_logs" ADD CONSTRAINT "daily_spin_logs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
