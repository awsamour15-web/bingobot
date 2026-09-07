-- Add daily login streak tracking to players table
ALTER TABLE "players" ADD COLUMN "login_streak"   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "players" ADD COLUMN "longest_streak" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "players" ADD COLUMN "last_login_date" DATE;

-- Back-fill existing players: set last_login_date to today so streak starts fresh
UPDATE "players" SET "last_login_date" = CURRENT_DATE WHERE "last_login_date" IS NULL;
