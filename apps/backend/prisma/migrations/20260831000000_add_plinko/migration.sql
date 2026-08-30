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
