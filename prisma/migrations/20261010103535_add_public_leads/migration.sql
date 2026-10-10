-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "InAppNotificationType" ADD VALUE 'LEAD_RECEIVED';

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "publicBusinessProfileId" UUID NOT NULL,
    "catalogServiceId" UUID,
    "requestedServiceName" VARCHAR(100),
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "message" VARCHAR(2000) NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "convertedCustomerId" UUID,
    "convertedQuoteId" UUID,
    "contactedAt" TIMESTAMPTZ(3),
    "convertedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_requestKey_key" ON "Lead"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_convertedQuoteId_key" ON "Lead"("convertedQuoteId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_status_createdAt_id_idx" ON "Lead"("organizationId", "status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Lead_publicBusinessProfileId_createdAt_idx" ON "Lead"("publicBusinessProfileId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Lead_catalogServiceId_idx" ON "Lead"("catalogServiceId");

-- CreateIndex
CREATE INDEX "Lead_convertedCustomerId_idx" ON "Lead"("convertedCustomerId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_publicBusinessProfileId_fkey" FOREIGN KEY ("publicBusinessProfileId") REFERENCES "PublicBusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_catalogServiceId_fkey" FOREIGN KEY ("catalogServiceId") REFERENCES "CatalogService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedCustomerId_fkey" FOREIGN KEY ("convertedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedQuoteId_fkey" FOREIGN KEY ("convertedQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
