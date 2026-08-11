-- Add cartela reservations table for temporary locks
CREATE TABLE "cartela_reservations" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "cartela_number" INTEGER NOT NULL,
    "player_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cartela_reservations_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint to prevent duplicate reservations
CREATE UNIQUE INDEX "cartela_reservations_round_id_cartela_number_key" ON "cartela_reservations"("round_id", "cartela_number");

-- Create indexes for efficient queries
CREATE INDEX "cartela_reservations_round_id_idx" ON "cartela_reservations"("round_id");
CREATE INDEX "cartela_reservations_player_id_idx" ON "cartela_reservations"("player_id");
CREATE INDEX "cartela_reservations_expires_at_idx" ON "cartela_reservations"("expires_at");

-- Add foreign key constraints
ALTER TABLE "cartela_reservations" ADD CONSTRAINT "cartela_reservations_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "game_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cartela_reservations" ADD CONSTRAINT "cartela_reservations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;