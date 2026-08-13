CREATE TABLE "deposit_accounts" (
    "id"         TEXT         NOT NULL,
    "phone"      TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "is_active"  BOOLEAN      NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deposit_accounts_phone_key" ON "deposit_accounts"("phone");
CREATE INDEX "deposit_accounts_is_active_idx" ON "deposit_accounts"("is_active");
