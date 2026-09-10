-- CreateEnum
CREATE TYPE "PlanChangeMode" AS ENUM ('IMMEDIATE', 'PERIOD_END');

-- CreateEnum
CREATE TYPE "PlanChangeStatus" AS ENUM ('QUOTED', 'PROCESSING', 'PENDING_PAYMENT', 'SCHEDULED', 'APPLIED', 'CANCELED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "changeLevel" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlanChange" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "activeOrganizationId" UUID,
    "requestedById" UUID NOT NULL,
    "sourcePlanPriceId" UUID NOT NULL,
    "targetPlanPriceId" UUID NOT NULL,
    "targetMaxUsers" INTEGER NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeItemId" TEXT NOT NULL,
    "sourceStripePriceId" TEXT NOT NULL,
    "targetStripePriceId" TEXT NOT NULL,
    "mode" "PlanChangeMode" NOT NULL,
    "status" "PlanChangeStatus" NOT NULL DEFAULT 'QUOTED',
    "currency" VARCHAR(3) NOT NULL,
    "amountDueNow" INTEGER NOT NULL,
    "targetAmountInCents" INTEGER NOT NULL,
    "targetInterval" "BillingInterval" NOT NULL,
    "targetIntervalCount" INTEGER NOT NULL,
    "periodStart" INTEGER NOT NULL,
    "periodEnd" INTEGER NOT NULL,
    "prorationDate" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "stripeInvoiceId" TEXT,
    "stripeScheduleId" TEXT,
    "nextCheckAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlanChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanChange_activeOrganizationId_key" ON "PlanChange"("activeOrganizationId");

-- CreateIndex
CREATE INDEX "PlanChange_status_nextCheckAt_idx" ON "PlanChange"("status", "nextCheckAt");

-- CreateIndex
CREATE INDEX "PlanChange_organizationId_createdAt_idx" ON "PlanChange"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlanChange" ADD CONSTRAINT "PlanChange_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanChange" ADD CONSTRAINT "PlanChange_sourcePlanPriceId_fkey" FOREIGN KEY ("sourcePlanPriceId") REFERENCES "PlanPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanChange" ADD CONSTRAINT "PlanChange_targetPlanPriceId_fkey" FOREIGN KEY ("targetPlanPriceId") REFERENCES "PlanPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
