-- Add winning_pattern column to game_rounds
-- Default 'any_line' for existing rows, required going forward.
ALTER TABLE "game_rounds" ADD COLUMN "winning_pattern" TEXT NOT NULL DEFAULT 'any_line';
