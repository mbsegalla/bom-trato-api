-- CreateTable
CREATE TABLE "OrganizationTrial" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "ownerId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "convertedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OrganizationTrial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTrial_organizationId_key"
ON "OrganizationTrial"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTrial_ownerId_key"
ON "OrganizationTrial"("ownerId");

-- CreateIndex
CREATE INDEX "OrganizationTrial_expiresAt_idx"
ON "OrganizationTrial"("expiresAt");

-- AddForeignKey
ALTER TABLE "OrganizationTrial"
ADD CONSTRAINT "OrganizationTrial_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationTrial"
ADD CONSTRAINT "OrganizationTrial_ownerId_fkey"
FOREIGN KEY ("ownerId")
REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "OrganizationTrial"
ADD CONSTRAINT "OrganizationTrial_valid_period_check"
CHECK ("expiresAt" > "startsAt");

-- AddCheckConstraint
ALTER TABLE "OrganizationTrial"
ADD CONSTRAINT "OrganizationTrial_valid_conversion_check"
CHECK ("convertedAt" IS NULL OR "convertedAt" >= "startsAt");

-- AddCheckConstraint
ALTER TABLE "OrganizationTrial"
ADD CONSTRAINT "OrganizationTrial_valid_revocation_check"
CHECK ("revokedAt" IS NULL OR "revokedAt" >= "startsAt");