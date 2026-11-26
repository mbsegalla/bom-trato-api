ALTER TYPE "MercadoPagoLivePixStatus" ADD VALUE 'SETTLED';
ALTER TYPE "MercadoPagoLivePixStatus" ADD VALUE 'CLOSED';

ALTER TABLE "MercadoPagoLivePix"
  ADD COLUMN "settlementReviewCode" VARCHAR(50),
  DROP CONSTRAINT "MercadoPagoLivePix_state_check",
  ADD CONSTRAINT "MercadoPagoLivePix_state_check" CHECK (
    ("status"::text = 'RESERVED' AND "resultCode" IS NULL AND "providerChargeId" IS NULL
      AND "copyAndPasteCiphertext" IS NULL AND "expiresAt" IS NULL)
    OR ("status"::text = 'PENDING' AND "resultCode" IS NOT NULL AND "resultCode" = 'VERIFIED_PENDING'
      AND "providerChargeId" IS NOT NULL AND "copyAndPasteCiphertext" IS NOT NULL
      AND "expiresAt" IS NOT NULL AND "expiresAt" <= "requestedExpiresAt" + INTERVAL '1 second')
    OR ("status"::text = 'REVIEW_REQUIRED' AND "resultCode" IS NOT NULL
      AND "copyAndPasteCiphertext" IS NULL AND "expiresAt" IS NULL)
    OR ("status"::text IN ('SETTLED', 'CLOSED') AND "resultCode" IS NOT NULL
      AND "providerChargeId" IS NOT NULL AND "copyAndPasteCiphertext" IS NULL AND "expiresAt" IS NULL)
  ),
  ADD CONSTRAINT "MercadoPagoLivePix_settlement_review_check" CHECK (
    "settlementReviewCode" IS NULL OR "status"::text = 'REVIEW_REQUIRED'
  );

CREATE TABLE "MercadoPagoLiveWebhookEvent" (
  "clientId" VARCHAR(30) NOT NULL,
  "deliveryKey" VARCHAR(64) NOT NULL,
  "paymentId" VARCHAR(30) NOT NULL,
  "requestId" VARCHAR(200) NOT NULL,
  "signedAt" TIMESTAMPTZ(3) NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" UUID,
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "processedAt" TIMESTAMPTZ(3),
  "reviewRequiredAt" TIMESTAMPTZ(3),
  "resultCode" VARCHAR(50),
  "matchedIssuanceId" UUID,
  CONSTRAINT "MercadoPagoLiveWebhookEvent_pkey" PRIMARY KEY ("clientId", "deliveryKey"),
  CONSTRAINT "MercadoPagoLiveWebhookEvent_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "MercadoPagoLiveWebhookEvent_lease_check" CHECK (
    ("leaseToken" IS NULL) = ("leaseExpiresAt" IS NULL)
  ),
  CONSTRAINT "MercadoPagoLiveWebhookEvent_outcome_check" CHECK (
    NOT ("processedAt" IS NOT NULL AND "reviewRequiredAt" IS NOT NULL)
    AND (("processedAt" IS NULL AND "reviewRequiredAt" IS NULL) OR "leaseToken" IS NULL)
    AND (("processedAt" IS NULL AND "reviewRequiredAt" IS NULL) OR "resultCode" IS NOT NULL)
  )
);

CREATE INDEX "MercadoPagoLiveWebhookEvent_clientId_paymentId_idx"
ON "MercadoPagoLiveWebhookEvent"("clientId", "paymentId");
CREATE INDEX "MercadoPagoLiveWebhookEvent_clientId_nextAttemptAt_idx"
ON "MercadoPagoLiveWebhookEvent"("clientId", "nextAttemptAt");
CREATE INDEX "MercadoPagoLiveWebhookEvent_receivedAt_idx"
ON "MercadoPagoLiveWebhookEvent"("receivedAt");
