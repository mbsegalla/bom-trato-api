-- CreateTable
CREATE TABLE "WorkOrderScheduleHistory" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "fromAssignedToId" UUID,
    "toAssignedToId" UUID,
    "fromStartAt" TIMESTAMPTZ(3),
    "fromEndAt" TIMESTAMPTZ(3),
    "toStartAt" TIMESTAMPTZ(3),
    "toEndAt" TIMESTAMPTZ(3),
    "fromStatus" "WorkOrderStatus" NOT NULL,
    "toStatus" "WorkOrderStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderScheduleHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderScheduleHistory_workOrderId_version_key" ON "WorkOrderScheduleHistory"("workOrderId", "version");

-- AddForeignKey
ALTER TABLE "WorkOrderScheduleHistory" ADD CONSTRAINT "WorkOrderScheduleHistory_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
