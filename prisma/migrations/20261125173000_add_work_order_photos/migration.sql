-- CreateEnum
CREATE TYPE "WorkOrderPhotoStage" AS ENUM ('BEFORE', 'DURING', 'AFTER');

-- CreateTable
CREATE TABLE "WorkOrderPhoto" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "objectKey" VARCHAR(500) NOT NULL,
    "stage" "WorkOrderPhotoStage" NOT NULL,
    "caption" VARCHAR(240),
    "visibleInPortal" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeInBytes" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkOrderPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderPhoto_objectKey_key" ON "WorkOrderPhoto"("objectKey");

-- CreateIndex
CREATE INDEX "WorkOrderPhoto_organizationId_workOrderId_createdAt_id_idx"
ON "WorkOrderPhoto"("organizationId", "workOrderId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "WorkOrderPhoto"
ADD CONSTRAINT "WorkOrderPhoto_workOrderId_organizationId_fkey"
FOREIGN KEY ("workOrderId", "organizationId")
REFERENCES "WorkOrder"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "WorkOrderPhoto"
ADD CONSTRAINT "WorkOrderPhoto_valid_image_check"
CHECK (
    "width" BETWEEN 1 AND 2048
    AND "height" BETWEEN 1 AND 2048
    AND "sizeInBytes" BETWEEN 1 AND 10485760
    AND "version" > 0
);
