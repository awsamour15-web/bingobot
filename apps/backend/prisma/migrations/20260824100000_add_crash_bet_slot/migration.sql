-- Add slot column to crash_bets and update unique constraint to allow dual-bet panels
ALTER TABLE "crash_bets" ADD COLUMN "slot" INTEGER NOT NULL DEFAULT 1;

-- Drop old unique constraint
ALTER TABLE "crash_bets" DROP CONSTRAINT "crash_bets_round_id_player_id_key";

-- Add new unique constraint including slot
ALTER TABLE "crash_bets" ADD CONSTRAINT "crash_bets_round_id_player_id_slot_key" UNIQUE ("round_id", "player_id", "slot");
