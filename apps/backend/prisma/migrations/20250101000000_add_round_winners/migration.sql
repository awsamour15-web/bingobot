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

-- CreateIndex
CREATE INDEX "round_winners_round_id_idx" ON "round_winners"("round_id");

-- CreateIndex
CREATE UNIQUE INDEX "round_winners_round_id_player_id_key" ON "round_winners"("round_id", "player_id");

-- AddForeignKey
ALTER TABLE "round_winners" ADD CONSTRAINT "round_winners_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "game_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_winners" ADD CONSTRAINT "round_winners_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
