-- Add bank field to deposit_accounts table
ALTER TABLE "deposit_accounts" ADD COLUMN "bank" TEXT NOT NULL DEFAULT 'telebirr';
