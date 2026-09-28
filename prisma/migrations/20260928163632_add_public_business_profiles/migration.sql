-- CreateTable
CREATE TABLE "PublicBusinessProfile" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "headline" VARCHAR(160),
    "description" TEXT,
    "whatsappPhone" VARCHAR(11),
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabledAt" TIMESTAMPTZ(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PublicBusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicBusinessProfileService" (
    "publicBusinessProfileId" UUID NOT NULL,
    "catalogServiceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicBusinessProfileService_pkey" PRIMARY KEY ("publicBusinessProfileId","catalogServiceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicBusinessProfile_organizationId_key" ON "PublicBusinessProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicBusinessProfile_slug_key" ON "PublicBusinessProfile"("slug");

-- CreateIndex
CREATE INDEX "PublicBusinessProfile_published_publishedAt_id_idx" ON "PublicBusinessProfile"("published", "publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "PublicBusinessProfileService_catalogServiceId_idx" ON "PublicBusinessProfileService"("catalogServiceId");

-- CreateIndex
CREATE INDEX "Organization_state_city_idx" ON "Organization"("state", "city");

-- AddForeignKey
ALTER TABLE "PublicBusinessProfile" ADD CONSTRAINT "PublicBusinessProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicBusinessProfileService" ADD CONSTRAINT "PublicBusinessProfileService_publicBusinessProfileId_fkey" FOREIGN KEY ("publicBusinessProfileId") REFERENCES "PublicBusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicBusinessProfileService" ADD CONSTRAINT "PublicBusinessProfileService_catalogServiceId_fkey" FOREIGN KEY ("catalogServiceId") REFERENCES "CatalogService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
