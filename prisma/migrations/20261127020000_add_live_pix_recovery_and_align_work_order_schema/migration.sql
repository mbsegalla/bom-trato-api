-- Reconcile historical SQL names/defaults with schema.prisma without deleting data.
-- The original 65-byte index name was truncated by PostgreSQL to 63 bytes.
DO $$
BEGIN
  IF to_regclass('public."WorkOrderChecklistItem_organizationId_workOrderId_position_id_i"') IS NOT NULL
    AND to_regclass('public."WorkOrderChecklistItem_organizationId_workOrderId_position__idx"') IS NULL
  THEN
    ALTER INDEX "WorkOrderChecklistItem_organizationId_workOrderId_position_id_i"
      RENAME TO "WorkOrderChecklistItem_organizationId_workOrderId_position__idx";
  END IF;
END $$;
ALTER TABLE "WorkOrderWarranty" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "MercadoPagoLivePix" ADD COLUMN "recoveredAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "MercadoPagoLivePix_recovered_binding_check" CHECK (
    "recoveredAt" IS NULL OR ("providerChargeId" IS NOT NULL AND "recoveredAt" >= "createdAt")
  );

CREATE TABLE "MercadoPagoLivePixRecovery" (
  "id" UUID NOT NULL,
  "issuanceId" UUID NOT NULL,
  "startedById" UUID NOT NULL,
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3),
  "resultCode" VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS',
  "paymentId" VARCHAR(30),
  CONSTRAINT "MercadoPagoLivePixRecovery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MercadoPagoLivePixRecovery_lease_check" CHECK ("leaseExpiresAt" > "startedAt"),
  CONSTRAINT "MercadoPagoLivePixRecovery_state_check" CHECK (
    ("resultCode" = 'IN_PROGRESS') = ("completedAt" IS NULL)
    AND ("completedAt" IS NULL OR "completedAt" >= "startedAt")
  ),
  CONSTRAINT "MercadoPagoLivePixRecovery_issuanceId_fkey"
    FOREIGN KEY ("issuanceId") REFERENCES "MercadoPagoLivePix"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MercadoPagoLivePixRecovery_issuanceId_startedAt_idx"
ON "MercadoPagoLivePixRecovery"("issuanceId", "startedAt");
CREATE UNIQUE INDEX "MercadoPagoLivePixRecovery_active_key"
ON "MercadoPagoLivePixRecovery"("issuanceId") WHERE "resultCode" = 'IN_PROGRESS';
