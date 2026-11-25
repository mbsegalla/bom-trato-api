-- Match the composite one-to-one relation used by Prisma.
CREATE UNIQUE INDEX "WorkOrderWarranty_workOrderId_organizationId_key"
ON "WorkOrderWarranty"("workOrderId", "organizationId");
