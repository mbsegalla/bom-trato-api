CREATE UNIQUE INDEX "Receivable_id_organizationId_key" ON "Receivable"("id", "organizationId");

CREATE TABLE "ReceivablePaymentLink" (
  "receivableId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "receivableVersion" INTEGER NOT NULL,
  "receivingSettingsVersion" INTEGER NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "ReceivablePaymentLink_pkey" PRIMARY KEY ("receivableId"),
  CONSTRAINT "ReceivablePaymentLink_versions_check" CHECK ("receivableVersion" > 0 AND "receivingSettingsVersion" > 0),
  CONSTRAINT "ReceivablePaymentLink_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "ReceivablePaymentLink_tokenHash_key" ON "ReceivablePaymentLink"("tokenHash");
CREATE UNIQUE INDEX "ReceivablePaymentLink_receivableId_organizationId_key" ON "ReceivablePaymentLink"("receivableId", "organizationId");

ALTER TABLE "ReceivablePaymentLink"
ADD CONSTRAINT "ReceivablePaymentLink_receivableId_organizationId_fkey"
FOREIGN KEY ("receivableId", "organizationId") REFERENCES "Receivable"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
