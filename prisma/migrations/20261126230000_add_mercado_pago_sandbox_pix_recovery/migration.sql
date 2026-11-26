CREATE TYPE "MercadoPagoSandboxRecoveryStatus" AS ENUM (
  'IN_PROGRESS', 'ABANDONED', 'NOT_FOUND', 'AMBIGUOUS', 'INVALID_PROVIDER_PAYMENT',
  'PROVIDER_UNAVAILABLE', 'CONNECTION_CHANGED', 'BINDING_CONFLICT', 'VERIFIED_PENDING',
  'VERIFIED_APPROVED', 'VERIFIED_CLOSED', 'VERIFIED_REFUNDED', 'VERIFIED_REVIEW_REQUIRED'
);

CREATE TABLE "MercadoPagoSandboxPixRecovery" (
  "id" UUID NOT NULL,
  "issuanceId" UUID NOT NULL,
  "startedById" UUID NOT NULL,
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3),
  "status" "MercadoPagoSandboxRecoveryStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "paymentId" VARCHAR(30),
  CONSTRAINT "MercadoPagoSandboxPixRecovery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MercadoPagoSandboxPixRecovery_lease_check" CHECK ("leaseExpiresAt" > "startedAt"),
  CONSTRAINT "MercadoPagoSandboxPixRecovery_state_check" CHECK (
    (("status" = 'IN_PROGRESS') = ("completedAt" IS NULL))
    AND ("completedAt" IS NULL OR "completedAt" >= "startedAt")
    AND (("status" IN ('VERIFIED_PENDING', 'VERIFIED_APPROVED', 'VERIFIED_CLOSED',
      'VERIFIED_REFUNDED', 'VERIFIED_REVIEW_REQUIRED')) = ("paymentId" IS NOT NULL))
  ),
  CONSTRAINT "MercadoPagoSandboxPixRecovery_issuanceId_fkey"
    FOREIGN KEY ("issuanceId") REFERENCES "MercadoPagoSandboxPix"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "MercadoPagoSandboxPixRecovery_issuanceId_startedAt_idx"
ON "MercadoPagoSandboxPixRecovery"("issuanceId", "startedAt");

-- Defense in depth: the organization write lock serializes claims.
CREATE UNIQUE INDEX "MercadoPagoSandboxPixRecovery_active_key"
ON "MercadoPagoSandboxPixRecovery"("issuanceId") WHERE "status" = 'IN_PROGRESS';
