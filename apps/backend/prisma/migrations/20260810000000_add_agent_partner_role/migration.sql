-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "telegram_username" TEXT NOT NULL,
    "telegram_id" BIGINT,
    "agent_invite_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "commission_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_commissions" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "deposit_id" TEXT NOT NULL,
    "deposit_amount" DECIMAL(14,2) NOT NULL,
    "commission_amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_commissions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "players" ADD COLUMN "agent_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "agents_telegram_id_key" ON "agents"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_agent_invite_code_key" ON "agents"("agent_invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "agent_commissions_deposit_id_key" ON "agent_commissions"("deposit_id");

-- CreateIndex
CREATE INDEX "agent_commissions_agent_id_idx" ON "agent_commissions"("agent_id");

-- CreateIndex
CREATE INDEX "agent_commissions_player_id_idx" ON "agent_commissions"("player_id");

-- CreateIndex
CREATE INDEX "players_agent_id_idx" ON "players"("agent_id");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
