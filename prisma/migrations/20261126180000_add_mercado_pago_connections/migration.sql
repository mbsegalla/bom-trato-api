CREATE TABLE "MercadoPagoConnection" (
  "organizationId" UUID NOT NULL,
  "liveMode" BOOLEAN NOT NULL,
  "clientId" VARCHAR(30) NOT NULL,
  "accountId" VARCHAR(30) NOT NULL,
  "connectedById" UUID NOT NULL,
  "accessTokenCiphertext" TEXT,
  "refreshTokenCiphertext" TEXT,
  "expiresAt" TIMESTAMPTZ(3),
  "connectedAt" TIMESTAMPTZ(3) NOT NULL,
  "disconnectedAt" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MercadoPagoConnection_pkey" PRIMARY KEY ("organizationId", "liveMode"),
  CONSTRAINT "MercadoPagoConnection_credentials_check" CHECK (
    ("disconnectedAt" IS NULL AND "accessTokenCiphertext" IS NOT NULL
      AND "refreshTokenCiphertext" IS NOT NULL AND "expiresAt" IS NOT NULL
      AND "expiresAt" > "connectedAt")
    OR ("disconnectedAt" IS NOT NULL AND "accessTokenCiphertext" IS NULL
      AND "refreshTokenCiphertext" IS NULL AND "expiresAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "MercadoPagoConnection_accountId_liveMode_key"
ON "MercadoPagoConnection"("accountId", "liveMode");

ALTER TABLE "MercadoPagoConnection" ADD CONSTRAINT "MercadoPagoConnection_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MercadoPagoOAuthAttempt" (
  "organizationId" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "clientId" VARCHAR(30) NOT NULL,
  "liveMode" BOOLEAN NOT NULL,
  "stateHash" VARCHAR(64) NOT NULL,
  "verifierCiphertext" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  CONSTRAINT "MercadoPagoOAuthAttempt_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "MercadoPagoOAuthAttempt_expiry_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "MercadoPagoOAuthAttempt_consumption_check" CHECK (
    ("consumedAt" IS NULL AND "verifierCiphertext" IS NOT NULL)
    OR ("consumedAt" IS NOT NULL AND "verifierCiphertext" IS NULL)
  )
);

CREATE UNIQUE INDEX "MercadoPagoOAuthAttempt_stateHash_key" ON "MercadoPagoOAuthAttempt"("stateHash");

ALTER TABLE "MercadoPagoOAuthAttempt" ADD CONSTRAINT "MercadoPagoOAuthAttempt_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
