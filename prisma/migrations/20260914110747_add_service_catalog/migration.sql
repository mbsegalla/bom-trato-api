-- CreateEnum
CREATE TYPE "ServiceUnit" AS ENUM ('SERVICE', 'HOUR', 'DAY', 'UNIT', 'SQUARE_METER');

-- CreateTable
CREATE TABLE "CatalogService" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(2000),
    "unit" "ServiceUnit" NOT NULL DEFAULT 'SERVICE',
    "amountInCents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'brl',
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CatalogService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogService_organizationId_archivedAt_createdAt_id_idx" ON "CatalogService"("organizationId", "archivedAt", "createdAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "CatalogService" ADD CONSTRAINT "CatalogService_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
