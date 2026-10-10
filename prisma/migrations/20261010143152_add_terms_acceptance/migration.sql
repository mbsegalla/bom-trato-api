-- CreateTable
CREATE TABLE "TermsAcceptance" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "termsVersion" VARCHAR(30) NOT NULL,
    "privacyNoticeVersion" VARCHAR(30) NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(300),
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TermsAcceptance_userId_acceptedAt_idx" ON "TermsAcceptance"("userId", "acceptedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TermsAcceptance_userId_termsVersion_key" ON "TermsAcceptance"("userId", "termsVersion");

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
