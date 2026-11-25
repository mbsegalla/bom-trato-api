-- CreateTable
CREATE TABLE "WorkOrderChecklistItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "position" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMPTZ(3),
    "completedById" UUID,
    "visibleInPortal" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkOrderChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderChecklistItem_organizationId_workOrderId_position_id_idx"
ON "WorkOrderChecklistItem"("organizationId", "workOrderId", "position", "id");

-- AddForeignKey
ALTER TABLE "WorkOrderChecklistItem"
ADD CONSTRAINT "WorkOrderChecklistItem_workOrderId_organizationId_fkey"
FOREIGN KEY ("workOrderId", "organizationId")
REFERENCES "WorkOrder"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "WorkOrderChecklistItem"
ADD CONSTRAINT "WorkOrderChecklistItem_valid_input_check"
CHECK (length(btrim("title")) > 0 AND "position" >= 0 AND "version" > 0),
ADD CONSTRAINT "WorkOrderChecklistItem_completion_check"
CHECK (
    ("completed" AND "completedAt" IS NOT NULL AND "completedById" IS NOT NULL)
    OR (NOT "completed" AND "completedAt" IS NULL AND "completedById" IS NULL)
);
