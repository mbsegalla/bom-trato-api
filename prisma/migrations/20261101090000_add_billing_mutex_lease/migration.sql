ALTER TABLE "BillingMutex"
ADD COLUMN "leaseUntil" TIMESTAMPTZ(3);

UPDATE "BillingMutex"
SET "leaseUntil" = CASE
  WHEN "recoveryRequired" = true THEN "acquiredAt"
  ELSE GREATEST(
    "acquiredAt" + INTERVAL '30 seconds',
    CURRENT_TIMESTAMP + INTERVAL '30 seconds'
  )
END;

ALTER TABLE "BillingMutex"
ALTER COLUMN "leaseUntil" SET NOT NULL;