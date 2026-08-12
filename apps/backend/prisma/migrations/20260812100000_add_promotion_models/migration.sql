-- CreateEnum
CREATE TYPE "PromotionContentType" AS ENUM ('text', 'image', 'video', 'gif');
CREATE TYPE "PromotionStatus" AS ENUM ('active', 'inactive');
CREATE TYPE "PromotionScheduleFrequency" AS ENUM ('once', 'daily', 'weekly', 'monthly');

-- CreateTable: promotions
CREATE TABLE "promotions" (
    "id"            TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "content_type"  "PromotionContentType" NOT NULL,
    "text_content"  TEXT,
    "media_file_id" TEXT,
    "status"        "PromotionStatus" NOT NULL DEFAULT 'active',
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promotions_status_idx" ON "promotions"("status");

-- CreateTable: promotion_schedules
CREATE TABLE "promotion_schedules" (
    "id"            TEXT NOT NULL,
    "promotion_id"  TEXT NOT NULL,
    "channel_ids"   TEXT[],
    "frequency"     "PromotionScheduleFrequency" NOT NULL,
    "send_at"       TIMESTAMP(3) NOT NULL,
    "next_run_at"   TIMESTAMP(3),
    "is_active"     BOOLEAN NOT NULL DEFAULT true,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotion_schedules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promotion_schedules_promotion_id_idx" ON "promotion_schedules"("promotion_id");
CREATE INDEX "promotion_schedules_is_active_next_run_at_idx" ON "promotion_schedules"("is_active", "next_run_at");
ALTER TABLE "promotion_schedules" ADD CONSTRAINT "promotion_schedules_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: promotion_logs
CREATE TABLE "promotion_logs" (
    "id"            TEXT NOT NULL,
    "promotion_id"  TEXT NOT NULL,
    "schedule_id"   TEXT,
    "channel_id"    TEXT NOT NULL,
    "status"        TEXT NOT NULL,
    "error_message" TEXT,
    "sent_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotion_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promotion_logs_promotion_id_idx" ON "promotion_logs"("promotion_id");
CREATE INDEX "promotion_logs_schedule_id_idx" ON "promotion_logs"("schedule_id");
ALTER TABLE "promotion_logs" ADD CONSTRAINT "promotion_logs_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_logs" ADD CONSTRAINT "promotion_logs_schedule_id_fkey"
    FOREIGN KEY ("schedule_id") REFERENCES "promotion_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
