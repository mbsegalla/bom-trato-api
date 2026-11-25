-- CreateTable
CREATE TABLE "WorkOrderShare" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "activeWorkOrderId" UUID,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkOrderShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderShare_activeWorkOrderId_key"
ON "WorkOrderShare"("activeWorkOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderShare_tokenHash_key"
ON "WorkOrderShare"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkOrderShare_organizationId_workOrderId_revokedAt_idx"
ON "WorkOrderShare"("organizationId", "workOrderId", "revokedAt");

-- CreateIndex
CREATE INDEX "WorkOrderShare_expiresAt_idx"
ON "WorkOrderShare"("expiresAt");

-- AddForeignKey
ALTER TABLE "WorkOrderShare"
ADD CONSTRAINT "WorkOrderShare_workOrderId_organizationId_fkey"
FOREIGN KEY ("workOrderId", "organizationId")
REFERENCES "WorkOrder"("id", "organizationId")
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "WorkOrderShare"
ADD CONSTRAINT "WorkOrderShare_valid_period_check"
CHECK ("expiresAt" > "createdAt");

-- AddCheckConstraint
ALTER TABLE "WorkOrderShare"
ADD CONSTRAINT "WorkOrderShare_token_hash_check"
CHECK ("tokenHash" ~ '^[a-f0-9]{64}$');

-- AddCheckConstraint
ALTER TABLE "WorkOrderShare"
ADD CONSTRAINT "WorkOrderShare_active_reference_check"
CHECK (
    (
        "revokedAt" IS NULL
        AND "activeWorkOrderId" IS NOT NULL
        AND "activeWorkOrderId" = "workOrderId"
    )
    OR
    (
        "revokedAt" IS NOT NULL
        AND "activeWorkOrderId" IS NULL
    )
);