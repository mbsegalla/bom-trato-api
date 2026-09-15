-- AlterTable
ALTER TABLE "Quote" ALTER COLUMN "updatedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "QuoteStatusHistory" ALTER COLUMN "actorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "QuoteShare" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "quoteVersion" INTEGER NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "decision" "QuoteStatus",
    "decidedAt" TIMESTAMPTZ(3),
    "decidedVersion" INTEGER,

    CONSTRAINT "QuoteShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteShareRateLimit" (
    "key" VARCHAR(64) NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuoteShareRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteShare_tokenHash_key" ON "QuoteShare"("tokenHash");

-- CreateIndex
CREATE INDEX "QuoteShare_organizationId_quoteId_revokedAt_idx" ON "QuoteShare"("organizationId", "quoteId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteShare_quoteId_decidedVersion_key" ON "QuoteShare"("quoteId", "decidedVersion");

-- CreateIndex
CREATE INDEX "QuoteShareRateLimit_expiresAt_idx" ON "QuoteShareRateLimit"("expiresAt");

-- AddForeignKey
ALTER TABLE "QuoteShare" ADD CONSTRAINT "QuoteShare_quoteId_organizationId_fkey" FOREIGN KEY ("quoteId", "organizationId") REFERENCES "Quote"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
