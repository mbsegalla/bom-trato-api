-- AlterTable
ALTER TABLE "BillingCustomer" ADD COLUMN     "invoiceHistorySyncedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "AuthSession_idleExpiresAt_idx" ON "AuthSession"("idleExpiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_revokedAt_idx" ON "AuthSession"("revokedAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_organizationId_status_updatedAt_id_idx" ON "BillingInvoice"("organizationId", "status", "updatedAt", "id");
