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
