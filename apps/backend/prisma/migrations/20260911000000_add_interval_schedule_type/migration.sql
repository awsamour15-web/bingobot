-- Add interval frequency type and new fields for interval-based scheduling
-- AlterEnum
ALTER TYPE "PromotionScheduleFrequency" ADD VALUE 'interval';

-- AlterTable
ALTER TABLE "promotion_schedules" ADD COLUMN "interval_minutes" INTEGER,
ADD COLUMN "end_at" TIMESTAMP(3);
