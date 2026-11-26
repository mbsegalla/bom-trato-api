CREATE TYPE "MercadoPagoSandboxPixStatus" AS ENUM ('RESERVED', 'PENDING', 'REVIEW_REQUIRED');

CREATE TABLE "MercadoPagoSandboxPix" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "receivableId" UUID NOT NULL,
  "receivableVersion" INTEGER NOT NULL,
  "accountId" VARCHAR(30) NOT NULL,
  "clientId" VARCHAR(30) NOT NULL,
  "issuedById" UUID NOT NULL,
  "amountInCents" INTEGER NOT NULL,
  "status" "MercadoPagoSandboxPixStatus" NOT NULL DEFAULT 'RESERVED',
  "externalPaymentId" VARCHAR(30),
  "copyAndPasteCiphertext" TEXT,
  "requestedExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MercadoPagoSandboxPix_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MercadoPagoSandboxPix_amount_version_check" CHECK ("amountInCents" > 0 AND "receivableVersion" > 0),
  CONSTRAINT "MercadoPagoSandboxPix_expiry_check" CHECK ("requestedExpiresAt" > "createdAt"),
  CONSTRAINT "MercadoPagoSandboxPix_state_check" CHECK (
    ("status" = 'RESERVED' AND "externalPaymentId" IS NULL AND "copyAndPasteCiphertext" IS NULL AND "expiresAt" IS NULL)
    OR ("status" = 'PENDING' AND "externalPaymentId" IS NOT NULL AND "copyAndPasteCiphertext" IS NOT NULL
      AND "expiresAt" IS NOT NULL AND "expiresAt" <= "requestedExpiresAt" + INTERVAL '1 second')
    OR ("status" = 'REVIEW_REQUIRED' AND "copyAndPasteCiphertext" IS NULL AND "expiresAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "MercadoPagoSandboxPix_receivable_key"
ON "MercadoPagoSandboxPix"("receivableId", "organizationId");

CREATE UNIQUE INDEX "MercadoPagoSandboxPix_external_key"
ON "MercadoPagoSandboxPix"("accountId", "externalPaymentId");

ALTER TABLE "MercadoPagoSandboxPix" ADD CONSTRAINT "MercadoPagoSandboxPix_receivable_fkey"
FOREIGN KEY ("receivableId", "organizationId") REFERENCES "Receivable"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
