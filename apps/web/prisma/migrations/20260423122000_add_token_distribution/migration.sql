-- Distribution + per-holder allocation tables for the on-chain
-- DividendDistributor. The Merkle root is anchored on chain; allocations
-- are kept off-chain so we can serve proofs to claimants.
CREATE TABLE "TokenDistribution" (
    "id" TEXT NOT NULL,
    "tokenizedAssetId" TEXT NOT NULL,
    "distId" INTEGER NOT NULL,
    "chainId" INTEGER NOT NULL,
    "distributorAddress" TEXT NOT NULL,
    "quoteAssetAddress" TEXT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "totalAmount" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "reclaimAfter" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenDistribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TokenDistribution_tokenizedAssetId_distId_key"
    ON "TokenDistribution"("tokenizedAssetId", "distId");
CREATE INDEX "TokenDistribution_status_createdAt_idx"
    ON "TokenDistribution"("status", "createdAt");

CREATE TABLE "TokenDistributionAllocation" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "holderAddress" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "proof" JSONB NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenDistributionAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TokenDistributionAllocation_distributionId_holderAddress_key"
    ON "TokenDistributionAllocation"("distributionId", "holderAddress");
CREATE INDEX "TokenDistributionAllocation_holderAddress_idx"
    ON "TokenDistributionAllocation"("holderAddress");

ALTER TABLE "TokenDistributionAllocation"
    ADD CONSTRAINT "TokenDistributionAllocation_distributionId_fkey"
    FOREIGN KEY ("distributionId") REFERENCES "TokenDistribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
