/*
  Warnings:

  - A unique constraint covering the columns `[workOrderId,kind]` on the table `Receivable` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PaymentCondition" AS ENUM ('AFTER_COMPLETION', 'UPFRONT', 'DOWN_PAYMENT_AND_BALANCE');

-- CreateEnum
CREATE TYPE "ReceivableKind" AS ENUM ('FULL', 'DOWN_PAYMENT', 'REMAINING_BALANCE');

-- DropIndex
DROP INDEX "Receivable_workOrderId_key";

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "downPaymentPercentage" INTEGER,
ADD COLUMN     "paymentCondition" "PaymentCondition" NOT NULL DEFAULT 'AFTER_COMPLETION';

-- AlterTable
ALTER TABLE "Receivable" ADD COLUMN     "kind" "ReceivableKind" NOT NULL DEFAULT 'FULL';

-- CreateIndex
CREATE UNIQUE INDEX "Receivable_workOrderId_kind_key" ON "Receivable"("workOrderId", "kind");
