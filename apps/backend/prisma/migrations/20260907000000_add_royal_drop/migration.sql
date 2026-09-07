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
