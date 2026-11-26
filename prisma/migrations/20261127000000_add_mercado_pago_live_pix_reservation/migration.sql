CREATE TYPE "MercadoPagoLivePixStatus" AS ENUM ('RESERVED', 'PENDING', 'REVIEW_REQUIRED');

CREATE TYPE "MercadoPagoLivePixResult" AS ENUM (
  'UNCERTAIN_CREATION', 'VERIFIED_PENDING', 'VERIFIED_REVIEW_REQUIRED', 'SNAPSHOT_CHANGED', 'BINDING_CONFLICT'
);

CREATE TABLE "MercadoPagoLivePix" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "receivableId" UUID NOT NULL,
  "receivableVersion" INTEGER NOT NULL,
  "clientId" VARCHAR(30) NOT NULL,
  "accountId" VARCHAR(30) NOT NULL,
  "issuedById" UUID NOT NULL,
  "amountInCents" INTEGER NOT NULL,
  "status" "MercadoPagoLivePixStatus" NOT NULL DEFAULT 'RESERVED',
  "resultCode" "MercadoPagoLivePixResult",
  "externalPaymentId" VARCHAR(30),
  "providerChargeId" UUID,
  "copyAndPasteCiphertext" TEXT,
  "requestedExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MercadoPagoLivePix_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MercadoPagoLivePix_amount_version_check" CHECK ("amountInCents" > 0 AND "receivableVersion" > 0),
  CONSTRAINT "MercadoPagoLivePix_expiry_check" CHECK ("requestedExpiresAt" > "createdAt"),
  CONSTRAINT "MercadoPagoLivePix_binding_check" CHECK (
    ("providerChargeId" IS NULL) = ("externalPaymentId" IS NULL)
    AND ("providerChargeId" IS NULL OR "providerChargeId" = "id")
  ),
  CONSTRAINT "MercadoPagoLivePix_state_check" CHECK (
    ("status" = 'RESERVED' AND "resultCode" IS NULL AND "providerChargeId" IS NULL
      AND "copyAndPasteCiphertext" IS NULL AND "expiresAt" IS NULL)
    OR ("status" = 'PENDING' AND "resultCode" IS NOT NULL AND "resultCode" = 'VERIFIED_PENDING'
      AND "providerChargeId" IS NOT NULL AND "copyAndPasteCiphertext" IS NOT NULL
      AND "expiresAt" IS NOT NULL AND "expiresAt" <= "requestedExpiresAt" + INTERVAL '1 second')
    OR ("status" = 'REVIEW_REQUIRED' AND "resultCode" IS NOT NULL
      AND "copyAndPasteCiphertext" IS NULL AND "expiresAt" IS NULL)
  ),
  CONSTRAINT "MercadoPagoLivePix_receivable_fkey"
    FOREIGN KEY ("receivableId", "organizationId") REFERENCES "Receivable"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MercadoPagoLivePix_providerCharge_fkey"
    FOREIGN KEY ("providerChargeId") REFERENCES "ReceivableProviderCharge"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MercadoPagoLivePix_receivable_key" ON "MercadoPagoLivePix"("receivableId", "organizationId");
CREATE UNIQUE INDEX "MercadoPagoLivePix_external_key" ON "MercadoPagoLivePix"("clientId", "externalPaymentId");
CREATE UNIQUE INDEX "MercadoPagoLivePix_providerChargeId_key" ON "MercadoPagoLivePix"("providerChargeId");
