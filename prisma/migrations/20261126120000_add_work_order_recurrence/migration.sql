CREATE TYPE "WorkOrderRecurrenceUnit" AS ENUM ('DAY', 'WEEK', 'MONTH');

CREATE TABLE "WorkOrderRecurrence" (
  "workOrderId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "intervalUnit" "WorkOrderRecurrenceUnit" NOT NULL,
  "intervalCount" INTEGER NOT NULL,
  "nextVisitOn" DATE NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID NOT NULL,
  "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "WorkOrderRecurrence_pkey" PRIMARY KEY ("workOrderId"),
  CONSTRAINT "WorkOrderRecurrence_interval_check" CHECK (
    "intervalCount" >= 1 AND (
      ("intervalUnit" = 'DAY' AND "intervalCount" <= 365)
      OR ("intervalUnit" = 'WEEK' AND "intervalCount" <= 52)
      OR ("intervalUnit" = 'MONTH' AND "intervalCount" <= 12)
    )
  ),
  CONSTRAINT "WorkOrderRecurrence_date_check" CHECK (
    "nextVisitOn" BETWEEN DATE '2000-01-01' AND DATE '9999-12-31'
  ),
  CONSTRAINT "WorkOrderRecurrence_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "WorkOrderRecurrence_workOrderId_organizationId_key"
ON "WorkOrderRecurrence"("workOrderId", "organizationId");

CREATE INDEX "WorkOrderRecurrence_org_enabled_visit_order_idx"
ON "WorkOrderRecurrence"("organizationId", "enabled", "nextVisitOn", "workOrderId");

ALTER TABLE "WorkOrderRecurrence"
ADD CONSTRAINT "WorkOrderRecurrence_workOrderId_organizationId_fkey"
FOREIGN KEY ("workOrderId", "organizationId") REFERENCES "WorkOrder"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
