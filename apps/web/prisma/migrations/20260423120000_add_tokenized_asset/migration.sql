-- Tokenization deployment manifest: one row per asset for which an AssetToken stack is deployed.
CREATE TABLE "TokenizedAsset" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "registryAssetId" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "identityRegistryAddress" TEXT NOT NULL,
    "complianceAddress" TEXT NOT NULL,
    "maxHoldersModuleAddress" TEXT,
    "countryRestrictModuleAddress" TEXT,
    "lockupModuleAddress" TEXT,
    "deploymentBlock" INTEGER NOT NULL,
    "deploymentTxHash" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenizedAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TokenizedAsset_assetId_key" ON "TokenizedAsset"("assetId");
CREATE INDEX "TokenizedAsset_chainId_tokenAddress_idx" ON "TokenizedAsset"("chainId", "tokenAddress");
CREATE INDEX "TokenizedAsset_registryAssetId_idx" ON "TokenizedAsset"("registryAssetId");

ALTER TABLE "TokenizedAsset"
    ADD CONSTRAINT "TokenizedAsset_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
