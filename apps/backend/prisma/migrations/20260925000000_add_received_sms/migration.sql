CREATE TABLE IF NOT EXISTS "received_sms" (
    "id" TEXT NOT NULL,
    "tx_number" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sender_phone" TEXT,
    "receiver_name" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_text" TEXT NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "received_sms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "received_sms_tx_number_key" ON "received_sms"("tx_number");
CREATE INDEX IF NOT EXISTS "received_sms_tx_number_idx" ON "received_sms"("tx_number");
