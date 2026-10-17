-- Add daily bonus tracking and auto-rejoin to players
ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "daily_bonus_claimed_at" DATE,
  ADD COLUMN IF NOT EXISTS "auto_rejoin_cartela"    INTEGER;
