CREATE TABLE "WorkOrderWarranty" (
  "workOrderId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "terms" VARCHAR(2000) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderWarranty_pkey" PRIMARY KEY ("workOrderId"),
  CONSTRAINT "WorkOrderWarranty_duration_check" CHECK ("durationDays" BETWEEN 1 AND 3650),
  CONSTRAINT "WorkOrderWarranty_terms_check" CHECK (length(btrim("terms")) BETWEEN 1 AND 2000),
  CONSTRAINT "WorkOrderWarranty_version_check" CHECK ("version" >= 1)
);

CREATE INDEX "WorkOrderWarranty_organizationId_workOrderId_idx" ON "WorkOrderWarranty"("organizationId", "workOrderId");

ALTER TABLE "WorkOrderWarranty"
ADD CONSTRAINT "WorkOrderWarranty_workOrderId_organizationId_fkey"
FOREIGN KEY ("workOrderId", "organizationId") REFERENCES "WorkOrder"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
