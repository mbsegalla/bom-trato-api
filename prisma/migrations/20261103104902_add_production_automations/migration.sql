/*
  Warnings:

  - A unique constraint covering the columns `[automationKey]` on the table `ProfessionalReviewInvitation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AutomationType" AS ENUM ('QUOTE_FOLLOW_UP', 'WORK_ORDER_REMINDER', 'REVIEW_REQUEST', 'RECEIVABLE_DUE_SOON', 'RECEIVABLE_OVERDUE');

-- CreateEnum
CREATE TYPE "AutomationEntityType" AS ENUM ('QUOTE', 'WORK_ORDER', 'RECEIVABLE');

-- AlterTable
ALTER TABLE "NotificationOutbox" ADD COLUMN     "automationDescription" VARCHAR(500),
ADD COLUMN     "automationEntityId" UUID,
ADD COLUMN     "automationEntityType" "AutomationEntityType",
ADD COLUMN     "automationType" "AutomationType",
ADD COLUMN     "organizationId" UUID;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "autoQuoteFollowUpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoReceivableReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoReviewRequestEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoWorkOrderReminderEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProfessionalReviewInvitation" ADD COLUMN     "automationKey" VARCHAR(200);

-- AlterTable
ALTER TABLE "QuoteShare" ADD COLUMN     "changeRequestMessage" VARCHAR(2000),
ADD COLUMN     "changeRequestedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "NotificationOutbox_organizationId_automationType_createdAt__idx" ON "NotificationOutbox"("organizationId", "automationType", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalReviewInvitation_automationKey_key" ON "ProfessionalReviewInvitation"("automationKey");
