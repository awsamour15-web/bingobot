-- Create the WithdrawalStatus enum that was missing from the original migration
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- Alter the column from TEXT to the enum type
ALTER TABLE "pending_withdrawals"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "WithdrawalStatus" USING "status"::"WithdrawalStatus",
  ALTER COLUMN "status" SET DEFAULT 'pending';
