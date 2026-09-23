/*
  Warnings:

  - You are about to alter the column `passwordHash` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "selectedPlanPriceId" UUID,
ALTER COLUMN "passwordHash" SET DATA TYPE VARCHAR(255);

-- CreateIndex
CREATE INDEX "User_selectedPlanPriceId_idx" ON "User"("selectedPlanPriceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_selectedPlanPriceId_fkey" FOREIGN KEY ("selectedPlanPriceId") REFERENCES "PlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
