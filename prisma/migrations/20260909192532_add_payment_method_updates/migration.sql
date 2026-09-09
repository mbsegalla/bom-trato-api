-- CreateEnum
CREATE TYPE "PaymentMethodUpdateStatus" AS ENUM ('PENDING', 'APPLIED', 'CANCELED');

-- CreateTable
CREATE TABLE "PaymentMethodUpdate" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "activeOrganizationId" UUID,
    "requestedById" UUID NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeSetupIntentId" TEXT,
    "status" "PaymentMethodUpdateStatus" NOT NULL DEFAULT 'PENDING',
    "consentVersion" VARCHAR(50) NOT NULL,
    "consentAcceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "nextCheckAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentMethodUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethodUpdate_activeOrganizationId_key" ON "PaymentMethodUpdate"("activeOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethodUpdate_stripeSetupIntentId_key" ON "PaymentMethodUpdate"("stripeSetupIntentId");

-- CreateIndex
CREATE INDEX "PaymentMethodUpdate_status_nextCheckAt_idx" ON "PaymentMethodUpdate"("status", "nextCheckAt");

-- CreateIndex
CREATE INDEX "PaymentMethodUpdate_organizationId_createdAt_idx" ON "PaymentMethodUpdate"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentMethodUpdate" ADD CONSTRAINT "PaymentMethodUpdate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
