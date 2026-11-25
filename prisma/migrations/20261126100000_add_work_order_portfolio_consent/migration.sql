ALTER TABLE "WorkOrderPhoto"
  ADD COLUMN "portfolioConsentedAt" TIMESTAMPTZ(3),
  ADD COLUMN "portfolioConsentName" VARCHAR(100),
  ADD COLUMN "portfolioConsentShareId" UUID,
  ADD COLUMN "portfolioRevokedAt" TIMESTAMPTZ(3),
  ADD COLUMN "portfolioPublishedAt" TIMESTAMPTZ(3),
  ADD COLUMN "portfolioPublishedById" UUID;

CREATE INDEX "WorkOrderPhoto_organizationId_portfolioPublishedAt_idx"
  ON "WorkOrderPhoto"("organizationId", "portfolioPublishedAt");

ALTER TABLE "WorkOrderPhoto"
  ADD CONSTRAINT "WorkOrderPhoto_portfolio_consistency_check"
  CHECK (
    "portfolioPublishedAt" IS NULL
    OR ("portfolioConsentedAt" IS NOT NULL AND "portfolioRevokedAt" IS NULL)
  );
