/*
  Warnings:

  - A unique constraint covering the columns `[id,organizationId]` on the table `WorkOrder` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReceivablePaymentMethod" AS ENUM ('CASH', 'PIX', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'OTHER');

-- CreateTable
CREATE TABLE "Receivable" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "customerName" VARCHAR(100) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amountInCents" INTEGER NOT NULL,
    "receivedInCents" INTEGER NOT NULL DEFAULT 0,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "notes" VARCHAR(2000),
    "canceledAt" TIMESTAMPTZ(3),
    "canceledById" UUID,
    "cancellationReason" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivablePayment" (
    "id" UUID NOT NULL,
    "receivableId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "amountInCents" INTEGER NOT NULL,
    "method" "ReceivablePaymentMethod" NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "notes" VARCHAR(2000),
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMPTZ(3),
    "reversedById" UUID,
    "reversalReason" VARCHAR(1000),

    CONSTRAINT "ReceivablePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receivable_workOrderId_key" ON "Receivable"("workOrderId");

-- CreateIndex
CREATE INDEX "Receivable_organizationId_status_dueAt_id_idx" ON "Receivable"("organizationId", "status", "dueAt", "id");

-- CreateIndex
CREATE INDEX "Receivable_organizationId_createdAt_id_idx" ON "Receivable"("organizationId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Receivable_organizationId_customerId_idx" ON "Receivable"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "ReceivablePayment_receivableId_createdAt_id_idx" ON "ReceivablePayment"("receivableId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ReceivablePayment_receivableId_requestId_key" ON "ReceivablePayment"("receivableId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_id_organizationId_key" ON "WorkOrder"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_workOrderId_organizationId_fkey" FOREIGN KEY ("workOrderId", "organizationId") REFERENCES "WorkOrder"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_customerId_organizationId_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivablePayment" ADD CONSTRAINT "ReceivablePayment_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
