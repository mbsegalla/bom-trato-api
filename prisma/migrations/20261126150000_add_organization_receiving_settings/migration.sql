CREATE TYPE "PixKeyType" AS ENUM ('CPF', 'CNPJ', 'PHONE', 'EMAIL', 'EVP');

CREATE TABLE "OrganizationReceivingSettings" (
  "organizationId" UUID NOT NULL,
  "pixEnabled" BOOLEAN NOT NULL DEFAULT false,
  "pixKeyType" "PixKeyType",
  "pixKeyCiphertext" TEXT,
  "merchantName" VARCHAR(25),
  "merchantCity" VARCHAR(15),
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OrganizationReceivingSettings_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "OrganizationReceivingSettings_version_check" CHECK ("version" > 0),
  CONSTRAINT "OrganizationReceivingSettings_pix_check" CHECK (
    ("pixEnabled" AND "pixKeyType" IS NOT NULL AND "pixKeyCiphertext" IS NOT NULL
      AND "merchantName" IS NOT NULL AND "merchantCity" IS NOT NULL)
    OR (NOT "pixEnabled" AND "pixKeyType" IS NULL AND "pixKeyCiphertext" IS NULL
      AND "merchantName" IS NULL AND "merchantCity" IS NULL)
  )
);

ALTER TABLE "OrganizationReceivingSettings"
ADD CONSTRAINT "OrganizationReceivingSettings_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
