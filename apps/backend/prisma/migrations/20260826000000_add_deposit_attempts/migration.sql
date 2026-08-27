-- CreateEnum
CREATE TYPE "DepositAttemptOutcome" AS ENUM ('success', 'failure', 'pending_approval');

-- CreateTable
CREATE TABLE "deposit_attempts" (
    "id"               TEXT NOT NULL,
    "deposit_id"       TEXT,
    "player_id"        TEXT,
    "tx_number_parsed" TEXT,
    "raw_sms"          TEXT,
    "outcome"          "DepositAttemptOutcome" NOT NULL,
    "failure_reason"   TEXT,
    "amount_expected"  DECIMAL(14,2),
    "amount_parsed"    DECIMAL(14,2),
    "source"           TEXT NOT NULL DEFAULT 'bot',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deposit_attempts_deposit_id_idx" ON "deposit_attempts"("deposit_id");
CREATE INDEX "deposit_attempts_player_id_idx"  ON "deposit_attempts"("player_id");
CREATE INDEX "deposit_attempts_outcome_idx"    ON "deposit_attempts"("outcome");
CREATE INDEX "deposit_attempts_created_at_idx" ON "deposit_attempts"("created_at");

-- AddForeignKey
ALTER TABLE "deposit_attempts" ADD CONSTRAINT "deposit_attempts_deposit_id_fkey"
    FOREIGN KEY ("deposit_id") REFERENCES "pending_deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_attempts" ADD CONSTRAINT "deposit_attempts_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
