/*
  Warnings:

  - You are about to alter the column `automationDescription` on the `NotificationOutbox` table. The data in that column could be lost. The data in that column will be cast from `VarChar(500)` to `VarChar(200)`.

*/
-- AlterTable
ALTER TABLE "NotificationOutbox" ADD COLUMN     "automationContextId" UUID,
ADD COLUMN     "automationHref" VARCHAR(500),
ADD COLUMN     "automationReferenceAt" TIMESTAMPTZ(3),
ALTER COLUMN "automationDescription" SET DATA TYPE VARCHAR(200);
