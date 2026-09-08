-- Migration: Gregmorn Hub (SoftAPI) seamless wallet integration
-- Adds two new TxType values and two new tables

-- 1. Extend TxType enum
ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'ext_game_bet';
ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'ext_game_win';
ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'ext_game_rollback';

-- 2. Gregmorn game sessions — tracks active/completed game sessions per player
CREATE TABLE "gregmorn_sessions" (
    "id"            TEXT NOT NULL,
    "player_id"     TEXT NOT NULL,
    "session_id"    TEXT NOT NULL,          -- sessionId returned by openGame
    "game_id"       TEXT NOT NULL,          -- e.g. "integration_a:provider_a:game_001"
    "game_title"    TEXT NOT NULL DEFAULT '',
    "currency"      TEXT NOT NULL DEFAULT 'USD',
    "player_login"  TEXT NOT NULL,          -- login sent to Gregmorn
    "status"        TEXT NOT NULL DEFAULT 'active', -- active | closed
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at"     TIMESTAMP(3),

    CONSTRAINT "gregmorn_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gregmorn_sessions_session_id_key" ON "gregmorn_sessions"("session_id");
CREATE INDEX "gregmorn_sessions_player_id_idx" ON "gregmorn_sessions"("player_id");
CREATE INDEX "gregmorn_sessions_status_idx" ON "gregmorn_sessions"("status");

-- 3. Gregmorn transactions — idempotency log for writeBet / rollback callbacks
CREATE TABLE "gregmorn_transactions" (
    "id"              TEXT NOT NULL,
    "transaction_id"  TEXT NOT NULL,        -- Gregmorn transactionId (idempotency key)
    "session_id"      TEXT NOT NULL,        -- gregmorn sessionid (not our FK, raw string)
    "player_login"    TEXT NOT NULL,
    "cmd"             TEXT NOT NULL,        -- 'writeBet' | 'rollback'
    "bet"             DECIMAL(14,2) NOT NULL DEFAULT 0,
    "win"             DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance_after"   DECIMAL(14,2) NOT NULL DEFAULT 0,
    "game_id"         TEXT,
    "round_id"        TEXT,
    "info"            TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gregmorn_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gregmorn_transactions_transaction_id_key" ON "gregmorn_transactions"("transaction_id");
CREATE INDEX "gregmorn_transactions_session_id_idx" ON "gregmorn_transactions"("session_id");
CREATE INDEX "gregmorn_transactions_player_login_idx" ON "gregmorn_transactions"("player_login");
CREATE INDEX "gregmorn_transactions_created_at_idx" ON "gregmorn_transactions"("created_at");
