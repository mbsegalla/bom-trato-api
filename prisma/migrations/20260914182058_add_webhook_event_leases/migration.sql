-- DropIndex
DROP INDEX "StripeWebhookEvent_processedAt_nextAttemptAt_idx";

-- AlterTable
ALTER TABLE "StripeWebhookEvent" ADD COLUMN     "leaseExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "leaseToken" UUID;

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_processedAt_failedAt_nextAttemptAt_id_idx" ON "StripeWebhookEvent"("processedAt", "failedAt", "nextAttemptAt", "id");
