CREATE TABLE "MercadoPagoWebhookEvent" (
  "clientId" VARCHAR(30) NOT NULL,
  "deliveryKey" VARCHAR(64) NOT NULL,
  "paymentId" VARCHAR(30) NOT NULL,
  "requestId" VARCHAR(200) NOT NULL,
  "signedAt" TIMESTAMPTZ(3) NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MercadoPagoWebhookEvent_pkey" PRIMARY KEY ("clientId", "deliveryKey")
);

CREATE INDEX "MercadoPagoWebhookEvent_clientId_paymentId_idx"
ON "MercadoPagoWebhookEvent"("clientId", "paymentId");

CREATE INDEX "MercadoPagoWebhookEvent_receivedAt_idx"
ON "MercadoPagoWebhookEvent"("receivedAt");
