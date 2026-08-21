-- Add is_mock flag to players table
ALTER TABLE "players" ADD COLUMN "is_mock" BOOLEAN NOT NULL DEFAULT false;

-- Index for fast lookup of mock players
CREATE INDEX "players_is_mock_idx" ON "players"("is_mock");
