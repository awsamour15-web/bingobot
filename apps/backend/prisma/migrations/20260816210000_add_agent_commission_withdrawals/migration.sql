-- CreateTable
CREATE TABLE "agent_commission_withdrawals" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "tx_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_commission_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_commission_withdrawals_agent_id_idx" ON "agent_commission_withdrawals"("agent_id");

-- CreateIndex
CREATE INDEX "agent_commission_withdrawals_status_idx" ON "agent_commission_withdrawals"("status");

-- AddForeignKey
ALTER TABLE "agent_commission_withdrawals" ADD CONSTRAINT "agent_commission_withdrawals_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
