/*
  Warnings:

  - A unique constraint covering the columns `[id,organizationId]` on the table `Quote` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "QuoteStatusHistory" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "fromStatus" "QuoteStatus",
    "toStatus" "QuoteStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "customerName" VARCHAR(100) NOT NULL,
    "customerEmail" VARCHAR(254),
    "customerPhone" VARCHAR(30),
    "title" VARCHAR(150) NOT NULL,
    "instructions" VARCHAR(5000),
    "serviceAddress" VARCHAR(500),
    "executionNotes" VARCHAR(10000),
    "assignedToId" UUID,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "currency" VARCHAR(3) NOT NULL,
    "subtotalInCents" INTEGER NOT NULL,
    "discountInCents" INTEGER NOT NULL,
    "totalInCents" INTEGER NOT NULL,
    "scheduledStartAt" TIMESTAMPTZ(3),
    "scheduledEndAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "canceledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderItem" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "sourceQuoteItemId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(2000),
    "unit" "ServiceUnit" NOT NULL,
    "quantityInThousandths" INTEGER NOT NULL,
    "unitAmountInCents" INTEGER NOT NULL,
    "totalInCents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "WorkOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderStatusHistory" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "fromStatus" "WorkOrderStatus",
    "toStatus" "WorkOrderStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteStatusHistory_quoteId_createdAt_id_idx" ON "QuoteStatusHistory"("quoteId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteStatusHistory_quoteId_version_key" ON "QuoteStatusHistory"("quoteId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_quoteId_key" ON "WorkOrder"("quoteId");

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_status_createdAt_id_idx" ON "WorkOrder"("organizationId", "status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_customerId_idx" ON "WorkOrder"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_assignedToId_scheduledStartAt_idx" ON "WorkOrder"("organizationId", "assignedToId", "scheduledStartAt");

-- CreateIndex
CREATE INDEX "WorkOrderItem_workOrderId_position_idx" ON "WorkOrderItem"("workOrderId", "position");

-- CreateIndex
CREATE INDEX "WorkOrderStatusHistory_workOrderId_createdAt_id_idx" ON "WorkOrderStatusHistory"("workOrderId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderStatusHistory_workOrderId_version_key" ON "WorkOrderStatusHistory"("workOrderId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_id_organizationId_key" ON "Quote"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "QuoteStatusHistory" ADD CONSTRAINT "QuoteStatusHistory_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_quoteId_organizationId_fkey" FOREIGN KEY ("quoteId", "organizationId") REFERENCES "Quote"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_customerId_organizationId_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStatusHistory" ADD CONSTRAINT "WorkOrderStatusHistory_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
