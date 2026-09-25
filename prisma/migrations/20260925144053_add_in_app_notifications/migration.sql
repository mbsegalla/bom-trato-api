-- CreateEnum
CREATE TYPE "InAppNotificationType" AS ENUM ('QUOTE_APPROVED', 'QUOTE_DECLINED', 'WORK_ORDER_ASSIGNED', 'WORK_ORDER_SCHEDULED', 'WORK_ORDER_RESCHEDULED', 'ORGANIZATION_MEMBER_JOINED', 'PAYMENT_FAILED', 'PAYMENT_ACTION_REQUIRED', 'PAYMENT_CONFIRMED', 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_CANCELED', 'PLAN_CHANGE_CONFIRMED');

-- CreateTable
CREATE TABLE "InAppNotification" (
    "id" UUID NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "InAppNotificationType" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "href" VARCHAR(500) NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationStreamTicket" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "sessionId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationStreamTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InAppNotification_key_key" ON "InAppNotification"("key");

-- CreateIndex
CREATE INDEX "InAppNotification_userId_organizationId_readAt_createdAt_idx" ON "InAppNotification"("userId", "organizationId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InAppNotification_organizationId_createdAt_idx" ON "InAppNotification"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationStreamTicket_tokenHash_key" ON "NotificationStreamTicket"("tokenHash");

-- CreateIndex
CREATE INDEX "NotificationStreamTicket_expiresAt_idx" ON "NotificationStreamTicket"("expiresAt");

-- CreateIndex
CREATE INDEX "NotificationStreamTicket_sessionId_organizationId_idx" ON "NotificationStreamTicket"("sessionId", "organizationId");

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationStreamTicket" ADD CONSTRAINT "NotificationStreamTicket_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationStreamTicket" ADD CONSTRAINT "NotificationStreamTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
