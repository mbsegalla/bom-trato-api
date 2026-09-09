/*
  Warnings:

  - A unique constraint covering the columns `[ownerId,creationKey]` on the table `Organization` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Organization_ownerId_idx";

-- AlterTable
ALTER TABLE "BillingCustomer" ADD COLUMN     "nextReconcileAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "creationKey" UUID;

-- AlterTable
ALTER TABLE "StripeWebhookEvent" ADD COLUMN     "failedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "BillingMutex" (
    "key" VARCHAR(200) NOT NULL,
    "token" UUID NOT NULL,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BillingMutex_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingMutex_token_key" ON "BillingMutex"("token");

-- CreateIndex
CREATE INDEX "BillingCustomer_nextReconcileAt_id_idx" ON "BillingCustomer"("nextReconcileAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_ownerId_creationKey_key" ON "Organization"("ownerId", "creationKey");
