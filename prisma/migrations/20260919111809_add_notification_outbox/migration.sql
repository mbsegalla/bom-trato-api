-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACCEPTED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" UUID NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "encryptedPayload" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "firstAttemptAt" TIMESTAMPTZ(3),
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    "providerId" VARCHAR(100),
    "lastErrorCode" VARCHAR(60),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_key_key" ON "NotificationOutbox"("key");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_availableAt_createdAt_idx" ON "NotificationOutbox"("status", "availableAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_leaseUntil_idx" ON "NotificationOutbox"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "NotificationOutbox_finishedAt_idx" ON "NotificationOutbox"("finishedAt");
