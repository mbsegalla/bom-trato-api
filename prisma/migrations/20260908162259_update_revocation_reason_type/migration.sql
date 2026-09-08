/*
  Warnings:

  - The `revocationReason` column on the `AuthSession` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "SessionRevocationReason" AS ENUM ('LOGOUT', 'LOGOUT_ALL', 'SESSION_REPLACED', 'SESSION_REVOKED', 'REFRESH_REUSE', 'PASSWORD_RESET', 'SESSION_LIMIT');

-- AlterTable
ALTER TABLE "AuthSession" DROP COLUMN "revocationReason",
ADD COLUMN     "revocationReason" "SessionRevocationReason";
