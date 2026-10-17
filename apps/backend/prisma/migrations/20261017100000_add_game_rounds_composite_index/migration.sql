-- Add composite index on (status, start_time) for the GET /api/rounds query
-- which filters by status IN ('pending','active') and orders by start_time.
-- This prevents a full table scan on game_rounds as the table grows.
CREATE INDEX IF NOT EXISTS "game_rounds_status_start_time_idx"
  ON "game_rounds"("status", "start_time");
