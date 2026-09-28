-- DropIndex
DROP INDEX "PublicBusinessProfile_published_publishedAt_id_idx";

-- AlterTable
ALTER TABLE "PublicBusinessProfile" ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratingSum" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reputationScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProfessionalReviewInvitation" (
    "id" UUID NOT NULL,
    "publicBusinessProfileId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalReviewInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalReview" (
    "id" UUID NOT NULL,
    "publicBusinessProfileId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "reviewerDisplayName" VARCHAR(120) NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalReviewInvitation_tokenHash_key" ON "ProfessionalReviewInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "ProfessionalReviewInvitation_workOrderId_createdAt_idx" ON "ProfessionalReviewInvitation"("workOrderId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProfessionalReviewInvitation_publicBusinessProfileId_idx" ON "ProfessionalReviewInvitation"("publicBusinessProfileId");

-- CreateIndex
CREATE INDEX "ProfessionalReviewInvitation_expiresAt_idx" ON "ProfessionalReviewInvitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalReview_workOrderId_key" ON "ProfessionalReview"("workOrderId");

-- CreateIndex
CREATE INDEX "ProfessionalReview_publicBusinessProfileId_createdAt_idx" ON "ProfessionalReview"("publicBusinessProfileId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProfessionalReview_publicBusinessProfileId_rating_idx" ON "ProfessionalReview"("publicBusinessProfileId", "rating");

-- CreateIndex
CREATE INDEX "PublicBusinessProfile_published_reputationScore_ratingCount_idx" ON "PublicBusinessProfile"("published", "reputationScore" DESC, "ratingCount" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "ProfessionalReviewInvitation" ADD CONSTRAINT "ProfessionalReviewInvitation_publicBusinessProfileId_fkey" FOREIGN KEY ("publicBusinessProfileId") REFERENCES "PublicBusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalReviewInvitation" ADD CONSTRAINT "ProfessionalReviewInvitation_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalReviewInvitation" ADD CONSTRAINT "ProfessionalReviewInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalReview" ADD CONSTRAINT "ProfessionalReview_publicBusinessProfileId_fkey" FOREIGN KEY ("publicBusinessProfileId") REFERENCES "PublicBusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalReview" ADD CONSTRAINT "ProfessionalReview_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalReview" ADD CONSTRAINT "ProfessionalReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
