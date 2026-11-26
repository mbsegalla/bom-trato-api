ALTER TABLE "MercadoPagoWebhookEvent"
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "leaseToken" UUID,
  ADD COLUMN "leaseExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "processedAt" TIMESTAMPTZ(3),
  ADD COLUMN "reviewRequiredAt" TIMESTAMPTZ(3),
  ADD COLUMN "resultCode" VARCHAR(50),
  ADD COLUMN "matchedIssuanceId" UUID,
  ADD CONSTRAINT "MercadoPagoWebhookEvent_attempts_check" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "MercadoPagoWebhookEvent_lease_check" CHECK (
    ("leaseToken" IS NULL) = ("leaseExpiresAt" IS NULL)
  ),
  ADD CONSTRAINT "MercadoPagoWebhookEvent_outcome_check" CHECK (
    NOT ("processedAt" IS NOT NULL AND "reviewRequiredAt" IS NOT NULL)
    AND (("processedAt" IS NULL AND "reviewRequiredAt" IS NULL) OR "leaseToken" IS NULL)
    AND (("processedAt" IS NULL AND "reviewRequiredAt" IS NULL) OR "resultCode" IS NOT NULL)
  );

CREATE INDEX "MercadoPagoWebhookEvent_clientId_nextAttemptAt_idx"
ON "MercadoPagoWebhookEvent"("clientId", "nextAttemptAt");

CREATE INDEX "MercadoPagoSandboxPix_clientId_externalPaymentId_idx"
ON "MercadoPagoSandboxPix"("clientId", "externalPaymentId");
