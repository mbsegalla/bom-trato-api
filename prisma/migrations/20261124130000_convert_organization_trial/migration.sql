-- CreateFunction
CREATE OR REPLACE FUNCTION "convertOrganizationTrialOnPayment"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."paidThrough" IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE "OrganizationTrial"
    SET "convertedAt" = GREATEST(
        "startsAt",
        CURRENT_TIMESTAMP
    )
    WHERE "organizationId" = NEW."organizationId"
      AND "convertedAt" IS NULL;

    RETURN NEW;
END;
$$;

-- CreateTrigger
CREATE TRIGGER "Subscription_convertOrganizationTrial_trigger"
AFTER INSERT OR UPDATE OF "paidThrough"
ON "Subscription"
FOR EACH ROW
WHEN (NEW."paidThrough" IS NOT NULL)
EXECUTE FUNCTION "convertOrganizationTrialOnPayment"();

-- BackfillExistingConversions
UPDATE "OrganizationTrial" AS trial
SET "convertedAt" = GREATEST(
    trial."startsAt",
    CURRENT_TIMESTAMP
)
WHERE trial."convertedAt" IS NULL
  AND EXISTS (
      SELECT 1
      FROM "Subscription" AS subscription
      WHERE subscription."organizationId" = trial."organizationId"
        AND subscription."paidThrough" IS NOT NULL
  );