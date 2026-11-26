ALTER TABLE "MercadoPagoConnection"
ADD COLUMN "refreshClaimId" UUID,
ADD COLUMN "refreshStartedAt" TIMESTAMPTZ(3);

ALTER TABLE "MercadoPagoConnection" ADD CONSTRAINT "MercadoPagoConnection_refresh_claim_check"
CHECK (
  ("refreshClaimId" IS NULL AND "refreshStartedAt" IS NULL)
  OR ("refreshClaimId" IS NOT NULL AND "refreshStartedAt" IS NOT NULL)
);
