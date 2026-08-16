-- Add broadcast targets table for saved send destinations
CREATE TABLE "broadcast_targets" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "type"        TEXT NOT NULL, -- 'channel' | 'bot_broadcast'
    "channel_id"  TEXT,          -- Telegram channel/group ID (for type='channel')
    "is_active"   BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "broadcast_targets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "broadcast_targets_is_active_idx" ON "broadcast_targets"("is_active");
