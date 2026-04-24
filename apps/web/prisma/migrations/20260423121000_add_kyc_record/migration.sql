-- Off-chain KYC record per (provider, wallet). Bridges to on-chain
-- IdentityRegistry writes; `bridgedAt` records idempotency.
CREATE TABLE "KycRecord" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerApplicantId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "countryCode" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "bridgedTokenizedAssetId" TEXT,
    "bridgedAt" TIMESTAMP(3),
    "bridgedTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KycRecord_provider_providerApplicantId_key"
    ON "KycRecord"("provider", "providerApplicantId");
CREATE UNIQUE INDEX "KycRecord_provider_wallet_key"
    ON "KycRecord"("provider", "wallet");
CREATE INDEX "KycRecord_wallet_idx" ON "KycRecord"("wallet");
CREATE INDEX "KycRecord_status_createdAt_idx" ON "KycRecord"("status", "createdAt");
