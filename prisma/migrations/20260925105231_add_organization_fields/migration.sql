-- CreateEnum
CREATE TYPE "OrganizationDocumentType" AS ENUM ('CPF', 'CNPJ');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "addressLine1" VARCHAR(150),
ADD COLUMN     "addressLine2" VARCHAR(100),
ADD COLUMN     "city" VARCHAR(100),
ADD COLUMN     "document" VARCHAR(14),
ADD COLUMN     "documentType" "OrganizationDocumentType",
ADD COLUMN     "email" VARCHAR(254),
ADD COLUMN     "phone" VARCHAR(30),
ADD COLUMN     "postalCode" VARCHAR(8),
ADD COLUMN     "state" VARCHAR(2);
