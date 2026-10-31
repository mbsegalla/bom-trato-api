-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InAppNotificationType" ADD VALUE 'QUOTE_FOLLOW_UP';
ALTER TYPE "InAppNotificationType" ADD VALUE 'WORK_ORDER_REMINDER';
ALTER TYPE "InAppNotificationType" ADD VALUE 'RECEIVABLE_DUE_SOON';
ALTER TYPE "InAppNotificationType" ADD VALUE 'RECEIVABLE_OVERDUE';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "defaultServiceAddress" VARCHAR(500);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "defaultReceivableDueDays" INTEGER NOT NULL DEFAULT 7;
