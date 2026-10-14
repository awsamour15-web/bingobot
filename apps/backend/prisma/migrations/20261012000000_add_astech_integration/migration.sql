-- CreateTable: AS Tech API Sessions
CREATE TABLE "astech_sessions" (
    "id"           TEXT NOT NULL,
    "player_id"    TEXT NOT NULL,
    "session_id"   TEXT NOT NULL,
    "game_id"      TEXT NOT NULL,
    "game_title"   TEXT NOT NULL DEFAULT '',
    "currency"     TEXT NOT NULL DEFAULT 'USD',
    "player_login" TEXT NOT NULL,
    "embeddable"   BOOLEAN NOT NULL DEFAULT false,
    "status"       TEXT NOT NULL DEFAULT 'active',
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at"    TIMESTAMP(3),

    CONSTRAINT "astech_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AS Tech API Transactions
CREATE TABLE "astech_transactions" (
    "id"              TEXT NOT NULL,
    "transaction_id"  TEXT NOT NULL,
    "session_id"      TEXT NOT NULL,
    "player_id"       TEXT NOT NULL,
    "player_login"    TEXT NOT NULL,
    "cmd"             TEXT NOT NULL,
    "bet"             DECIMAL(14,2) NOT NULL DEFAULT 0,
    "win"             DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance_before"  DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance_after"   DECIMAL(14,2) NOT NULL DEFAULT 0,
    "game_id"         TEXT,
    "round_id"        TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "astech_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique session_id
CREATE UNIQUE INDEX "astech_sessions_session_id_key" ON "astech_sessions"("session_id");

-- CreateIndex: unique transaction_id (idempotency)
CREATE UNIQUE INDEX "astech_transactions_transaction_id_key" ON "astech_transactions"("transaction_id");

-- CreateIndex
CREATE INDEX "astech_sessions_player_id_idx"         ON "astech_sessions"("player_id");
CREATE INDEX "astech_sessions_status_idx"             ON "astech_sessions"("status");
CREATE INDEX "astech_transactions_player_id_idx"      ON "astech_transactions"("player_id");
CREATE INDEX "astech_transactions_session_id_idx"     ON "astech_transactions"("session_id");
CREATE INDEX "astech_transactions_player_login_idx"   ON "astech_transactions"("player_login");
CREATE INDEX "astech_transactions_created_at_idx"     ON "astech_transactions"("created_at");

-- AddForeignKey
ALTER TABLE "astech_sessions" ADD CONSTRAINT "astech_sessions_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "astech_transactions" ADD CONSTRAINT "astech_transactions_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
