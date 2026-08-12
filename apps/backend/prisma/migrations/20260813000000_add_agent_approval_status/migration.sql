-- CreateEnum
CREATE TYPE "AgentApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "agents" ADD COLUMN "approval_status" "AgentApprovalStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "approved_by" TEXT;

-- CreateIndex
CREATE INDEX "agents_approval_status_idx" ON "agents"("approval_status");

-- Set existing agents to approved
UPDATE "agents" SET "approval_status" = 'approved', "approved_at" = NOW() WHERE "telegram_id" IS NOT NULL;
