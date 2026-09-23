-- CreateTable
CREATE TABLE "BillingCustomerReference" (
    "id" UUID NOT NULL,
    "billingCustomerId" UUID NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "detachedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingCustomerReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomerReference_stripeCustomerId_key" ON "BillingCustomerReference"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "BillingCustomerReference_billingCustomerId_createdAt_id_idx" ON "BillingCustomerReference"("billingCustomerId", "createdAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "BillingCustomerReference" ADD CONSTRAINT "BillingCustomerReference_billingCustomerId_fkey" FOREIGN KEY ("billingCustomerId") REFERENCES "BillingCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
