-- Quantified IC-style asset risk register: likelihood × impact, optional
-- quantified IRR/value effect, mitigant, and residual posture after mitigation.
--
-- NOTE: `prisma migrate dev` also emits a spurious
--   DROP INDEX "DocumentEmbedding_embedding_hnsw_idx";
-- because Prisma 5 cannot represent the pgvector HNSW index on the
-- Unsupported("vector(...)") column. That DROP is intentionally omitted here
-- (the index is created in 20260429150000 and must survive) — the CI drift
-- guard strips the same false-positive.

-- CreateTable
CREATE TABLE "AssetRiskRegisterEntry" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "category" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "likelihood" "RiskSeverity" NOT NULL DEFAULT 'MEDIUM',
    "impact" "RiskSeverity" NOT NULL DEFAULT 'MEDIUM',
    "irrImpactBps" INTEGER,
    "valueImpactKrw" DOUBLE PRECISION,
    "mitigant" TEXT,
    "residualLikelihood" "RiskSeverity",
    "residualImpact" "RiskSeverity",
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetRiskRegisterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetRiskRegisterEntry_assetId_status_idx" ON "AssetRiskRegisterEntry"("assetId", "status");

-- AddForeignKey
ALTER TABLE "AssetRiskRegisterEntry" ADD CONSTRAINT "AssetRiskRegisterEntry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
