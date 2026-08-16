-- Add bonus fields to promotions table
ALTER TABLE "promotions" ADD COLUMN "bonus_amount" DECIMAL(14,2);
ALTER TABLE "promotions" ADD COLUMN "bonus_wallet" "WalletType";
ALTER TABLE "promotions" ADD COLUMN "bonus_criteria" JSONB;

-- Track who received each promotion's bonus (idempotency)
CREATE TABLE "promotion_bonus_distributions" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "promotion_id" TEXT NOT NULL,
  "player_id"    TEXT NOT NULL,
  "amount"       DECIMAL(14,2) NOT NULL,
  "wallet"       "WalletType" NOT NULL,
  "distributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotion_bonus_distributions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_bonus_distributions_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE,
  CONSTRAINT "promotion_bonus_distributions_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE,
  CONSTRAINT "promotion_bonus_distributions_unique"
    UNIQUE ("promotion_id", "player_id")
);

CREATE INDEX "promotion_bonus_distributions_promotion_id_idx" ON "promotion_bonus_distributions"("promotion_id");
CREATE INDEX "promotion_bonus_distributions_player_id_idx" ON "promotion_bonus_distributions"("player_id");
