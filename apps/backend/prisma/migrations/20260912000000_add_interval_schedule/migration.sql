-- Add 'interval' to the PromotionScheduleFrequency enum
ALTER TYPE "PromotionScheduleFrequency" ADD VALUE IF NOT EXISTS 'interval';

-- Add interval_minutes column to promotion_schedules
ALTER TABLE "promotion_schedules" ADD COLUMN IF NOT EXISTS "interval_minutes" INTEGER;
