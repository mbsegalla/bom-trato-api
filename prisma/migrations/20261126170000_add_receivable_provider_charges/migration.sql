CREATE TYPE "ReceivableProviderPaymentReviewReason" AS ENUM (
  'CURRENCY_MISMATCH',
  'AMOUNT_MISMATCH',
  'RECEIVABLE_CHANGED',
  'RECEIVABLE_INELIGIBLE',
  'OWNER_CHANGED',
  'REQUEST_ID_CONFLICT'
);

CREATE UNIQUE INDEX "ReceivablePayment_id_receivableId_key" ON "ReceivablePayment"("id", "receivableId");

CREATE TABLE "ReceivableProviderCharge" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "receivableId" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "externalAccountId" VARCHAR(128) NOT NULL,
  "externalPaymentId" VARCHAR(128) NOT NULL,
  "expectedAmountInCents" INTEGER NOT NULL,
  "receivableVersion" INTEGER NOT NULL,
  "registeredById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentId" UUID,
  "confirmedEventId" VARCHAR(200),
  "confirmedAmountInCents" INTEGER,
  "confirmedCurrency" VARCHAR(3),
  "confirmedAt" TIMESTAMPTZ(3),
  "reviewReason" "ReceivableProviderPaymentReviewReason",
  "reviewEventId" VARCHAR(200),
  CONSTRAINT "ReceivableProviderCharge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReceivableProviderCharge_amount_version_check"
    CHECK ("expectedAmountInCents" > 0 AND "receivableVersion" > 0),
  CONSTRAINT "ReceivableProviderCharge_confirmation_check" CHECK (
    ("confirmedEventId" IS NULL AND "confirmedAmountInCents" IS NULL
      AND "confirmedCurrency" IS NULL AND "confirmedAt" IS NULL)
    OR ("confirmedEventId" IS NOT NULL AND "confirmedAmountInCents" IS NOT NULL
      AND "confirmedAmountInCents" > 0 AND "confirmedCurrency" IS NOT NULL AND "confirmedAt" IS NOT NULL)
  ),
  CONSTRAINT "ReceivableProviderCharge_review_check" CHECK (
    ("reviewReason" IS NULL AND "reviewEventId" IS NULL)
    OR ("reviewReason" IS NOT NULL AND "reviewEventId" IS NOT NULL AND "confirmedEventId" IS NOT NULL)
  ),
  CONSTRAINT "ReceivableProviderCharge_payment_check"
    CHECK ("paymentId" IS NULL OR "confirmedEventId" IS NOT NULL)
);

CREATE UNIQUE INDEX "ReceivableProviderCharge_provider_payment_key"
ON "ReceivableProviderCharge"("provider", "externalAccountId", "externalPaymentId");

CREATE UNIQUE INDEX "ReceivableProviderCharge_payment_receivable_key"
ON "ReceivableProviderCharge"("paymentId", "receivableId");

CREATE INDEX "ReceivableProviderCharge_org_receivable_idx"
ON "ReceivableProviderCharge"("organizationId", "receivableId");

ALTER TABLE "ReceivableProviderCharge" ADD CONSTRAINT "ReceivableProviderCharge_receivable_fkey"
FOREIGN KEY ("receivableId", "organizationId") REFERENCES "Receivable"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReceivableProviderCharge" ADD CONSTRAINT "ReceivableProviderCharge_payment_fkey"
FOREIGN KEY ("paymentId", "receivableId") REFERENCES "ReceivablePayment"("id", "receivableId")
ON DELETE RESTRICT ON UPDATE CASCADE;
