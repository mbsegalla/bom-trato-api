-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "setupCompletedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "Organization_ownerId_setupCompletedAt_createdAt_idx" ON "Organization"("ownerId", "setupCompletedAt", "createdAt");
