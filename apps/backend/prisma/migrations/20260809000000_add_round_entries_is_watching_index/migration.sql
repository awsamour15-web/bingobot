-- Add composite index on round_entries(round_id, is_watching)
-- Used by cartela availability, game start payment collection, and entry counts
CREATE INDEX IF NOT EXISTS "round_entries_round_id_is_watching_idx"
ON "round_entries"("round_id", "is_watching");
