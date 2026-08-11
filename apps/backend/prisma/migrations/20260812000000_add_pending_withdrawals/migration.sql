-- CreateTable: pending_withdrawals
CREATE TABLE "pending_withdrawals" (
    "id"         TEXT NOT NULL,
    "player_id"  TEXT NOT NULL,
    "amount"     DECIMAL(14,2) NOT NULL,
    "phone"      TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'pending',
    "tx_number"  TEXT,
    "tx_id"      TEXT,
    "note"       TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_withdrawals_pkey" PRIMARY KEY ("id")
);

-- Unique tx_number
CREATE UNIQUE INDEX "pending_withdrawals_tx_number_key" ON "pending_withdrawals"("tx_number");

-- Indexes
CREATE INDEX "pending_withdrawals_player_id_idx" ON "pending_withdrawals"("player_id");
CREATE INDEX "pending_withdrawals_status_idx"    ON "pending_withdrawals"("status");

-- FK
ALTER TABLE "pending_withdrawals" ADD CONSTRAINT "pending_withdrawals_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
