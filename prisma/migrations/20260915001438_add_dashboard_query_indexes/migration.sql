-- CreateIndex
CREATE INDEX "ReceivablePayment_receivableId_reversedAt_receivedAt_idx" ON "ReceivablePayment"("receivableId", "reversedAt", "receivedAt");

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_status_scheduledStartAt_id_idx" ON "WorkOrder"("organizationId", "status", "scheduledStartAt", "id");
