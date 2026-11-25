-- CreateTable
CREATE TABLE "WorkOrderAcceptance" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "shareId" UUID NOT NULL,
    "signerName" VARCHAR(100) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "workOrderVersion" INTEGER NOT NULL,
    "consent" BOOLEAN NOT NULL DEFAULT true,
    "consentVersion" VARCHAR(20) NOT NULL,
    "consentText" VARCHAR(500) NOT NULL,
    "snapshotHash" VARCHAR(64) NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "WorkOrderAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderAcceptance_workOrderId_completedAt_key"
ON "WorkOrderAcceptance"("workOrderId", "completedAt");

CREATE INDEX "WorkOrderAcceptance_organizationId_workOrderId_acceptedAt_idx"
ON "WorkOrderAcceptance"("organizationId", "workOrderId", "acceptedAt");

CREATE UNIQUE INDEX "WorkOrderShare_id_workOrderId_organizationId_key"
ON "WorkOrderShare"("id", "workOrderId", "organizationId");

-- AddForeignKey
ALTER TABLE "WorkOrderAcceptance"
ADD CONSTRAINT "WorkOrderAcceptance_workOrderId_organizationId_fkey"
FOREIGN KEY ("workOrderId", "organizationId")
REFERENCES "WorkOrder"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrderAcceptance"
ADD CONSTRAINT "WorkOrderAcceptance_shareId_workOrderId_organizationId_fkey"
FOREIGN KEY ("shareId", "workOrderId", "organizationId")
REFERENCES "WorkOrderShare"("id", "workOrderId", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "WorkOrderAcceptance"
ADD CONSTRAINT "WorkOrderAcceptance_valid_input_check"
CHECK (
    length(btrim("signerName")) BETWEEN 2 AND 100
    AND "workOrderVersion" > 0
    AND length(btrim("consentVersion")) > 0
    AND length(btrim("consentText")) > 0
    AND "consent"
),
ADD CONSTRAINT "WorkOrderAcceptance_snapshot_hash_check"
CHECK ("snapshotHash" ~ '^[a-f0-9]{64}$'),
ADD CONSTRAINT "WorkOrderAcceptance_snapshot_check"
CHECK (jsonb_typeof("snapshot") = 'object'),
ADD CONSTRAINT "WorkOrderAcceptance_completion_check"
CHECK ("acceptedAt" >= "completedAt");
