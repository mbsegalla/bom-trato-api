ALTER TABLE "WorkOrderRecurrence"
ADD COLUMN "autoGenerateEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "WorkOrderRecurrence_auto_due_idx"
ON "WorkOrderRecurrence"("autoGenerateEnabled", "enabled", "nextVisitOn", "workOrderId");

CREATE TABLE "WorkOrderRecurrenceGeneration" (
  "workOrderId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "visitOn" DATE NOT NULL,
  "quoteId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderRecurrenceGeneration_pkey" PRIMARY KEY ("workOrderId", "visitOn")
);

CREATE UNIQUE INDEX "WorkOrderRecurrenceGeneration_quote_org_key"
ON "WorkOrderRecurrenceGeneration"("quoteId", "organizationId");

CREATE INDEX "WorkOrderRecurrenceGeneration_latest_idx"
ON "WorkOrderRecurrenceGeneration"("workOrderId", "createdAt" DESC, "visitOn" DESC);

ALTER TABLE "WorkOrderRecurrenceGeneration"
ADD CONSTRAINT "WorkOrderRecurrenceGeneration_recurrence_fkey"
FOREIGN KEY ("workOrderId", "organizationId")
REFERENCES "WorkOrderRecurrence"("workOrderId", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrderRecurrenceGeneration"
ADD CONSTRAINT "WorkOrderRecurrenceGeneration_quote_fkey"
FOREIGN KEY ("quoteId", "organizationId")
REFERENCES "Quote"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
