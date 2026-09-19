-- AlterTable
ALTER TABLE "BillingInvoice" ADD COLUMN     "billingReason" VARCHAR(50),
ADD COLUMN     "paymentNotificationHandledAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "PlanChange" ADD COLUMN     "appliedNotificationHandledAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "BillingInvoice_status_paymentNotificationHandledAt_paidAt_idx" ON "BillingInvoice"("status", "paymentNotificationHandledAt", "paidAt");

-- CreateIndex
CREATE INDEX "PlanChange_status_appliedNotificationHandledAt_createdAt_idx" ON "PlanChange"("status", "appliedNotificationHandledAt", "createdAt");

UPDATE "BillingInvoice"
SET "paymentNotificationHandledAt" = CURRENT_TIMESTAMP
WHERE "status" = 'paid';

-- Existing applied changes must not generate historical confirmations.
UPDATE "PlanChange"
SET "appliedNotificationHandledAt" = CURRENT_TIMESTAMP
WHERE "status" = 'APPLIED';