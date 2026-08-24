-- Add slot column to crash_bets and update unique constraint to allow dual-bet panels
ALTER TABLE "crash_bets" ADD COLUMN IF NOT EXISTS "slot" INTEGER NOT NULL DEFAULT 1;

-- Drop old unique constraint only if it exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crash_bets_round_id_player_id_key'
      AND conrelid = 'crash_bets'::regclass
  ) THEN
    ALTER TABLE "crash_bets" DROP CONSTRAINT "crash_bets_round_id_player_id_key";
  END IF;
END $$;

-- Drop new constraint if already exists (idempotent)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crash_bets_round_id_player_id_slot_key'
      AND conrelid = 'crash_bets'::regclass
  ) THEN
    ALTER TABLE "crash_bets" DROP CONSTRAINT "crash_bets_round_id_player_id_slot_key";
  END IF;
END $$;

-- Add new unique constraint including slot
ALTER TABLE "crash_bets" ADD CONSTRAINT "crash_bets_round_id_player_id_slot_key" UNIQUE ("round_id", "player_id", "slot");
