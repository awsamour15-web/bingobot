-- Migration: unique_pending_round_per_stake
-- Prevents concurrent inserts from creating duplicate pending rounds for the same stake.
-- This is a partial unique index — only enforces uniqueness when status = 'pending'.

CREATE UNIQUE INDEX IF NOT EXISTS "game_rounds_stake_pending_unique"
  ON "game_rounds" (stake)
  WHERE status = 'pending';
